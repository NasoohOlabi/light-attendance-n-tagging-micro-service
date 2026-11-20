import { describe, expect, test } from 'bun:test'
import type { Pool } from 'pg'
import { createHandler } from '../functions/notebook-service'
import { eventSchema, type LedgerEvent } from '../shared/ledger'

const teacherId = '11111111-1111-4111-8111-111111111111'
const studentId = '22222222-2222-4222-8222-222222222222'
const courseId = '44444444-4444-4444-8444-444444444444'
const enrollmentId = '55555555-5555-4555-8555-555555555555'
const eventId = '33333333-3333-4333-8333-333333333333'
const event = {
  id: eventId,
  actor: 'Teacher',
  clientTime: '2026-11-13T12:00:00.000Z',
  receivedAt: '',
  payload: { kind: 'attendance', studentId, enrollmentId, date: '2026-11-13', status: 'present' },
} satisfies LedgerEvent
function setup(
  options: {
    active?: boolean
    expires?: Date
    mode?: string
    assigned?: boolean
    role?: 'student' | 'teacher' | 'administrator'
  } = {},
) {
  const rows: Array<{
    id: string
    actor: string
    client_time: Date
    received_at: Date
    payload: unknown
  }> = []
  let whatsapp: string | null = null
  const client = {
    async query(sql: string, values: unknown[] = []) {
      if (sql.startsWith('UPDATE students SET whatsapp')) {
        whatsapp = typeof values[1] === 'string' ? values[1] : null
        return { rows: [], rowCount: 1 }
      }
      if (sql.startsWith('SELECT whatsapp FROM students'))
        return { rows: options.assigned === false ? [] : [{ whatsapp }] }
      if (sql.startsWith('SELECT role, teacher_id'))
        return {
          rows: [
            {
              role: options.role ?? 'teacher',
              teacher_id: options.role === 'student' ? null : teacherId,
              student_id: options.role === 'student' ? studentId : null,
              active: true,
              expires_at: null,
            },
          ],
        }
      if (sql.startsWith('SELECT id, name, group_name'))
        return { rows: [{ id: studentId, name: 'Student', group_name: '', active: true }] }
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
      if (sql.startsWith('SELECT s.id, s.name, s.group_name'))
        return {
          rows:
            options.assigned === false
              ? []
              : [{ id: studentId, name: 'Student', group_name: '', active: true, whatsapp }],
        }
      if (
        sql.includes('FROM course_enrollments ce JOIN students s') &&
        sql.includes('FOR SHARE OF ce')
      )
        return {
          rows: [
            {
              id: enrollmentId,
              courseId,
              studentId,
              level: '',
              practical: null,
              theory: null,
              active: true,
            },
          ],
        }
      if (sql.startsWith('SELECT c.id, c.name, c.open'))
        return { rows: [{ id: courseId, name: 'Course', open: true }] }
      if (sql.startsWith('SELECT e.id'))
        return {
          rows: rows.filter((row) => !JSON.stringify(row.payload).includes('contact_receipt')),
        }
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
        if (values.length === 1) {
          const found = rows.some((row) => row.id === values[0])
          return { rows: found ? [{}] : [], rowCount: found ? 1 : 0 }
        }
        const [actor, time, payload] =
          values.length === 5 ? [undefined, ...values.slice(3)] : values.slice(3)
        const found = rows.some(
          (row) =>
            row.id === values[0] &&
            (actor === undefined || row.actor === actor) &&
            row.client_time.toISOString() === time &&
            JSON.stringify(row.payload) === payload,
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
  test('sync detects conflicts and retries exact IDs after later changes', async () => {
    const { call } = setup()
    const sync = (record: { event: LedgerEvent; expectedEventId: string | null }) =>
      call('/api/attendance/sync', 'valid', { accountId: 'subject', records: [record] })
    const first = eventSchema.parse(event)
    const firstResponse = await sync({ event: first, expectedEventId: null })
    expect((await firstResponse.json()).outcomes[0].kind).toBe('saved')
    const same = eventSchema.parse({ ...first, id: crypto.randomUUID() })
    expect(
      (await (await sync({ event: same, expectedEventId: null })).json()).outcomes[0].kind,
    ).toBe('saved')
    const unknown = eventSchema.parse({
      ...first,
      id: crypto.randomUUID(),
      payload: { ...first.payload, status: 'absent' },
    })
    expect(
      (
        await (
          await call('/api/attendance/sync', 'valid', {
            accountId: 'subject',
            records: [{ event: unknown, expectedEventId: null, expectedRevision: 'unknown' }],
          })
        ).json()
      ).outcomes[0].kind,
    ).toBe('conflict')
    const different = eventSchema.parse({
      ...first,
      id: crypto.randomUUID(),
      payload: { ...first.payload, status: 'absent' },
    })
    expect(
      (await (await sync({ event: different, expectedEventId: first.id })).json()).outcomes[0].kind,
    ).toBe('conflict')
    expect(
      (await (await sync({ event: different, expectedEventId: same.id })).json()).outcomes[0].kind,
    ).toBe('saved')
    expect(
      (await (await sync({ event: same, expectedEventId: null })).json()).outcomes[0].kind,
    ).toBe('saved')
    expect(
      (
        await (
          await sync({ event: { ...same, payload: different.payload }, expectedEventId: null })
        ).json()
      ).outcomes[0].kind,
    ).toBe('id_conflict')
    expect(
      (
        await call('/api/attendance/sync', 'valid', {
          accountId: 'other',
          records: [{ event: first, expectedEventId: null }],
        })
      ).status,
    ).toBe(403)
  })
  test('student sync preserves notes and detects contact conflicts and retries', async () => {
    const { call, rows } = setup()
    const send = async (operation: unknown) =>
      await (await call('/api/student/sync', 'valid', { accountId: 'subject', operation })).json()
    const note = {
      kind: 'note',
      event: {
        ...event,
        payload: { kind: 'note', studentId, date: '2026-11-13', tags: ['test'], text: 'First' },
      },
    }
    expect((await send(note)).kind).toBe('saved')
    expect((await send(note)).kind).toBe('saved')
    expect(
      (
        await send({
          ...note,
          event: { ...note.event, payload: { ...note.event.payload, text: 'Changed' } },
        })
      ).kind,
    ).toBe('id_conflict')
    const contact = {
      kind: 'contact',
      id: crypto.randomUUID(),
      studentId,
      clientTime: event.clientTime,
      expectedWhatsapp: null,
      whatsapp: '123',
    }
    expect((await send(contact)).kind).toBe('saved')
    const next = { ...contact, id: crypto.randomUUID(), expectedWhatsapp: '123', whatsapp: '456' }
    expect((await send(next)).kind).toBe('saved')
    expect(await send(contact)).toMatchObject({ kind: 'saved', currentWhatsapp: '456' })
    expect(await send({ ...contact, id: crypto.randomUUID(), whatsapp: '789' })).toMatchObject({
      kind: 'conflict',
      currentWhatsapp: '456',
    })
    expect(rows.slice(1).map(({ payload }) => payload)).toEqual([
      { kind: 'contact_receipt', fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) },
      { kind: 'contact_receipt', fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) },
    ])
    expect(
      await (
        await setup({ assigned: false }).call('/api/student/sync', 'valid', {
          accountId: 'subject',
          operation: contact,
        })
      ).json(),
    ).toMatchObject({ kind: 'forbidden' })
    expect(
      (
        await setup({ mode: 'read_only' }).call('/api/student/sync', 'valid', {
          accountId: 'subject',
          operation: contact,
        })
      ).status,
    ).toBe(200)
  })
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
  test('enforces disabled and expired grants while legacy teacher modes allow reads and writes', async () => {
    expect((await setup({ active: false }).call('/api/me')).status).toBe(403)
    expect((await setup({ expires: new Date('2020-01-01') }).call('/api/me')).status).toBe(403)
    expect(
      (await setup({ mode: 'read_only' }).call('/api/events', 'valid', { events: [event] })).status,
    ).toBe(200)
    expect((await setup({ mode: 'write_only' }).call('/api/notebook')).status).toBe(200)
    expect(
      await (
        await setup({ mode: 'write_only' }).call('/api/events', 'valid', { events: [event] })
      ).json(),
    ).toMatchObject({ teacher: { canRead: true, canWrite: true } })
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
  test('student sees only projected attendance and cannot access staff routes', async () => {
    const { call, rows } = setup({ role: 'student' })
    rows.push({
      id: eventId,
      actor: 'Private teacher',
      client_time: new Date(event.clientTime),
      received_at: new Date(),
      payload: { kind: 'attendance', studentId, date: '2026-11-13', status: 'late' },
    })
    const response = await call('/api/student/attendance')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      student: { studentId, name: 'Student', group: '' },
      attendance: [{ date: '2026-11-13', status: 'present' }],
    })
    rows.push({
      id: '44444444-4444-4444-8444-444444444444',
      actor: 'Private teacher',
      client_time: new Date(event.clientTime),
      received_at: new Date(),
      payload: { kind: 'reversal', targetId: eventId, reason: 'private reason' },
    })
    expect((await (await call('/api/student/attendance')).json()).attendance).toEqual([])
    expect((await call('/api/notebook')).status).toBe(403)
    expect((await call('/api/events', 'valid', { events: [event] })).status).toBe(403)
    expect((await call('/api/admin')).status).toBe(403)
  })
  test('teachers cannot manage accounts and admins cannot change themselves', async () => {
    expect((await setup().call('/api/admin')).status).toBe(403)
    expect(
      (
        await setup({ role: 'administrator' }).call('/api/admin/accounts/disable', 'valid', {
          authUserId: 'subject',
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await setup({ role: 'administrator' }).call('/api/admin/accounts/grant', 'valid', {
          authUserId: 'subject',
          role: 'teacher',
          name: 'Name',
          expiresAt: null,
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
    const legacy = eventSchema.parse({
      ...event,
      id: '55555555-5555-4555-8555-555555555555',
      payload: { ...event.payload, status: 'early' },
    })
    expect((await call('/api/events', 'valid', { events: [legacy] })).status).toBe(200)
    expect((await call('/api/events', 'valid', { events: [legacy] })).status).toBe(200)
    expect(
      (
        await call('/api/events', 'valid', {
          events: [{ ...legacy, payload: { ...legacy.payload, status: 'present' } }],
        })
      ).status,
    ).toBe(409)
    expect(rows).toHaveLength(2)
    expect(rows[1].payload).toEqual(legacy.payload)
  })
})
