import type { LedgerEvent, Payload, Student } from './ledger'

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
