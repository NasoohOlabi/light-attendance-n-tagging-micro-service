import { describe, expect, test } from 'bun:test'
import { makeEvent, eventSchema, projectEvents, type LedgerEvent } from '../shared/ledger'
describe('append-only projection', () => {
  const studentId = crypto.randomUUID()
  const student = makeEvent('manager', {
    kind: 'student',
    studentId,
    name: 'Ahmad',
    group: 'A',
    active: true,
  })
  const attendance = makeEvent('teacher', {
    kind: 'attendance',
    studentId,
    date: '2026-11-13',
    status: 'present',
  })
  test('retries and duplicate delivery count once', () => {
    const result = projectEvents([student, attendance, attendance])
    expect(result.attendance).toHaveLength(1)
    expect(result.duplicates).toBe(1)
  })
  test('later sequence position wins even if device clock moves backwards; correction restores earlier state', () => {
    const olderClock: LedgerEvent = {
      ...makeEvent('teacher', {
        ...attendance.payload,
        kind: 'attendance',
        studentId,
        date: '2026-11-13',
        status: 'absent',
      }),
      clientTime: '2000-01-01T00:00:00.000Z',
    }
    expect(projectEvents([student, attendance, olderClock]).attendance[0].value.status).toBe(
      'absent',
    )
    const correction = makeEvent('teacher', {
      kind: 'reversal',
      targetId: olderClock.id,
      reason: 'Wrong student',
    })
    const result = projectEvents([student, attendance, olderClock, correction, correction])
    expect(result.attendance[0].value.status).toBe('present')
    expect(result.events).toHaveLength(4)
  })
  test('undoing a note preserves audit history; undoing roster snapshot restores prior group', () => {
    const note = makeEvent('teacher', {
      kind: 'note',
      studentId,
      date: '2026-11-13',
      tags: ['مراجعة'],
      text: '{"feature":"revision","pages":[1,2]}',
    })
    const group = makeEvent('teacher', {
      kind: 'student',
      studentId,
      name: 'Ahmad',
      group: 'B',
      active: false,
    })
    const events = [
      student,
      note,
      group,
      makeEvent('teacher', { kind: 'reversal', targetId: note.id, reason: 'Duplicate note' }),
      makeEvent('teacher', { kind: 'reversal', targetId: group.id, reason: 'Wrong group' }),
    ]
    const result = projectEvents(events)
    expect(result.notes).toHaveLength(0)
    expect(result.students[0].group).toBe('A')
    expect(result.students[0].active).toBe(true)
    expect(result.events).toHaveLength(5)
  })
  test('future-target and reversal-of-reversal records cannot silently cancel later valid data', () => {
    const premature = makeEvent('teacher', {
      kind: 'reversal',
      targetId: attendance.id,
      reason: 'Premature',
    })
    const reverseCorrection = makeEvent('teacher', {
      kind: 'reversal',
      targetId: premature.id,
      reason: 'Unsupported',
    })
    const result = projectEvents([student, premature, attendance, reverseCorrection])
    expect(result.invalidReversals).toBe(2)
    expect(result.attendance).toHaveLength(1)
  })
})

test('conflicting duplicate IDs are reported while the first record wins', () => {
  const event = makeEvent('teacher', {
    kind: 'note',
    studentId: '',
    date: '2026-11-13',
    tags: ['test'],
    text: 'original',
  })
  const conflict = { ...event, payload: { ...event.payload, text: 'changed' } }
  const result = projectEvents([event, event, conflict])
  expect(result.duplicates).toBe(2)
  expect(result.conflicts).toBe(1)
  expect(result.notes[0].value.text).toBe('original')
})

test('event boundary rejects unknown payloads and preserves note text', () => {
  const note = makeEvent('teacher', {
    kind: 'note',
    studentId: '',
    date: '2026-11-15',
    tags: ['test'],
    text: '=plain text',
  })
  expect(eventSchema.parse(note).payload).toEqual(note.payload)
  expect(eventSchema.safeParse({ ...note, payload: { kind: 'unknown' } }).success).toBe(false)
})

test('course enrollment and legacy attendance project independently and corrections stay scoped', () => {
  const studentId = crypto.randomUUID()
  const a = crypto.randomUUID()
  const b = crypto.randomUUID()
  const date = '2026-11-13'
  const old = makeEvent('teacher', { kind: 'attendance', studentId, date, status: 'absent' })
  const first = makeEvent('teacher', {
    kind: 'attendance',
    studentId,
    enrollmentId: a,
    date,
    status: 'present',
  })
  const second = makeEvent('teacher', {
    kind: 'attendance',
    studentId,
    enrollmentId: b,
    date,
    status: 'late',
  })
  const changed = makeEvent('teacher', {
    kind: 'attendance',
    studentId,
    enrollmentId: a,
    date,
    status: 'excused',
  })
  const undo = makeEvent('teacher', {
    kind: 'reversal',
    targetId: changed.id,
    reason: 'Correction',
  })
  const result = projectEvents([old, first, second, changed, undo])
  expect(result.attendance.map(({ value }) => value.status)).toEqual([
    'absent',
    'present',
    'present',
  ])
})

test('legacy statuses stay raw across retries, conflicts and corrections', () => {
  const studentId = crypto.randomUUID()
  const early = makeEvent('teacher', {
    kind: 'attendance',
    studentId,
    date: '2026-11-13',
    status: 'early',
  })
  const late = makeEvent('teacher', {
    kind: 'attendance',
    studentId,
    date: '2026-11-14',
    status: 'late',
  })
  const absent = makeEvent('teacher', {
    kind: 'attendance',
    studentId,
    date: '2026-11-13',
    status: 'absent',
  })
  const correction = makeEvent('teacher', {
    kind: 'reversal',
    targetId: absent.id,
    reason: 'Correction',
  })
  const conflict = eventSchema.parse({ ...late, payload: { ...late.payload, status: 'present' } })
  const result = projectEvents([early, late, late, conflict, absent, correction])
  expect(result.attendance.map(({ value }) => value.status)).toEqual(['present', 'present'])
  expect(result.events.slice(0, 2)).toEqual([early, late])
  expect(result.events[0].payload).toMatchObject({ status: 'early' })
  expect(result.events[1].payload).toMatchObject({ status: 'late' })
  expect(eventSchema.parse(early)).toEqual(early)
  expect(result.duplicates).toBe(2)
  expect(result.conflicts).toBe(1)
})
