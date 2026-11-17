import { z } from 'zod'
import { hashPassword } from 'better-auth/crypto'
import type { Pool, PoolClient } from 'pg'
import {
  courseBoardSchema,
  courseInputSchema,
  courseStatusSchema,
  courseSettingsSchema,
  enrollmentSchema,
  enrollmentMembershipSchema,
  enrollmentHandbookSchema,
  enrollmentGradesSchema,
  neonAdminBoardSchema,
  neonAdminDisableSchema,
  neonAdminGrantSchema,
  neonAdminPasswordResetSchema,
  neonAdminStudentSchema,
  neonAdminStudentEnrollSchema,
  neonBatchSchema,
  neonSnapshotSchema,
  neonStudentAttendanceSchema,
  neonTeacherSchema,
} from '../shared/neon'
import { eventSchema, projectEvents } from '../shared/ledger'
import { validateAssignedPayloads } from '../shared/roster'

const teacherRow = z.object({
  id: z.uuid(),
  name: z.string(),
  active: z.boolean(),
  access_mode: z.enum(['read_write', 'read_only', 'write_only']),
  expires_at: z.date().nullable(),
})
const studentRow = z.object({
  id: z.uuid(),
  name: z.string(),
  group_name: z.string(),
  active: z.boolean(),
})
const eventRow = z.object({
  id: z.uuid(),
  actor: z.string(),
  client_time: z.date(),
  received_at: z.date(),
  payload: z.unknown(),
})
class HttpError extends Error {
  constructor(public status: number) {
    super()
  }
}

async function courseBoard(db: PoolClient, teacher: z.infer<typeof neonTeacherSchema>) {
  const scope = teacher.role === 'administrator' ? 's.active' : 's.teacher_id = $1 AND s.active'
  const values = teacher.role === 'administrator' ? [] : [teacher.id]
  const enrollments = (
    await db.query(
      `SELECT ce.id, ce.course_id AS "courseId", ce.student_id AS "studentId", ce.level,
    ce.practical::float8 AS practical, ce.theory::float8 AS theory, ce.active, ce.handbook_received AS "handbookReceived"
    FROM course_enrollments ce JOIN students s ON s.id = ce.student_id WHERE ${scope} ORDER BY ce.id FOR SHARE OF ce`,
      values,
    )
  ).rows
  const courses =
    teacher.role === 'administrator'
      ? (
          await db.query(
            'SELECT id, name, open, attendance_minimum AS "attendanceMinimum", practical_minimum AS "practicalMinimum", theory_minimum AS "theoryMinimum" FROM courses ORDER BY id FOR SHARE',
          )
        ).rows
      : (
          await db.query(
            'SELECT c.id, c.name, c.open, c.attendance_minimum AS "attendanceMinimum", c.practical_minimum AS "practicalMinimum", c.theory_minimum AS "theoryMinimum" FROM courses c WHERE EXISTS (SELECT 1 FROM course_enrollments ce JOIN students s ON s.id = ce.student_id WHERE ce.course_id = c.id AND s.teacher_id = $1 AND s.active) ORDER BY c.id FOR SHARE OF c',
            [teacher.id],
          )
        ).rows
  const board = courseBoardSchema.parse({ courses, enrollments })
  board.courses.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  return board
}

