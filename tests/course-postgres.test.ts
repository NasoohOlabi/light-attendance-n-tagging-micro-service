import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { createHandler } from '../functions/notebook-service'
import { makeEvent, projectEvents } from '../shared/ledger'
import { courseBoardSchema, neonSnapshotSchema, neonStudentAttendanceSchema } from '../shared/neon'

const databaseUrl = process.env.TEST_RAILWAY_DATABASE_URL
const integration = databaseUrl ? test : test.skip

integration(
  'Postgres persists independent course enrollments and enforces attendance ownership',
  async () => {
    if (!databaseUrl) throw new Error('Disposable database is required')
    const pool = new Pool({ connectionString: databaseUrl })
    const adminId = crypto.randomUUID()
    const teacherId = crypto.randomUUID()
    const otherTeacherId = crypto.randomUUID()
    const studentId = crypto.randomUUID()
    const otherStudentId = crypto.randomUUID()
    const courseIds = [crypto.randomUUID(), crypto.randomUUID()]
    const enrollmentIds = [crypto.randomUUID(), crypto.randomUUID()]
    const otherEnrollmentId = crypto.randomUUID()
    const subjects = {
      admin: `course-admin-${adminId}`,
      teacher: `course-teacher-${teacherId}`,
      student: `course-student-${studentId}`,
    }
    const handler = createHandler(pool, async (token) => token, ['https://course.example'])
    const call = async (path: string, subject: string, body?: unknown) =>
      handler(
        new Request(`https://course.example${path}`, {
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            authorization: `Bearer ${subject}`,
            origin: 'https://course.example',
            'content-type': 'application/json',
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      )
    try {
      const migration = await readFile(new URL('../neon/003-courses.sql', import.meta.url), 'utf8')
      await pool.query(migration)
      await pool.query(migration)
      const activeMigration = await readFile(
        new URL('../neon/005-active-enrollments.sql', import.meta.url),
        'utf8',
      )
      await pool.query(activeMigration)
      await pool.query(activeMigration)
      const courseMigration = await readFile(
        new URL('../neon/006-closed-courses.sql', import.meta.url),
        'utf8',
      )
      await pool.query(courseMigration)
      await pool.query(courseMigration)
      const profileMigration = await readFile('neon/007-student-profiles-handbooks.sql', 'utf8')
      await pool.query(profileMigration)
      await pool.query(profileMigration)
      for (const [id, subject] of [
        [adminId, subjects.admin],
        [teacherId, subjects.teacher],
        [otherTeacherId, `other-${otherTeacherId}`],
      ]) {
        await pool.query(
          "INSERT INTO teachers (id, auth_user_id, name, access_mode) VALUES ($1, $2, 'Synthetic course teacher', 'read_write')",
          [id, subject],
        )
      }
      await pool.query(
        "INSERT INTO students (id, teacher_id, name) VALUES ($1, $2, 'Synthetic enrolled student'), ($3, $4, 'Synthetic other student')",
        [studentId, teacherId, otherStudentId, otherTeacherId],
      )
      await pool.query(
        "INSERT INTO app_accounts (auth_user_id, role, teacher_id, student_id) VALUES ($1, 'administrator', $2, NULL), ($3, 'teacher', $4, NULL), ($5, 'student', NULL, $6)",
        [subjects.admin, adminId, subjects.teacher, teacherId, subjects.student, studentId],
      )
      for (let i = 0; i < courseIds.length; i++) {
        const response = await call('/api/admin/courses', subjects.admin, {
          id: courseIds[i],
          name: `Synthetic course ${i + 1}`,
          open: true,
        })
        expect(response.status, await response.clone().text()).toBe(200)
        const withoutEnrollment = neonSnapshotSchema.parse(
          await (await call('/api/notebook', subjects.admin)).json(),
        )
        expect(withoutEnrollment.courses).toContainEqual({
          id: courseIds[i],
          name: `Synthetic course ${i + 1}`,
          open: true,
        })
        const enrolled = await call('/api/admin/enrollments', subjects.admin, {
          id: enrollmentIds[i],
          courseId: courseIds[i],
          studentId,
          level: `Level ${i + 1}`,
          practical: i === 0 ? 0 : null,
          theory: i === 0 ? 100 : 50,
        })
        expect(enrolled.status, await enrolled.clone().text()).toBe(200)
      }
      expect(
        (
          await call('/api/admin/enrollments/handbook', subjects.teacher, {
            id: enrollmentIds[0],
            handbookReceived: true,
          })
        ).status,
      ).toBe(403)
      expect(
        (
          await call('/api/admin/enrollments/handbook', subjects.admin, {
            id: enrollmentIds[0],
            handbookReceived: true,
            level: 'illegal',
          })
        ).status,
      ).toBe(400)
      expect(
        (
          await call('/api/admin/enrollments/handbook', subjects.admin, {
            id: enrollmentIds[0],
            handbookReceived: true,
          })
        ).status,
      ).toBe(200)
      expect(
        (
          await pool.query(
            'SELECT handbook_received FROM course_enrollments WHERE id = ANY($1::uuid[]) ORDER BY handbook_received DESC',
            [enrollmentIds],
          )
        ).rows,
      ).toEqual([{ handbook_received: true }, { handbook_received: false }])
      expect(
        (
          await call('/api/admin/enrollments', subjects.admin, {
            id: otherEnrollmentId,
            courseId: courseIds[0],
            studentId: otherStudentId,
            level: 'Other student private level',
            practical: 12,
            theory: 34,
          })
        ).status,
      ).toBe(200)
      const teacherSnapshot = neonSnapshotSchema.parse(
        await (await call('/api/notebook', subjects.teacher)).json(),
      )
      expect(teacherSnapshot.enrollments).toHaveLength(2)
      expect(
        teacherSnapshot.enrollments.find((entry) => entry.id === enrollmentIds[0]),
      ).toMatchObject({ practical: 0, theory: 100 })
      const updated = await call('/api/admin/enrollments', subjects.admin, {
        id: enrollmentIds[0],
        courseId: courseIds[0],
        studentId,
        level: 'Advanced',
        practical: 75.5,
        theory: 100,
      })
      expect(updated.status, await updated.clone().text()).toBe(200)
      const board = courseBoardSchema.parse(
        await (await call('/api/notebook', subjects.admin)).json(),
      )
      expect(
        board.enrollments.find(
          (entry) => entry.courseId === courseIds[0] && entry.studentId === studentId,
        ),
      ).toMatchObject({ id: enrollmentIds[0], level: 'Advanced', practical: 75.5, theory: 100 })
      expect(
        (
          await call('/api/admin/enrollments', subjects.admin, {
            id: crypto.randomUUID(),
            courseId: courseIds[0],
            studentId,
            level: '',
            practical: null,
            theory: null,
          })
        ).status,
      ).toBe(409)
      for (const practical of [-1, 101]) {
        expect(
          (
            await call('/api/admin/enrollments', subjects.admin, {
              id: enrollmentIds[0],
              courseId: courseIds[0],
              studentId,
              level: '',
              practical,
              theory: null,
            })
          ).status,
        ).toBe(400)
      }
      const first = makeEvent('Synthetic course teacher', {
        kind: 'attendance',
        studentId,
        enrollmentId: enrollmentIds[0],
        date: '2026-11-16',
        status: 'present',
      })
      const second = makeEvent('Synthetic course teacher', {
        kind: 'attendance',
        studentId,
        enrollmentId: enrollmentIds[1],
        date: '2026-11-16',
        status: 'absent',
      })
      const saved = await call('/api/events', subjects.teacher, { events: [first, second] })
      expect(saved.status, await saved.clone().text()).toBe(200)
      expect(
        projectEvents(neonSnapshotSchema.parse(await saved.json()).events).attendance,
      ).toHaveLength(2)
      expect(
        (await call('/api/events', subjects.teacher, { events: [first, second] })).status,
      ).toBe(200)
      const membership = {
        id: enrollmentIds[0],
        courseId: courseIds[0],
        studentId,
        level: 'Changed',
        active: false,
      }
      for (const subject of [subjects.teacher, subjects.student]) {
        for (const path of [
          '/api/admin/enrollments/membership',
          '/api/admin/enrollments/grades',
          '/api/admin/students/enroll',
        ])
          expect((await call(path, subject, {})).status).toBe(403)
      }
      expect(
        (await call('/api/admin/enrollments/membership', subjects.admin, membership)).status,
      ).toBe(200)
      expect(
        (
          await pool.query(
            'SELECT level, practical::float8, theory::float8 FROM course_enrollments WHERE id = $1',
            [enrollmentIds[0]],
          )
        ).rows[0],
      ).toEqual({ level: 'Changed', practical: 75.5, theory: 100 })
      const inactiveCorrection = makeEvent('Synthetic course teacher', {
        kind: 'reversal',
        targetId: first.id,
        reason: 'Synthetic correction while inactive',
      })
      expect(
        (await call('/api/events', subjects.teacher, { events: [inactiveCorrection] })).status,
      ).toBe(200)
      expect((await call('/api/events', subjects.teacher, { events: [first] })).status).toBe(200)
      const inactiveMark = makeEvent('Synthetic course teacher', {
        kind: 'attendance',
        studentId,
        enrollmentId: enrollmentIds[0],
        status: 'present',
        date: '2026-11-18',
      })
      expect((await call('/api/events', subjects.teacher, { events: [inactiveMark] })).status).toBe(
        403,
      )
      expect(
        (
          await call('/api/admin/enrollments/grades', subjects.admin, {
            id: enrollmentIds[0],
            practical: 0,
            theory: null,
          })
        ).status,
      ).toBe(200)
      expect(
        (
          await call('/api/admin/enrollments', subjects.admin, {
            ...membership,
            active: undefined,
            practical: 0,
            theory: null,
          })
        ).status,
      ).toBe(200)
      let row = (
        await pool.query(
          'SELECT id, level, active, practical::float8, theory::float8 FROM course_enrollments WHERE id = $1',
          [enrollmentIds[0]],
        )
      ).rows[0]
      expect(row).toEqual({
        id: enrollmentIds[0],
        level: 'Changed',
        active: false,
        practical: 0,
        theory: null,
      })
      expect(
        (
          await call('/api/admin/enrollments/membership', subjects.admin, {
            ...membership,
            active: true,
          })
        ).status,
      ).toBe(200)
      row = (
        await pool.query(
          'SELECT id, level, active, practical::float8, theory::float8 FROM course_enrollments WHERE id = $1',
          [enrollmentIds[0]],
        )
      ).rows[0]
      expect(row).toEqual({
        id: enrollmentIds[0],
        level: 'Changed',
        active: true,
        practical: 0,
        theory: null,
      })
      expect(
        (
          await call('/api/admin/enrollments/grades', subjects.admin, {
            id: crypto.randomUUID(),
            practical: 0,
            theory: 0,
          })
        ).status,
      ).toBe(400)
      const newStudent = crypto.randomUUID()
      const newEnrollment = crypto.randomUUID()
      const combined = {
        student: {
          studentId: newStudent,
          teacherId,
          name: 'Synthetic new student',
          whatsapp: '+963 (123) 456',
          location: 'Synthetic area',
          birthYear: 2000,
          group: '',
          active: true,
        },
        enrollment: { id: newEnrollment, courseId: crypto.randomUUID(), level: '' },
      }
      expect((await call('/api/admin/students/enroll', subjects.admin, combined)).status).toBe(400)
      expect(
        (await pool.query('SELECT id FROM students WHERE id = $1', [newStudent])).rowCount,
      ).toBe(0)
      combined.enrollment.courseId = courseIds[0]
      expect((await call('/api/admin/students/enroll', subjects.admin, combined)).status).toBe(200)
      expect((await call('/api/admin/students/enroll', subjects.admin, combined)).status).toBe(200)
      expect(
        (await pool.query('SELECT id FROM course_enrollments WHERE student_id = $1', [newStudent]))
          .rowCount,
      ).toBe(1)
      expect(
        (
          await pool.query('SELECT whatsapp, location, birth_year FROM students WHERE id = $1', [
            newStudent,
          ])
        ).rows[0],
      ).toEqual({ whatsapp: '+963 (123) 456', location: 'Synthetic area', birth_year: 2000 })
      expect(
        (
          await call('/api/admin/students', subjects.admin, {
            studentId: newStudent,
            teacherId,
            name: 'Synthetic new student',
            group: '',
            active: true,
          })
        ).status,
      ).toBe(200)
      expect(
        (await pool.query('SELECT birth_year FROM students WHERE id = $1', [newStudent])).rows[0]
          .birth_year,
      ).toBe(2000)
      expect(
        (
          await call('/api/admin/students', subjects.admin, {
            studentId: newStudent,
            teacherId,
            name: 'Synthetic new student',
            group: '',
            active: true,
            birthYear: null,
            whatsapp: '',
            location: null,
          })
        ).status,
      ).toBe(200)
      expect(
        (
          await pool.query('SELECT whatsapp, location, birth_year FROM students WHERE id = $1', [
            newStudent,
          ])
        ).rows[0],
      ).toEqual({ whatsapp: null, location: null, birth_year: null })
      expect(
        (
          await pool.query('SELECT handbook_received FROM course_enrollments WHERE id = $1', [
            enrollmentIds[0],
          ])
        ).rows[0].handbook_received,
      ).toBe(true)
      const privateResponse = JSON.stringify(
        await (await call('/api/student/attendance', subjects.student)).json(),
      )
      expect(privateResponse).not.toContain('birthYear')
      expect(privateResponse).not.toContain('whatsapp')
      expect(privateResponse).not.toContain('location')
      await pool.query('DELETE FROM course_enrollments WHERE student_id = $1', [newStudent])
      await pool.query('DELETE FROM students WHERE id = $1', [newStudent])
      const count = await pool.query(
        'SELECT enrollment_id FROM events WHERE student_id = $1 ORDER BY sequence',
        [studentId],
      )
      expect(count.rows.map((row) => row.enrollment_id)).toEqual([
        ...enrollmentIds,
        enrollmentIds[0],
      ])
      const unscoped = makeEvent('Synthetic course teacher', {
        kind: 'attendance',
        studentId,
        date: '2026-11-17',
        status: 'present',
      })
      expect((await call('/api/events', subjects.teacher, { events: [unscoped] })).status).toBe(403)
      const mismatched = makeEvent('Synthetic course teacher', {
        kind: 'attendance',
        studentId: otherStudentId,
        enrollmentId: enrollmentIds[0],
        date: '2026-11-16',
        status: 'present',
      })
      expect((await call('/api/events', subjects.teacher, { events: [mismatched] })).status).toBe(
        403,
      )
      const foreignEnrollment = makeEvent('Synthetic course teacher', {
        kind: 'attendance',
        studentId,
        enrollmentId: otherEnrollmentId,
        date: '2026-11-16',
        status: 'present',
      })
      expect(
        (await call('/api/events', subjects.teacher, { events: [foreignEnrollment] })).status,
      ).toBe(403)
      const ownershipError = await pool
        .query(
          "INSERT INTO events (id, teacher_id, student_id, actor, client_time, payload, enrollment_id) VALUES ($1, $2, $3, 'Synthetic', now(), $4::jsonb, $5)",
          [
            crypto.randomUUID(),
            teacherId,
            otherStudentId,
            JSON.stringify(mismatched.payload),
            enrollmentIds[0],
          ],
        )
        .catch((error: unknown) => error)
      expect(ownershipError).toMatchObject({ code: '23503' })
      const scoreError = await pool
        .query('UPDATE course_enrollments SET theory = 101 WHERE id = $1', [enrollmentIds[0]])
        .catch((error: unknown) => error)
      expect(scoreError).toMatchObject({ code: '23514' })
      const studentResponse = await call('/api/student/attendance', subjects.student)
      expect(studentResponse.status).toBe(200)
      const studentBody: unknown = await studentResponse.json()
      expect(Object.keys(Object(studentBody)).sort()).toEqual(['attendance', 'student'])
      const student = neonStudentAttendanceSchema.parse(studentBody)
      expect(student.attendance).toHaveLength(1)
      expect(student.attendance.map((entry) => entry.status)).toEqual(['absent'])
      expect(student.attendance.map((entry) => entry.course)).toEqual(['Synthetic course 2'])
      expect(
        (
          await call('/api/admin/courses', subjects.teacher, {
            id: crypto.randomUUID(),
            name: 'Forbidden',
          })
        ).status,
      ).toBe(403)
      expect(
        (
          await call('/api/admin/courses/status', subjects.teacher, {
            id: courseIds[0],
            open: false,
          })
        ).status,
      ).toBe(403)
      expect(
        (
          await call('/api/admin/courses/status', subjects.student, {
            id: courseIds[0],
            open: false,
          })
        ).status,
      ).toBe(403)
      expect(
        (await call('/api/admin/courses/status', subjects.admin, { id: courseIds[0], open: false }))
          .status,
      ).toBe(200)
      expect(
        (
          await call('/api/admin/courses', subjects.admin, {
            id: courseIds[0],
            name: 'Synthetic course 1',
          })
        ).status,
      ).toBe(200)
      const closedBoard = neonSnapshotSchema.parse(
        await (await call('/api/notebook', subjects.teacher)).json(),
      )
      expect(closedBoard.courses.find((course) => course.id === courseIds[0])?.open).toBe(false)
      expect(closedBoard.enrollments.find((entry) => entry.id === enrollmentIds[0])).toMatchObject({
        practical: 0,
        theory: null,
      })
      expect((await call('/api/events', subjects.teacher, { events: [first] })).status).toBe(200)
      const stale = makeEvent('Synthetic course teacher', {
        kind: 'attendance',
        studentId,
        enrollmentId: enrollmentIds[0],
        date: '2026-12-01',
        status: 'present',
      })
      expect((await call('/api/events', subjects.teacher, { events: [stale] })).status).toBe(403)
      const correction = makeEvent('Synthetic course teacher', {
        kind: 'reversal',
        targetId: first.id,
        reason: 'Synthetic correction',
      })
      const corrected = await call('/api/events', subjects.teacher, { events: [correction] })
      expect(corrected.status, await corrected.clone().text()).toBe(200)
      const effective = projectEvents(
        neonSnapshotSchema.parse(await corrected.json()).events,
      ).attendance
      expect(effective).toHaveLength(1)
      expect(effective[0]?.value.enrollmentId).toBe(enrollmentIds[1])
      expect(
        (await call('/api/admin/courses/status', subjects.admin, { id: courseIds[0], open: true }))
          .status,
      ).toBe(200)
      expect((await call('/api/events', subjects.teacher, { events: [stale] })).status).toBe(200)
    } finally {
      await pool.query('DELETE FROM events WHERE student_id = ANY($1::uuid[])', [
        [studentId, otherStudentId],
      ])
      await pool.query('DELETE FROM course_enrollments WHERE student_id = ANY($1::uuid[])', [
        [studentId, otherStudentId],
      ])
      await pool.query('DELETE FROM courses WHERE id = ANY($1::uuid[])', [courseIds])
      await pool.query('DELETE FROM app_accounts WHERE auth_user_id = ANY($1::text[])', [
        Object.values(subjects),
      ])
      await pool.query('DELETE FROM students WHERE id = ANY($1::uuid[])', [
        [studentId, otherStudentId],
      ])
      await pool.query('DELETE FROM teachers WHERE id = ANY($1::uuid[])', [
        [adminId, teacherId, otherTeacherId],
      ])
      await pool.end()
    }
  },
  30000,
)
