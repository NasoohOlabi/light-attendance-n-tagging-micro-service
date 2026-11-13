import { describe, expect, test } from 'bun:test'
import { makeEvent, parseRows, projectEvents, eventToRow, type LedgerEvent } from '../shared/ledger'
import { createAccessLink, decodeAccess } from '../shared/access'

describe('personal links', () => {
  const access = {
    version: 1,
    username: 'المعلم أحمد',
    apiId: 'example123',
    token: 'private-token',
    sheet: 'Events',
  } as const
  test('Unicode identity round trips in the fragment, with no query credentials', () => {
    const url = new URL(createAccessLink('https://example.github.io/notebook/?old=1', access))
    expect(url.search).toBe('')
    expect(decodeAccess(url.hash.slice('#access='.length))).toEqual(access)
    expect(url.pathname).toBe('/notebook/')
  })
  test('rejects bad payloads and unsafe hosting URLs', () => {
    expect(() => decodeAccess('not-json')).toThrow()
    expect(() => createAccessLink('javascript:alert(1)', access)).toThrow()
    expect(() => createAccessLink('http://public.example/', access)).toThrow()
    expect(() => createAccessLink('http://127.0.0.1:5173/', access)).not.toThrow()
  })
})

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
  test('later sheet position wins even if device clock moves backwards; correction restores earlier state', () => {
    const late: LedgerEvent = {
      ...makeEvent('teacher', {
        ...attendance.payload,
        kind: 'attendance',
        studentId,
        date: '2026-11-13',
        status: 'late',
      }),
      clientTime: '2000-01-01T00:00:00.000Z',
    }
    expect(projectEvents([student, attendance, late]).attendance[0].value.status).toBe('late')
    const correction = makeEvent('teacher', {
      kind: 'reversal',
      targetId: late.id,
      reason: 'Wrong student',
    })
    const result = projectEvents([student, attendance, late, correction, correction])
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
  test('malformed rows are reported and raw notes do not become formulas', () => {
    const row = eventToRow(student)
    const result = parseRows([
      { ...row, received_at: '2026-11-13 10:00:00' },
      { ...row, payload: '{bad' },
      { ...row, payload: '{"kind":"unknown"}' },
    ])
    expect(result.events).toHaveLength(1)
    expect(result.invalid).toBe(2)
    expect(row.received_at).toBe('DATETIME')
    expect(() => parseRows({ error: 'Bad response' })).toThrow()
  })
})

test('versioned rows retain legacy compatibility and reject future versions', () => {
  const event = makeEvent('teacher', {
    kind: 'note',
    studentId: '',
    date: '2026-11-13',
    tags: ['test'],
    text: 'hello',
  })
  const row = eventToRow(event)
  expect(JSON.parse(row.payload).version).toBe(1)
  const legacy = { ...row, payload: JSON.stringify(event.payload) }
  const future = { ...row, payload: JSON.stringify({ ...event.payload, version: 2 }) }
  const parsed = parseRows([row, legacy, future])
  expect(parsed.events).toHaveLength(2)
  expect(parsed.invalid).toBe(1)
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