async function snapshot(db: PoolClient, teacher: z.infer<typeof neonTeacherSchema>) {
  const scope = teacher.role === 'administrator' ? 's.active' : 's.teacher_id = $1 AND s.active'
  const values = teacher.role === 'administrator' ? [] : [teacher.id]
  const students = z
    .array(studentRow)
    .parse(
      (
        await db.query(
          `SELECT s.id, s.name, s.group_name, s.active FROM students s WHERE ${scope} ORDER BY s.name, s.id FOR SHARE`,
          values,
        )
      ).rows,
    )
    .map((s) => ({
      kind: 'student' as const,
      studentId: s.id,
      name: s.name,
      group: s.group_name,
      active: s.active,
    }))
  const events = z
    .array(eventRow)
    .parse(
      (
        await db.query(
          `SELECT e.id, e.actor, e.client_time, e.received_at, e.payload FROM events e JOIN students s ON s.id = e.student_id WHERE ${scope} ORDER BY e.sequence`,
          values,
        )
      ).rows,
    )
    .map((e) =>
      eventSchema.parse({
        id: e.id,
        actor: e.actor,
        clientTime: e.client_time.toISOString(),
        receivedAt: e.received_at.toISOString(),
        payload: e.payload,
      }),
    )
  return neonSnapshotSchema.parse({
    teacher,
    students,
    events,
    ...(await courseBoard(db, teacher)),
  })
}

async function readBody(request: Request) {
  if (!request.body) throw new HttpError(400)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > 2 * 1024 * 1024) {
      await reader.cancel()
      throw new HttpError(413)
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new HttpError(400)
  }
}

const accountRow = z.object({
  role: z.enum(['teacher', 'administrator', 'student']),
  teacher_id: z.uuid().nullable(),
  student_id: z.uuid().nullable(),
  active: z.boolean(),
  expires_at: z.date().nullable(),
})
const live = (active: boolean, expires: Date | null) =>
  active && (!expires || expires.getTime() > Date.now())

async function adminBoard(db: PoolClient) {
  // ponytail: bounded to 1000 accounts; add pagination when that ceiling matters.
  const accounts = (
    await db.query(`SELECT u.id AS "authUserId", u.email, COALESCE(t.name, s.name, u.name, '') AS name,
    a.role, COALESCE(a.active, false) AS active, a.expires_at AS "expiresAt", a.teacher_id AS "teacherId", a.student_id AS "studentId"
    FROM neon_auth."user" u LEFT JOIN app_accounts a ON a.auth_user_id = u.id::text
    LEFT JOIN teachers t ON t.id = a.teacher_id LEFT JOIN students s ON s.id = a.student_id
    ORDER BY u.id LIMIT 1000`)
  ).rows.map((row) => ({
    ...row,
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : null,
  }))
  const teachers = (
    await db.query(`SELECT t.id AS "teacherId", t.name,
      COALESCE((t.active AND a.role = 'teacher' AND a.active AND (t.expires_at IS NULL OR t.expires_at > now())
        AND (a.expires_at IS NULL OR a.expires_at > now())), false) AS active
      FROM teachers t LEFT JOIN app_accounts a ON a.teacher_id = t.id
      WHERE a.role = 'teacher' OR EXISTS (SELECT 1 FROM students s WHERE s.teacher_id = t.id) ORDER BY t.name, t.id`)
  ).rows
  const students = (
    await db.query(
      'SELECT id AS "studentId", name, COALESCE(first_name, name) AS "firstName", COALESCE(last_name, \'\') AS "lastName", group_name AS "group", active, teacher_id AS "teacherId", whatsapp, location, birth_year AS "birthYear" FROM students ORDER BY name, id',
    )
  ).rows
  return neonAdminBoardSchema.parse({ accounts, teachers, students })
}

