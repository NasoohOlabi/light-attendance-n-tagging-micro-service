import { z } from 'zod'

const id = z.uuid()
const date = z.iso.date()
export const statuses = ['present', 'early', 'late', 'absent', 'excused'] as const
export const statusSchema = z.enum(statuses)
const studentSchema = z.object({
  kind: z.literal('student'),
  studentId: id,
  name: z.string().trim().min(1).max(200),
  group: z.string().trim().max(100),
  active: z.boolean(),
})
const attendanceSchema = z.object({
  kind: z.literal('attendance'),
  studentId: id,
  date,
  status: statusSchema,
})
const noteSchema = z.object({
  kind: z.literal('note'),
  studentId: z.union([id, z.literal('')]),
  date,
  tags: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
  text: z.string().trim().min(1).max(10000),
})
const reversalSchema = z.object({
  kind: z.literal('reversal'),
  targetId: id,
  reason: z.string().trim().min(1).max(1000),
})
export const payloadSchema = z.discriminatedUnion('kind', [
  studentSchema,
  attendanceSchema,
  noteSchema,
  reversalSchema,
])
export const eventSchema = z.object({
  id,
  actor: z.string().trim().min(1).max(100),
  clientTime: z.iso.datetime(),
  receivedAt: z.string(),
  payload: payloadSchema,
})
export type LedgerEvent = z.infer<typeof eventSchema>
export type Payload = z.infer<typeof payloadSchema>
export type Student = z.infer<typeof studentSchema>
export type Attendance = z.infer<typeof attendanceSchema>
export type Status = z.infer<typeof statusSchema>
export const HEADERS = ['id', 'actor', 'client_time', 'received_at', 'payload']
export function makeEvent(actor: string, payload: Payload): LedgerEvent {
  return eventSchema.parse({
    id: crypto.randomUUID(),
    actor,
    clientTime: new Date().toISOString(),
    receivedAt: '',
    payload,
  })
}
export function eventToRow(event: LedgerEvent) {
  return {
    id: event.id,
    actor: event.actor,
    client_time: event.clientTime,
    received_at: 'DATETIME',
    payload: JSON.stringify({ version: 1, ...event.payload }),
  }
}
const rowSchema = z.object({
  id: z.string(),
  actor: z.string(),
  client_time: z.string(),
  received_at: z.string(),
  payload: z.string(),
})
export function parseRows(input: unknown): { events: LedgerEvent[]; invalid: number } {
  const rows = z.array(z.unknown()).parse(input)
  const events: LedgerEvent[] = []
  let invalid = 0
  for (const raw of rows) {
    try {
      const row = rowSchema.parse(raw)
      const payload: unknown = JSON.parse(row.payload)
      const versioned = z
        .object({ version: z.literal(1).optional() })
        .passthrough()
        .parse(payload)
      const { version: _version, ...body } = versioned
      events.push(
        eventSchema.parse({
          id: row.id,
          actor: row.actor,
          clientTime: row.client_time,
          receivedAt: row.received_at,
          payload: body,
        }),
      )
    } catch {
      invalid += 1
    }
  }
  return { events, invalid }
}
export function projectEvents(events: LedgerEvent[]) {
  const unique = new Map<string, LedgerEvent>()
  const reversed = new Set<string>()
  let duplicates = 0
  let conflicts = 0
  let invalidReversals = 0
  for (const event of events) {
    const previous = unique.get(event.id)
    if (previous) {
      duplicates += 1
      if (
        previous.actor !== event.actor ||
        previous.clientTime !== event.clientTime ||
        JSON.stringify(previous.payload) !== JSON.stringify(event.payload)
      )
        conflicts += 1
      continue
    }
    if (event.payload.kind === 'reversal') {
      const target = unique.get(event.payload.targetId)
      if (target && target.payload.kind !== 'reversal') reversed.add(target.id)
      else invalidReversals += 1
    }
    unique.set(event.id, event)
  }
  const live = [...unique.values()].filter(
    (event) => event.payload.kind !== 'reversal' && !reversed.has(event.id),
  )
  const students = new Map<string, Student>()
  const attendance = new Map<string, { event: LedgerEvent; value: Attendance }>()
  const notes: { event: LedgerEvent; value: z.infer<typeof noteSchema> }[] = []
  for (const event of live) {
    const value = event.payload
    switch (value.kind) {
      case 'student':
        students.set(value.studentId, value)
        break
      case 'attendance':
        attendance.set(`${value.studentId}:${value.date}`, { event, value })
        break
      case 'note':
        notes.push({ event, value })
        break
      case 'reversal':
        break
      default: {
        const unreachable: never = value
        throw new Error(String(unreachable))
      }
    }
  }
  return {
    students: [...students.values()],
    attendance: [...attendance.values()],
    notes,
    reversed,
    events: [...unique.values()],
    duplicates,
    conflicts,
    invalidReversals,
  }
}
