import { z } from 'zod'
import type { Pool, PoolClient } from 'pg'
import { neonBatchSchema, neonSnapshotSchema, neonTeacherSchema } from '../shared/neon'
import { eventSchema } from '../shared/ledger'
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
  const students = z
    .array(studentRow)
    .parse(
      (
        await db.query(
          'SELECT id, name, group_name, active FROM students WHERE teacher_id = $1 AND active ORDER BY name, id FOR SHARE',
          [teacher.id],
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
          'SELECT e.id, e.actor, e.client_time, e.received_at, e.payload FROM events e JOIN students s ON s.id = e.student_id WHERE s.teacher_id = $1 AND s.active ORDER BY e.sequence',
          [teacher.id],
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
    return neonBatchSchema.parse(JSON.parse(new TextDecoder().decode(bytes)))
  } catch {
    throw new HttpError(400)
  }
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
    if (!['/api/me', '/api/notebook', '/api/events'].includes(path))
      return reply({ error: 'Not found' }, 404)
    if (
      (path === '/api/events' && request.method !== 'POST') ||
      (path !== '/api/events' && request.method !== 'GET')
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
      const batch = path === '/api/events' ? await readBody(request) : null
      const db = await pool.connect()
      try {
        await db.query('BEGIN')
        const result = await db.query(
          'SELECT id, name, active, access_mode, expires_at FROM teachers WHERE auth_user_id = $1 FOR UPDATE',
          [subject],
        )
        if (!result.rows.length) throw new HttpError(403)
        const row = teacherRow.parse(result.rows[0])
        if (!row.active || (row.expires_at && row.expires_at.getTime() <= Date.now()))
          throw new HttpError(403)
        const teacher = neonTeacherSchema.parse({
          id: row.id,
          name: row.name,
          canRead: row.access_mode !== 'write_only',
          canWrite: row.access_mode !== 'read_only',
          expiresAt: row.expires_at?.toISOString() ?? null,
        })
        if ((path === '/api/notebook' && !teacher.canRead) || (batch && !teacher.canWrite))
          throw new HttpError(403)
        if (path === '/api/me') {
          await db.query('COMMIT')
          return reply({ teacher })
        }
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
      const status = error instanceof HttpError ? error.status : 500
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