async function manage(db: PoolClient, path: string, body: unknown, subject: string) {
  if (path === '/api/admin/accounts/grant') {
    const grant = neonAdminGrantSchema.parse(body)
    if (grant.authUserId === subject) throw new HttpError(403)
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [grant.authUserId])
    const user = await db.query('SELECT id FROM neon_auth."user" WHERE id::text = $1 FOR SHARE', [
      grant.authUserId,
    ])
    if (!user.rows.length) throw new HttpError(400)
    await db.query('SELECT auth_user_id FROM app_accounts WHERE auth_user_id = $1 FOR UPDATE', [
      grant.authUserId,
    ])
    if (grant.role === 'student') {
      const student = await db.query('SELECT id FROM students WHERE id = $1 FOR SHARE', [
        grant.studentId,
      ])
      if (!student.rows.length) throw new HttpError(400)
      await db.query(
        `INSERT INTO app_accounts (auth_user_id, role, student_id, active, expires_at) VALUES ($1, 'student', $2, true, $3)
        ON CONFLICT (auth_user_id) DO UPDATE SET role = EXCLUDED.role, teacher_id = NULL, student_id = EXCLUDED.student_id, active = true, expires_at = EXCLUDED.expires_at`,
        [grant.authUserId, grant.studentId, grant.expiresAt],
      )
    } else {
      const mode = grant.role === 'teacher' ? grant.mode : 'read_write'
      const expiry = grant.role === 'teacher' ? grant.expiresAt : null
      const staff = await db.query(
        `INSERT INTO teachers (id, auth_user_id, name, active, access_mode, expires_at) VALUES ($1, $2, $3, true, $4, $5)
        ON CONFLICT (auth_user_id) DO UPDATE SET name = EXCLUDED.name, active = true, access_mode = EXCLUDED.access_mode, expires_at = EXCLUDED.expires_at RETURNING id`,
        [crypto.randomUUID(), grant.authUserId, grant.name, mode, expiry],
      )
      const staffId = z.object({ id: z.uuid() }).parse(staff.rows[0]).id
      await db.query(
        `INSERT INTO app_accounts (auth_user_id, role, teacher_id, active, expires_at) VALUES ($1, $2, $3, true, $4)
        ON CONFLICT (auth_user_id) DO UPDATE SET role = EXCLUDED.role, teacher_id = EXCLUDED.teacher_id, student_id = NULL, active = true, expires_at = EXCLUDED.expires_at`,
        [grant.authUserId, grant.role, staffId, expiry],
      )
    }
  } else if (path === '/api/admin/courses') {
    const course = courseInputSchema.parse(body)
    await db.query(
      'INSERT INTO courses (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name',
      [course.id, course.name],
    )
    return { saved: true }
  } else if (path === '/api/admin/courses/settings') {
    const settings = courseSettingsSchema.parse(body)
    const result = await db.query(
      'UPDATE courses SET attendance_minimum = $2, practical_minimum = $3, theory_minimum = $4 WHERE id = $1 RETURNING id',
      [settings.id, settings.attendanceMinimum, settings.practicalMinimum, settings.theoryMinimum],
    )
    if (!result.rowCount) throw new HttpError(400)
    return { saved: true }
  } else if (path === '/api/admin/courses/status') {
    const status = courseStatusSchema.parse(body)
    const result = await db.query('UPDATE courses SET open = $2 WHERE id = $1 RETURNING id', [
      status.id,
      status.open,
    ])
    if (!result.rowCount) throw new HttpError(400)
    return { saved: true }
  } else if (path === '/api/admin/enrollments/handbook') {
    const value = enrollmentHandbookSchema.parse(body)
    const result = await db.query(
      'UPDATE course_enrollments SET handbook_received = $2 WHERE id = $1 RETURNING id',
      [value.id, value.handbookReceived],
    )
    if (!result.rowCount) throw new HttpError(400)
    return { saved: true }
  } else if (path === '/api/admin/enrollments/grades') {
    const grades = enrollmentGradesSchema.parse(body)
    const result = await db.query(
      'UPDATE course_enrollments SET practical = $2, theory = $3 WHERE id = $1 RETURNING id',
      [grades.id, grades.practical, grades.theory],
    )
    if (!result.rowCount) throw new HttpError(400)
    return { saved: true }
  } else if (path === '/api/admin/enrollments' || path === '/api/admin/enrollments/membership') {
    const legacy = path === '/api/admin/enrollments'
    const enrollment = legacy
      ? enrollmentSchema.extend({ active: z.boolean().optional() }).parse(body)
      : enrollmentMembershipSchema.parse(body)
    const student = await db.query('SELECT id FROM students WHERE id = $1 FOR UPDATE', [
      enrollment.studentId,
    ])
    if (!student.rows.length) throw new HttpError(400)
    const course = await db.query('SELECT id FROM courses WHERE id = $1 FOR SHARE', [
      enrollment.courseId,
    ])
    if (!course.rows.length) throw new HttpError(400)
    const existing = await db.query(
      'SELECT id, student_id, course_id FROM course_enrollments WHERE id = $1 OR (student_id = $2 AND course_id = $3) FOR UPDATE',
      [enrollment.id, enrollment.studentId, enrollment.courseId],
    )
    if (
      existing.rows.some(
        (row) =>
          row.id !== enrollment.id ||
          row.student_id !== enrollment.studentId ||
          row.course_id !== enrollment.courseId,
      )
    )
      throw new HttpError(409)
    if (legacy && 'practical' in enrollment) {
      await db.query(
        `INSERT INTO course_enrollments (id, course_id, student_id, level, practical, theory, active)
        VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, true)) ON CONFLICT (course_id, student_id)
        DO UPDATE SET level = EXCLUDED.level, practical = EXCLUDED.practical, theory = EXCLUDED.theory, active = COALESCE($7, course_enrollments.active)`,
        [
          enrollment.id,
          enrollment.courseId,
          enrollment.studentId,
          enrollment.level,
          enrollment.practical,
          enrollment.theory,
          enrollment.active ?? null,
        ],
      )
    } else {
      await db.query(
        `INSERT INTO course_enrollments (id, course_id, student_id, level, active)
        VALUES ($1, $2, $3, $4, $5) ON CONFLICT (course_id, student_id)
        DO UPDATE SET level = EXCLUDED.level, active = EXCLUDED.active`,
        [
          enrollment.id,
          enrollment.courseId,
          enrollment.studentId,
          enrollment.level,
          enrollment.active,
        ],
      )
    }
    return { saved: true }
  } else if (path === '/api/admin/accounts/reset-password') {
    const { authUserId, password } = neonAdminPasswordResetSchema.parse(body)
    if (authUserId === subject) throw new HttpError(403)
    const hash = await hashPassword(password)
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended('auth-mutations', 0))")
    const updated = await db.query(
      `UPDATE neon_auth.account SET password = $2, "updatedAt" = now()
      WHERE "userId"::text = $1 AND "providerId" = 'credential' RETURNING id`,
      [authUserId, hash],
    )
    if (updated.rowCount !== 1) throw new HttpError(400)
    await db.query('DELETE FROM neon_auth.session WHERE "userId"::text = $1', [authUserId])
  } else if (path === '/api/admin/accounts/disable') {
    const { authUserId } = neonAdminDisableSchema.parse(body)
    if (authUserId === subject) throw new HttpError(403)
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [authUserId])
    await db.query('UPDATE app_accounts SET active = false WHERE auth_user_id = $1', [authUserId])
  } else {
    const combined =
      path === '/api/admin/students/enroll' ? neonAdminStudentEnrollSchema.parse(body) : null
    const student = combined ? combined.student : neonAdminStudentSchema.parse(body)
    const firstName = 'firstName' in student ? student.firstName : null
    const lastName = 'lastName' in student ? student.lastName : null
    const name =
      'name' in student
        ? student.name
        : [student.firstName, student.lastName].filter(Boolean).join(' ')
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [student.studentId])
    const current = await db.query('SELECT teacher_id FROM students WHERE id = $1 FOR UPDATE', [
      student.studentId,
    ])
    if (student.teacherId && current.rows[0]?.teacher_id !== student.teacherId) {
      const teacher = await db.query(
        `SELECT t.id FROM teachers t JOIN app_accounts a ON a.teacher_id = t.id
        WHERE t.id = $1 AND a.role = 'teacher' AND a.active AND (a.expires_at IS NULL OR a.expires_at > now())
        AND t.active AND (t.expires_at IS NULL OR t.expires_at > now()) FOR SHARE OF t, a`,
        [student.teacherId],
      )
      if (!teacher.rows.length) throw new HttpError(400)
    }
    await db.query(
      `INSERT INTO students (id, teacher_id, name, group_name, active, first_name, last_name, whatsapp, location, birth_year) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id, name = EXCLUDED.name, group_name = EXCLUDED.group_name, active = EXCLUDED.active,
        first_name = CASE WHEN EXCLUDED.first_name IS NULL AND students.name = EXCLUDED.name THEN students.first_name ELSE EXCLUDED.first_name END,
        last_name = CASE WHEN EXCLUDED.first_name IS NULL AND students.name = EXCLUDED.name THEN students.last_name ELSE EXCLUDED.last_name END,
        whatsapp = CASE WHEN $11 THEN EXCLUDED.whatsapp ELSE students.whatsapp END,
        location = CASE WHEN $12 THEN EXCLUDED.location ELSE students.location END,
        birth_year = CASE WHEN $13 THEN EXCLUDED.birth_year ELSE students.birth_year END`,
      [
        student.studentId,
        student.teacherId,
        name,
        student.group,
        student.active,
        firstName,
        lastName,
        student.whatsapp || null,
        student.location || null,
        student.birthYear ?? null,
        student.whatsapp !== undefined,
        student.location !== undefined,
        student.birthYear !== undefined,
      ],
    )
    if (combined) {
      await manage(
        db,
        '/api/admin/enrollments/membership',
        {
          ...combined.enrollment,
          studentId: student.studentId,
          active: true,
        },
        subject,
      )
    }
  }
  return adminBoard(db)
}

