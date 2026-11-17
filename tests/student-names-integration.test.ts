import { expect, test } from 'bun:test'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { z } from 'zod'
import { createHandler } from '../functions/notebook-service'
import { neonAdminBoardSchema, neonSnapshotSchema } from '../shared/neon'
import { makeEvent } from '../shared/ledger'

// Only point this at a disposable database; the test applies application migrations.
const databaseUrl = process.env.TEST_STUDENT_NAMES_DATABASE_URL
const integration = databaseUrl ? test : test.skip

integration('student names survive migration, structured saves and legacy writes', async () => {
  const pool = new Pool({ connectionString: databaseUrl })
  const admin = crypto.randomUUID()
  const teacher = crypto.randomUUID()
  const student = crypto.randomUUID()
  const rosterCourseIds = Array.from({ length: 4 }, () => crypto.randomUUID())
  let migrated = false
  let addedBanColumn = false
  const exportPath = `.local/student-names-${student}.json`
  const bannedPath = `.local/student-names-banned-${student}.json`
  const importPath = `.local/student-profile-import-${student}.json`
  try {
    for (const file of [
      'railway/001-auth.sql',
      'neon/001-notebook.sql',
      'neon/002-application-roles.sql',
    ])
      await pool.query((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
    migrated = true
    await pool.query('INSERT INTO neon_auth."user" (id, name, email) VALUES ($1, $2, $3)', [
      admin,
      'Synthetic admin',
      `${admin}@example.test`,
    ])
    await pool.query(
      "INSERT INTO teachers (id, auth_user_id, name, access_mode) VALUES ($1, $2, 'Synthetic admin', 'read_write'), ($3, $4, 'Synthetic teacher', 'read_write')",
      [admin, admin, teacher, teacher],
    )
    await pool.query(
      "INSERT INTO app_accounts (auth_user_id, role, teacher_id) VALUES ($1::text, 'administrator', $1::uuid), ($2::text, 'teacher', $2::uuid)",
      [admin, teacher],
    )
    await pool.query(
      "INSERT INTO students (id, teacher_id, name, group_name) VALUES ($1, $2, 'Legacy Full Name', 'Level A')",
      [student, teacher],
    )
    const migration = await readFile('neon/004-student-names.sql', 'utf8')
    await pool.query(migration)
    await pool.query(migration)
    for (const file of [
      'neon/003-courses.sql',
      'neon/005-active-enrollments.sql',
      'neon/006-closed-courses.sql',
      'neon/007-student-profiles-handbooks.sql',
      'neon/008-course-grading.sql',
      'neon/009-unassigned-students.sql',
      'neon/009-unassigned-students.sql',
    ])
      await pool.query(await readFile(file, 'utf8'))
    const handler = createHandler(pool, async () => admin, ['https://app.example'])
    const call = (body?: unknown) =>
      handler(
        new Request(`https://app.example/api/admin${body ? '/students' : ''}`, {
          method: body ? 'POST' : 'GET',
          headers: {
            Authorization: 'Bearer synthetic',
            Origin: 'https://app.example',
            'content-type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
      )
    const before = neonAdminBoardSchema.parse(await (await call()).json())
    expect(before.students.find((item) => item.studentId === student)).toMatchObject({
      name: 'Legacy Full Name',
      firstName: 'Legacy Full Name',
      lastName: '',
    })
    const fields = { studentId: student, teacherId: teacher, group: 'Level A', active: true }
    expect((await call({ ...fields, firstName: '  ', lastName: '' })).status).toBe(400)
    expect(
      (await call({ ...fields, firstName: 'First', lastName: '', name: 'Other' })).status,
    ).toBe(400)
    expect((await call({ ...fields, firstName: 'x'.repeat(200), lastName: 'y' })).status).toBe(400)
    expect(
      (await call({ ...fields, firstName: '  First Middle ', lastName: ' Last  ' })).status,
    ).toBe(200)
    expect(
      (
        await pool.query('SELECT name, first_name, last_name FROM students WHERE id = $1', [
          student,
        ])
      ).rows[0],
    ).toEqual({ name: 'First Middle Last', first_name: 'First Middle', last_name: 'Last' })
    // An inactive or unapproved existing assignment can be preserved, but not newly assigned.
    await pool.query('UPDATE teachers SET active = false WHERE id = $1', [teacher])
    await pool.query('DELETE FROM app_accounts WHERE auth_user_id = $1', [teacher])
    expect(
      neonAdminBoardSchema
        .parse(await (await call()).json())
        .teachers.find((item) => item.teacherId === teacher),
    ).toMatchObject({ active: false })
    expect((await call({ ...fields, firstName: 'Existing', lastName: '' })).status).toBe(200)
    expect(
      (await call({ ...fields, teacherId: null, firstName: 'Unassigned', lastName: '' })).status,
    ).toBe(200)
    expect(
      neonAdminBoardSchema
        .parse(await (await call()).json())
        .students.find((item) => item.studentId === student)?.teacherId,
    ).toBeNull()
    expect((await call({ ...fields, firstName: 'Reassigned', lastName: '' })).status).toBe(400)
    await pool.query('UPDATE teachers SET active = true WHERE id = $1', [teacher])
    await pool.query(
      "INSERT INTO app_accounts (auth_user_id, role, teacher_id) VALUES ($1::text, 'teacher', $1::uuid)",
      [teacher],
    )
    const teacherHandler = createHandler(pool, async () => teacher, ['https://app.example'])
    const notebook = await teacherHandler(
      new Request('https://app.example/api/notebook', {
        headers: { Authorization: 'Bearer synthetic', Origin: 'https://app.example' },
      }),
    )
    expect(notebook.status).toBe(200)
    expect(JSON.stringify(await notebook.json())).not.toContain(student)
    expect((await call({ ...fields, firstName: 'First Middle', lastName: 'Last' })).status).toBe(
      200,
    )
    await mkdir('.local', { recursive: true })
    const exportBackup = async (path: string) => {
      const child = Bun.spawn([process.execPath, 'scripts/railway-transfer.ts', 'export', path], {
        env: { ...process.env, DATABASE_URL_UNPOOLED: databaseUrl },
        stdout: 'ignore',
        stderr: 'ignore',
      })
      return child.exited
    }
    expect(
      (await call({ ...fields, teacherId: null, firstName: 'First Middle', lastName: 'Last' }))
        .status,
    ).toBe(200)
    expect(await exportBackup(exportPath)).toBe(0)
    const compare = Bun.spawn(
      [process.execPath, 'scripts/railway-transfer.ts', 'compare', exportPath],
      {
        env: { ...process.env, MIGRATION_TARGET_DATABASE_URL: databaseUrl },
        stdout: 'ignore',
        stderr: 'ignore',
      },
    )
    expect(await compare.exited).toBe(0)
    const backup = z
      .object({
        version: z.union([
          z.literal(2),
          z.literal(3),
          z.literal(4),
          z.literal(5),
          z.literal(6),
          z.literal(7),
          z.literal(8),
        ]),
        tables: z.array(
          z.object({
            name: z.string(),
            rows: z.array(z.record(z.string(), z.unknown())),
          }),
        ),
      })
      .parse(JSON.parse(await readFile(exportPath, 'utf8')))
    expect(backup.version).toBe(8)
    expect(
      backup.tables
        .find((table) => table.name === 'public.students')
        ?.rows.find((row) => row.id === student),
    ).toMatchObject({ first_name: 'First Middle', last_name: 'Last', teacher_id: null })
    expect((await call({ ...fields, firstName: 'First Middle', lastName: 'Last' })).status).toBe(
      200,
    )
    const columns = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema = 'neon_auth' AND table_name = 'user' AND column_name = 'banned'",
    )
    if (!columns.rows.length) {
      await pool.query('ALTER TABLE neon_auth."user" ADD COLUMN banned boolean DEFAULT false')
      addedBanColumn = true
    }
    await pool.query('UPDATE neon_auth."user" SET banned = true WHERE id = $1', [admin])
    expect(await exportBackup(bannedPath)).toBe(1)
    await pool.query('UPDATE neon_auth."user" SET banned = false WHERE id = $1', [admin])
    expect((await call({ ...fields, group: 'Level B', name: 'First Middle Last' })).status).toBe(
      200,
    )
    expect(
      (await pool.query('SELECT first_name, last_name FROM students WHERE id = $1', [student]))
        .rows[0],
    ).toEqual({ first_name: 'First Middle', last_name: 'Last' })
    expect((await call({ ...fields, name: 'Replacement Legacy Name' })).status).toBe(200)
    const after = neonAdminBoardSchema.parse(await (await call()).json())
    expect(after.students.find((item) => item.studentId === student)).toMatchObject({
      name: 'Replacement Legacy Name',
      firstName: 'Replacement Legacy Name',
      lastName: '',
    })
    expect(
      (await pool.query('SELECT first_name, last_name FROM students WHERE id = $1', [student]))
        .rows[0],
    ).toEqual({ first_name: null, last_name: null })
    const importRoster = async (profile: object) => {
      await writeFile(
        importPath,
        JSON.stringify([
          {
            id: student,
            teacherId: teacher,
            name: 'Replacement Legacy Name',
            group: 'Level A',
            active: true,
            ...profile,
          },
        ]),
      )
      const child = Bun.spawn(
        [process.execPath, 'scripts/neon-admin.ts', 'students', 'upsert', importPath],
        {
          env: { ...process.env, DATABASE_URL_UNPOOLED: databaseUrl },
          stdout: 'ignore',
          stderr: 'ignore',
        },
      )
      expect(await child.exited).toBe(0)
    }
    const profile = { whatsapp: '+٩٦٣ 123', location: 'Synthetic area', birthYear: 2000 }
    await importRoster(profile)
    await importRoster({})
    const staffHeaders = { Authorization: 'Bearer synthetic', Origin: 'https://app.example' }
    const assignedContact = neonSnapshotSchema.parse(
      await (
        await teacherHandler(
          new Request('https://app.example/api/notebook', { headers: staffHeaders }),
        )
      ).json(),
    )
    expect(assignedContact.students.find((s) => s.studentId === student)).toMatchObject({
      firstName: 'Replacement Legacy Name',
      lastName: '',
      whatsapp: profile.whatsapp,
    })
    await pool.query(
      "UPDATE app_accounts SET role = 'student', teacher_id = NULL, student_id = $2 WHERE auth_user_id = $1",
      [teacher, student],
    )
    const ownResponse = await teacherHandler(
      new Request('https://app.example/api/student/attendance', { headers: staffHeaders }),
    )
    expect(ownResponse.status).toBe(200)
    const ownAttendance = z
      .object({ student: z.record(z.string(), z.unknown()) })
      .passthrough()
      .parse(await ownResponse.json())
    expect(ownAttendance.student).not.toHaveProperty('whatsapp')
    expect(ownAttendance.student).not.toHaveProperty('firstName')
    expect(JSON.stringify(ownAttendance)).not.toContain(profile.whatsapp)
    expect(
      (
        await teacherHandler(
          new Request('https://app.example/api/notebook', { headers: staffHeaders }),
        )
      ).status,
    ).toBe(403)
    await pool.query(
      "UPDATE app_accounts SET role = 'teacher', teacher_id = $1::uuid, student_id = NULL WHERE auth_user_id = $1::text",
      [teacher],
    )
    expect(
      (
        await pool.query('SELECT whatsapp, location, birth_year FROM students WHERE id = $1', [
          student,
        ])
      ).rows[0],
    ).toEqual({
      whatsapp: profile.whatsapp,
      location: profile.location,
      birth_year: profile.birthYear,
    })
    await importRoster({ teacherId: null, whatsapp: '', location: null, birthYear: null })
    expect(
      (await pool.query('SELECT teacher_id FROM students WHERE id = $1', [student])).rows[0]
        .teacher_id,
    ).toBeNull()
    expect(
      (
        await pool.query('SELECT whatsapp, location, birth_year FROM students WHERE id = $1', [
          student,
        ])
      ).rows[0],
    ).toEqual({ whatsapp: null, location: null, birth_year: null })
    const readNotebook = () =>
      handler(
        new Request('https://app.example/api/notebook', {
          headers: { Authorization: 'Bearer synthetic', Origin: 'https://app.example' },
        }),
      )
    const post = (event: ReturnType<typeof makeEvent>) =>
      handler(
        new Request('https://app.example/api/events', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer synthetic',
            Origin: 'https://app.example',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ events: [event] }),
        }),
      )
    const savedNote = makeEvent('Synthetic admin', {
      kind: 'note',
      studentId: student,
      date: '2026-11-17',
      tags: ['synthetic'],
      text: 'Synthetic retry',
    })
    expect((await post(savedNote)).status).toBe(200)
    expect((await post(savedNote)).status).toBe(200)
    for (const [index, courseId] of rosterCourseIds.entries()) {
      await pool.query('INSERT INTO courses(id,name,open) VALUES($1,$2,$3)', [
        courseId,
        `Synthetic roster course ${index + 1}`,
        index !== 0,
      ])
      await pool.query(
        'INSERT INTO course_enrollments(id,course_id,student_id,level) VALUES($1,$2,$3,$4)',
        [crypto.randomUUID(), courseId, student, `Independent course level ${index + 1}`],
      )
    }
    const attendanceEnrollment = z
      .object({ id: z.uuid() })
      .parse(
        (
          await pool.query(
            'SELECT id FROM course_enrollments WHERE course_id = $1 AND student_id = $2',
            [rosterCourseIds[1], student],
          )
        ).rows[0],
      )
    const savedMark = makeEvent('Synthetic admin', {
      kind: 'attendance',
      studentId: student,
      enrollmentId: attendanceEnrollment.id,
      date: '2026-11-17',
      status: 'present',
    })
    expect((await post(savedMark)).status).toBe(200)
    expect((await post(savedMark)).status).toBe(200)
    await pool.query('UPDATE students SET active = false WHERE id = $1', [student])
    const completeRoster = neonSnapshotSchema.parse(await (await readNotebook()).json())
    expect(completeRoster.events.some((e) => e.id === savedMark.id)).toBe(true)
    expect(completeRoster.students.find((s) => s.studentId === student)).toMatchObject({
      active: false,
    })
    expect(
      completeRoster.enrollments
        .filter((e) => e.studentId === student)
        .map((e) => e.courseId)
        .sort(),
    ).toEqual([...rosterCourseIds].sort())
    expect(completeRoster.courses.find((c) => c.id === rosterCourseIds[0])).toMatchObject({
      open: false,
    })
    for (const event of [
      makeEvent('Synthetic admin', {
        kind: 'attendance',
        studentId: student,
        date: '2026-11-17',
        status: 'present',
      }),
      makeEvent('Synthetic admin', {
        kind: 'note',
        studentId: student,
        date: '2026-11-17',
        tags: ['synthetic'],
        text: 'Must be denied',
      }),
    ])
      expect((await post(event)).status).toBe(403)
    expect(
      (
        await pool.query('SELECT count(*)::int AS count FROM events WHERE student_id = $1', [
          student,
        ])
      ).rows[0].count,
    ).toBe(2)
    const teacherNotebook = await teacherHandler(
      new Request('https://app.example/api/notebook', {
        headers: { Authorization: 'Bearer synthetic', Origin: 'https://app.example' },
      }),
    )
    expect(
      neonSnapshotSchema
        .parse(await teacherNotebook.json())
        .students.some((s) => s.studentId === student),
    ).toBe(false)
  } finally {
    await Promise.all(
      [exportPath, bannedPath, importPath].map(async (path) => {
        try {
          await unlink(path)
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
        }
      }),
    )
    if (migrated) {
      await pool.query('DELETE FROM events WHERE student_id = $1', [student])
      await pool.query('DELETE FROM course_enrollments WHERE student_id = $1', [student])
      await pool.query('DELETE FROM courses WHERE id = ANY($1::uuid[])', [rosterCourseIds])
      await pool.query('DELETE FROM app_accounts WHERE auth_user_id = ANY($1::text[])', [
        [admin, teacher],
      ])
      await pool.query('DELETE FROM students WHERE id = $1', [student])
      await pool.query('DELETE FROM teachers WHERE id = ANY($1::uuid[])', [[admin, teacher]])
      await pool.query('DELETE FROM neon_auth."user" WHERE id = $1', [admin])
      if (addedBanColumn) await pool.query('ALTER TABLE neon_auth."user" DROP COLUMN banned')
    }
    await pool.end()
  }
})
