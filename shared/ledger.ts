import { z } from 'zod'

const id = z.uuid()
const date = z.iso.date()
export const statuses = ['present', 'absent', 'excused'] as const
export const statusSchema = z.enum(statuses)
const persistedStatusSchema = z.enum([...statuses, 'early', 'late'])
export function normalizeStatus(
  status: z.infer<typeof persistedStatusSchema>,
): z.infer<typeof statusSchema> {
  return status === 'early' || status === 'late' ? 'present' : status
}
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
  enrollmentId: id.optional(),
  date,
  status: persistedStatusSchema,
})
const projectedAttendanceSchema = attendanceSchema.extend({ status: statusSchema })
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
export type Attendance = z.infer<typeof projectedAttendanceSchema>
export type Status = z.infer<typeof statusSchema>
export function makeEvent(actor: string, payload: Payload): LedgerEvent {
  return eventSchema.parse({
    id: crypto.randomUUID(),
    actor,
    clientTime: new Date().toISOString(),
    receivedAt: '',
    payload,
  })
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
        attendance.set(`${value.studentId}:${value.enrollmentId ?? ''}:${value.date}`, {
          event,
          value: { ...value, status: normalizeStatus(value.status) },
        })
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