export function createHandler(
  pool: Pool,
  verify: (token: string) => Promise<string>,
  origins: string[],
  verifyRequest?: (request: Request) => Promise<string>,
) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin')
    const cors: Record<string, string> =
      origin && origins.includes(origin)
        ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
        : {}
    const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors })
    if (origin && !origins.includes(origin)) return reply({ error: 'Forbidden' }, 403)
    if (request.method === 'OPTIONS')
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        },
      })
    const path = new URL(request.url).pathname
    if (path === '/health' && request.method === 'GET') return reply({ ok: true })
    if (
      ![
        '/api/me',
        '/api/notebook',
        '/api/events',
        '/api/student/attendance',
        '/api/admin',
        '/api/admin/accounts/grant',
        '/api/admin/accounts/disable',
        '/api/admin/accounts/reset-password',
        '/api/admin/students',
        '/api/admin/courses',
        '/api/admin/courses/status',
        '/api/admin/courses/settings',
        '/api/admin/enrollments',
        '/api/admin/enrollments/membership',
        '/api/admin/enrollments/grades',
        '/api/admin/enrollments/handbook',
        '/api/admin/students/enroll',
      ].includes(path)
    )
      return reply({ error: 'Not found' }, 404)
    if (
      ([
        '/api/events',
        '/api/admin/accounts/grant',
        '/api/admin/accounts/disable',
        '/api/admin/accounts/reset-password',
        '/api/admin/students',
        '/api/admin/courses',
        '/api/admin/courses/status',
        '/api/admin/courses/settings',
        '/api/admin/enrollments',
        '/api/admin/enrollments/membership',
        '/api/admin/enrollments/grades',
        '/api/admin/enrollments/handbook',
        '/api/admin/students/enroll',
      ].includes(path) &&
        request.method !== 'POST') ||
      (![
        '/api/events',
        '/api/admin/accounts/grant',
        '/api/admin/accounts/disable',
        '/api/admin/accounts/reset-password',
        '/api/admin/students',
        '/api/admin/courses',
        '/api/admin/courses/status',
        '/api/admin/courses/settings',
        '/api/admin/enrollments',
        '/api/admin/enrollments/membership',
        '/api/admin/enrollments/grades',
        '/api/admin/enrollments/handbook',
        '/api/admin/students/enroll',
      ].includes(path) &&
        request.method !== 'GET')
    )
      return reply({ error: 'Method not allowed' }, 405)
    const bearer = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)
    if (!bearer && !verifyRequest) return reply({ error: 'Unauthorized' }, 401)
    let subject: string
    try {
      if (verifyRequest) subject = await verifyRequest(request)
      else if (bearer) subject = await verify(bearer[1])
      else return reply({ error: 'Unauthorized' }, 401)
    } catch {
      return reply({ error: 'Unauthorized' }, 401)
    }
    try {
      const db = await pool.connect()
      try {
        await db.query('BEGIN')
        const result = await db.query(
          'SELECT role, teacher_id, student_id, active, expires_at FROM app_accounts WHERE auth_user_id = $1 FOR UPDATE',
          [subject],
        )
        if (!result.rows.length) throw new HttpError(403)
        const account = accountRow.parse(result.rows[0])
        if (!live(account.active, account.expires_at)) throw new HttpError(403)
        if (account.role === 'student') {
          if (!account.student_id) throw new HttpError(403)
          const result = await db.query(
            'SELECT id, name, group_name, active FROM students WHERE id = $1 FOR SHARE',
            [account.student_id],
          )
          if (!result.rows.length) throw new HttpError(403)
          const student = studentRow.parse(result.rows[0])
          if (!student.active) throw new HttpError(403)
          const profile = {
            role: 'student',
            id: student.id,
            name: student.name,
            canRead: true,
            canWrite: false,
            expiresAt: account.expires_at?.toISOString() ?? null,
          }
          if (path === '/api/me') {
            await db.query('COMMIT')
            return reply({ account: profile })
          }
          if (path !== '/api/student/attendance') throw new HttpError(403)
          const rows = z
            .array(eventRow)
            .parse(
              (
                await db.query(
                  'SELECT e.id, e.actor, e.client_time, e.received_at, e.payload FROM events e WHERE e.student_id = $1 ORDER BY e.sequence',
                  [student.id],
                )
              ).rows,
            )
          const events = rows.map((e) =>
            eventSchema.parse({
              id: e.id,
              actor: e.actor,
              clientTime: e.client_time.toISOString(),
              receivedAt: e.received_at.toISOString(),
              payload: e.payload,
            }),
          )
          const courseRows = z
            .array(z.object({ id: z.uuid(), name: z.string() }))
            .parse(
              (
                await db.query(
                  'SELECT ce.id, c.name FROM course_enrollments ce JOIN courses c ON c.id = ce.course_id WHERE ce.student_id = $1',
                  [student.id],
                )
              ).rows,
            )
          const attendance = projectEvents(events).attendance.map(({ value }) => ({
            date: value.date,
            status: value.status,
            ...(value.enrollmentId
              ? {
                  enrollmentId: value.enrollmentId,
                  course: courseRows.find((entry) => entry.id === value.enrollmentId)?.name ?? null,
                }
              : {}),
          }))
          const response = neonStudentAttendanceSchema.parse({
            student: { studentId: student.id, name: student.name, group: student.group_name },
            attendance,
          })
          await db.query('COMMIT')
          return reply(response)
        }
        if (!account.teacher_id) throw new HttpError(403)
        const staff = await db.query(
          'SELECT id, name, active, access_mode, expires_at FROM teachers WHERE id = $1 FOR UPDATE',
          [account.teacher_id],
        )
        if (!staff.rows.length) throw new HttpError(403)
        const row = teacherRow.parse(staff.rows[0])
        if (!live(row.active, row.expires_at)) throw new HttpError(403)
        const teacher = neonTeacherSchema.parse({
          role: account.role,
          id: row.id,
          name: row.name,
          canRead: row.access_mode !== 'write_only',
          canWrite: row.access_mode !== 'read_only',
          expiresAt:
            [row.expires_at, account.expires_at]
              .filter((v): v is Date => v !== null)
              .sort((a, b) => a.getTime() - b.getTime())[0]
              ?.toISOString() ?? null,
        })
        if (path === '/api/me') {
          await db.query('COMMIT')
          return reply({ account: teacher, teacher })
        }
        if (path.startsWith('/api/admin')) {
          if (teacher.role !== 'administrator' || !teacher.canRead || !teacher.canWrite)
            throw new HttpError(403)
          const response =
            path === '/api/admin'
              ? await adminBoard(db)
              : await manage(db, path, await readBody(request), subject)
          await db.query('COMMIT')
          return reply(response)
        }
        if (path === '/api/events' && !teacher.canWrite) throw new HttpError(403)
        const batch = path === '/api/events' ? neonBatchSchema.parse(await readBody(request)) : null
        if (
          path === '/api/student/attendance' ||
          (path === '/api/notebook' && !teacher.canRead) ||
          (batch && !teacher.canWrite)
        )
          throw new HttpError(403)
        const current = await snapshot(db, teacher)
        if (batch) {
          if (batch.events.some((e) => e.actor !== teacher.name)) throw new HttpError(403)
          const newEvents = batch.events.filter((event) => {
            const existing = current.events.find((item) => item.id === event.id)
            if (!existing) return true
            if (
              existing.actor !== event.actor ||
              existing.clientTime !== event.clientTime ||
              JSON.stringify(existing.payload) !== JSON.stringify(event.payload)
            )
              throw new HttpError(409)
            return false
          })
          try {
            validateAssignedPayloads(
              newEvents.map((e) => e.payload),
              current.students,
              current.events,
              current.enrollments,
              current.courses,
            )
          } catch {
            throw new HttpError(403)
          }
          for (const event of batch.events) {
            const payload = event.payload
            const studentId =
              payload.kind === 'reversal'
                ? current.events.find((e) => e.id === payload.targetId)?.payload
                : payload
            if (!studentId || !('studentId' in studentId)) throw new HttpError(403)
            const inserted = await db.query(
              'INSERT INTO events (id, teacher_id, student_id, actor, client_time, payload, enrollment_id) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) ON CONFLICT (id) DO NOTHING RETURNING id',
              [
                event.id,
                teacher.id,
                studentId.studentId,
                teacher.name,
                event.clientTime,
                JSON.stringify(payload),
                studentId.kind === 'attendance' ? (studentId.enrollmentId ?? null) : null,
              ],
            )
            if (!inserted.rowCount) {
              const same = await db.query(
                'SELECT 1 FROM events WHERE id = $1 AND teacher_id = $2 AND student_id = $3 AND actor = $4 AND client_time = $5 AND payload = $6::jsonb',
                [
                  event.id,
                  teacher.id,
                  studentId.studentId,
                  teacher.name,
                  event.clientTime,
                  JSON.stringify(payload),
                ],
              )
              if (!same.rowCount) throw new HttpError(409)
            }
          }
        }
        const response =
          batch && !teacher.canRead
            ? { saved: batch.events.length }
            : batch
              ? await snapshot(db, teacher)
              : current
        await db.query('COMMIT')
        return reply(response)
      } catch (error) {
        await db.query('ROLLBACK')
        throw error
      } finally {
        db.release()
      }
    } catch (error) {
      const status =
        error instanceof HttpError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : error instanceof Error && 'code' in error && error.code === '23505'
              ? 409
              : 500
      return reply(
        {
          error:
            (
              {
                400: 'Invalid request',
                403: 'Forbidden',
                409: 'Conflict',
                413: 'Request too large',
              } as Record<number, string>
            )[status] ?? 'Server error',
        },
        status,
      )
    }
  }
}
