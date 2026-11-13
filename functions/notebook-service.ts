import { z } from 'zod'
import type { Pool, PoolClient } from 'pg'
import {
  neonAdminBoardSchema,
  neonAdminDisableSchema,
  neonAdminGrantSchema,
  neonAdminStudentSchema,
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
  return neonSnapshotSchema.parse({ teacher, students, events })
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
      (t.active AND a.active AND (t.expires_at IS NULL OR t.expires_at > now())
        AND (a.expires_at IS NULL OR a.expires_at > now())) AS active
      FROM teachers t JOIN app_accounts a ON a.teacher_id = t.id
      WHERE a.role = 'teacher' ORDER BY t.name, t.id`)
  ).rows
  const students = (
    await db.query(
      'SELECT id AS "studentId", name, group_name AS "group", active, teacher_id AS "teacherId" FROM students ORDER BY name, id',
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
  } else if (path === '/api/admin/accounts/disable') {
    const { authUserId } = neonAdminDisableSchema.parse(body)
    if (authUserId === subject) throw new HttpError(403)
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [authUserId])
    await db.query('UPDATE app_accounts SET active = false WHERE auth_user_id = $1', [authUserId])
  } else {
    const student = neonAdminStudentSchema.parse(body)
    const teacher = await db.query(
      `SELECT t.id FROM teachers t JOIN app_accounts a ON a.teacher_id = t.id
      WHERE t.id = $1 AND a.role = 'teacher' AND a.active AND (a.expires_at IS NULL OR a.expires_at > now())
      AND t.active AND (t.expires_at IS NULL OR t.expires_at > now()) FOR SHARE OF t, a`,
      [student.teacherId],
    )
    if (!teacher.rows.length) throw new HttpError(400)
    await db.query(
      `INSERT INTO students (id, teacher_id, name, group_name, active) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id, name = EXCLUDED.name, group_name = EXCLUDED.group_name, active = EXCLUDED.active`,
      [student.studentId, student.teacherId, student.name, student.group, student.active],
    )
  }
  return adminBoard(db)
}

export function createHandler(
  pool: Pool,
  verify: (token: string) => Promise<string>,
  origins: string[],
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
        '/api/admin/students',
      ].includes(path)
    )
      return reply({ error: 'Not found' }, 404)
    if (
      ([
        '/api/events',
        '/api/admin/accounts/grant',
        '/api/admin/accounts/disable',
        '/api/admin/students',
      ].includes(path) &&
        request.method !== 'POST') ||
      (![
        '/api/events',
        '/api/admin/accounts/grant',
        '/api/admin/accounts/disable',
        '/api/admin/students',
      ].includes(path) &&
        request.method !== 'GET')
    )
      return reply({ error: 'Method not allowed' }, 405)
    const bearer = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)
    if (!bearer) return reply({ error: 'Unauthorized' }, 401)
    let subject: string
    try {
      subject = await verify(bearer[1])
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
          const attendance = projectEvents(events).attendance.map(({ value }) => ({
            date: value.date,
            status: value.status,
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
          try {
            validateAssignedPayloads(
              batch.events.map((e) => e.payload),
              current.students,
              current.events,
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
              'INSERT INTO events (id, teacher_id, student_id, actor, client_time, payload) VALUES ($1, $2, $3, $4, $5, $6::jsonb) ON CONFLICT (id) DO NOTHING RETURNING id',
              [
                event.id,
                teacher.id,
                studentId.studentId,
                teacher.name,
                event.clientTime,
                JSON.stringify(payload),
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
        error instanceof HttpError ? error.status : error instanceof z.ZodError ? 400 : 500
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
