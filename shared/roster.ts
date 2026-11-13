import { z } from 'zod'
import type { LedgerEvent, Payload, Student } from './ledger'

const activeSchema = z
  .union([z.boolean(), z.enum(['TRUE', 'FALSE', 'true', 'false'])])
  .transform((value) => value === true || value === 'TRUE' || value === 'true')
export const rosterRowSchema = z.object({
  studentId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  teacherId: z.uuid(),
  teacherName: z.string().trim().min(1).max(100),
  group: z.string().trim().max(100),
  active: activeSchema,
})
export type RosterRow = z.infer<typeof rosterRowSchema>
export function parseRoster(input: unknown): RosterRow[] {
  const rows = z.array(rosterRowSchema).parse(input)
  const ids = new Set<string>()
  const teachers = new Map<string, string>()
  for (const row of rows) {
    if (ids.has(row.studentId)) throw new Error('Duplicate student ID in roster')
    if (teachers.has(row.teacherId) && teachers.get(row.teacherId) !== row.teacherName)
      throw new Error('Conflicting teacher names in roster')
    ids.add(row.studentId)
    teachers.set(row.teacherId, row.teacherName)
  }
  return rows
}
export function assignedStudents(rows: RosterRow[], teacherId: string): Student[] {
  return rows
    .filter((row) => row.teacherId === teacherId && row.active)
    .map((row) => ({
      kind: 'student',
      studentId: row.studentId,
      name: row.name,
      group: row.group,
      active: true,
    }))
}
export function assignedEvents(events: LedgerEvent[], students: Student[]): LedgerEvent[] {
  const ids = new Set(students.map((student) => student.studentId))
  const ordinary = new Set<string>()
  return events.filter((event) => {
    const value = event.payload
    if (value.kind === 'attendance' || value.kind === 'note') {
      if (!ids.has(value.studentId)) return false
      ordinary.add(event.id)
      return true
    }
    return value.kind === 'reversal' && ordinary.has(value.targetId)
  })
}
export function validateAssignedPayloads(
  payloads: Payload[],
  students: Student[],
  events: LedgerEvent[],
): void {
  const ids = new Set(students.map((student) => student.studentId))
  const allowed = new Set(
    assignedEvents(events, students)
      .filter((event) => event.payload.kind !== 'reversal')
      .map((event) => event.id),
  )
  for (const payload of payloads) {
    if ((payload.kind === 'attendance' || payload.kind === 'note') && ids.has(payload.studentId))
      continue
    if (payload.kind === 'reversal' && allowed.has(payload.targetId)) continue
    throw new Error('This record is outside your assigned active students.')
  }
}

export const ROSTER_HEADERS = ['studentId', 'name', 'teacherId', 'teacherName', 'group', 'active']
