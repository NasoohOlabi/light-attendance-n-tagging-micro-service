import { describe, expect, test } from 'bun:test'
import type { Pool } from 'pg'
import { createHandler } from '../functions/notebook-service'

const teacherId = '11111111-1111-4111-8111-111111111111'
const studentId = '22222222-2222-4222-8222-222222222222'
const eventId = '33333333-3333-4333-8333-333333333333'
const event = {
  id: eventId,
  actor: 'Teacher',
  clientTime: '2026-11-13T12:00:00.000Z',
  receivedAt: '',
  payload: { kind: 'attendance', studentId, date: '2026-11-13', status: 'present' },
}
function setup(
  options: { active?: boolean; expires?: Date; mode?: string; assigned?: boolean } = {},
) {
  const rows: Array<{
    id: string
    actor: string
    client_time: Date
    received_at: Date
    payload: typeof event.payload
  }> = []
  const client = {
    async query(sql: string, values: unknown[] = []) {
      if (sql.startsWith('SELECT id, name, active'))
        return {
          rows: [
            {
              id: teacherId,
              name: 'Teacher',
              active: options.active ?? true,
              access_mode: options.mode ?? 'read_write',
              expires_at: options.expires ?? null,
            },
          ],
        }
      if (sql.startsWith('SELECT id, name, group_name'))
        return {
          rows:
            options.assigned === false
              ? []
              : [{ id: studentId, name: 'Student', group_name: '', active: true }],
        }
      if (sql.startsWith('SELECT e.id')) return { rows }
      if (sql.startsWith('INSERT INTO events')) {
        if (rows.some((row) => row.id === values[0])) return { rows: [], rowCount: 0 }
        rows.push({
          id: String(values[0]),
          actor: String(values[3]),
          client_time: new Date(String(values[4])),
          received_at: new Date(),
          payload: JSON.parse(String(values[5])),
        })
        return { rows: [{ id: values[0] }], rowCount: 1 }
      }
      if (sql.startsWith('SELECT 1 FROM events')) {
        const found = rows.some(
          (row) =>
            row.id === values[0] &&
            row.actor === values[3] &&
            row.client_time.toISOString() === values[4] &&
            JSON.stringify(row.payload) === values[5],
        )
        return { rows: found ? [{}] : [], rowCount: found ? 1 : 0 }
      }
      return { rows: [] }
    },
    release() {},
  }
  const pool = { connect: async () => client } as unknown as Pool
  const handler = createHandler(
    pool,
    async (token) => {
      if (token !== 'valid') throw new Error('bad token')
      return 'subject'
    },
    ['https://app.example'],
  )
  const call = (path: string, token = 'valid', body?: unknown) =>
    handler(
      new Request(`https://api.example${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${token}`, Origin: 'https://app.example' },
        body: body ? JSON.stringify(body) : undefined,
      }),
    )
  return { call, rows, handler }
}
describe('Neon API boundary', () => {
  test('rejects missing and invalid credentials and foreign origins', async () => {
    const { call, handler } = setup()
    expect((await handler(new Request('https://api.example/api/me'))).status).toBe(401)
    expect((await call('/api/me', 'invalid')).status).toBe(401)
    expect(
      (
        await handler(
          new Request('https://api.example/health', {
            headers: { Origin: 'https://evil.example' },
          }),
        )
      ).status,
    ).toBe(403)
  })
  test('enforces disabled, expired and access mode restrictions', async () => {
    expect((await setup({ active: false }).call('/api/me')).status).toBe(403)
    expect((await setup({ expires: new Date('2020-01-01') }).call('/api/me')).status).toBe(403)
    expect(
      (await setup({ mode: 'read_only' }).call('/api/events', 'valid', { events: [event] })).status,
    ).toBe(403)
    expect((await setup({ mode: 'write_only' }).call('/api/notebook')).status).toBe(403)
    expect(
      await (
        await setup({ mode: 'write_only' }).call('/api/events', 'valid', { events: [event] })
      ).json(),
    ).toEqual({ saved: 1 })
  })
  test('rejects foreign students and actor impersonation', async () => {
    expect(
      (await setup({ assigned: false }).call('/api/events', 'valid', { events: [event] })).status,
    ).toBe(403)
    expect(
      (await setup().call('/api/events', 'valid', { events: [{ ...event, actor: 'Other' }] }))
        .status,
    ).toBe(403)
    expect(
      (
        await setup().call('/api/events', 'valid', {
          events: [
            { ...event, payload: { kind: 'reversal', targetId: eventId, reason: 'Correction' } },
          ],
        })
      ).status,
    ).toBe(403)
  })
  test('retries identical events once and rejects conflicting IDs', async () => {
    const { call, rows } = setup()
    expect((await call('/api/events', 'valid', { events: [event] })).status).toBe(200)
    expect((await call('/api/events', 'valid', { events: [event] })).status).toBe(200)
    expect(rows).toHaveLength(1)
    expect(
      (
        await call('/api/events', 'valid', {
          events: [{ ...event, payload: { ...event.payload, status: 'late' } }],
        })
      ).status,
    ).toBe(409)
    expect(rows).toHaveLength(1)
  })
})
