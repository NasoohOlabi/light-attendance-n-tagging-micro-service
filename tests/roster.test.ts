import { describe, expect, test } from 'bun:test'
import {
  assignedEvents,
  assignedStudents,
  parseRoster,
  validateAssignedPayloads,
} from '../shared/roster'
import { assignedAccessSchema, createStudentAccessLink, decodeAccess } from '../shared/access'
import { makeEvent } from '../shared/ledger'

const teacherA = '10000000-0000-4000-8000-000000000001'
const teacherB = '10000000-0000-4000-8000-000000000002'
const studentA = '20000000-0000-4000-8000-000000000001'
const studentB = '20000000-0000-4000-8000-000000000002'
const row = {
  studentId: studentA,
  name: 'Student A',
  teacherId: teacherA,
  teacherName: 'Teacher A',
  group: '',
  active: 'TRUE',
}

describe('assigned roster', () => {
  test('rejects invalid and ambiguous rows', () => {
    expect(() => parseRoster([{ ...row, active: 'yes' }])).toThrow()
    expect(() => parseRoster([row, row])).toThrow()
    expect(() =>
      parseRoster([row, { ...row, studentId: studentB, teacherName: 'Other' }]),
    ).toThrow()
  })
  test('filters events and validates writes against active assignments', () => {
    const students = assignedStudents(
      parseRoster([
        row,
        { ...row, studentId: studentB, teacherId: teacherB, teacherName: 'Teacher B' },
      ]),
      teacherA,
    )
    const own = makeEvent('A', {
      kind: 'attendance',
      studentId: studentA,
      date: '2026-11-13',
      status: 'present',
    })
    const other = makeEvent('B', {
      kind: 'attendance',
      studentId: studentB,
      date: '2026-11-13',
      status: 'absent',
    })
    const forward = makeEvent('B', { kind: 'reversal', targetId: own.id, reason: 'forward' })
    const foreign = makeEvent('B', { kind: 'reversal', targetId: other.id, reason: 'foreign' })
    expect(assignedEvents([forward, other, foreign, own], students)).toEqual([own])
    expect(() => validateAssignedPayloads([other.payload], students, [own, other])).toThrow()
    expect(() =>
      validateAssignedPayloads(
        [{ kind: 'note', studentId: '', date: '2026-11-13', tags: ['x'], text: 'x' }],
        students,
        [own],
      ),
    ).toThrow()
    expect(() =>
      validateAssignedPayloads(
        [{ kind: 'student', studentId: studentA, name: 'X', group: '', active: true }],
        students,
        [own],
      ),
    ).toThrow()
    expect(() => validateAssignedPayloads([foreign.payload], students, [own, other])).toThrow()
    expect(() => validateAssignedPayloads([own.payload], students, [own])).not.toThrow()
  })
})

test('assigned student links keep both credentials in the fragment', () => {
  const access = {
    version: 2,
    username: 'Teacher A',
    teacherId: teacherA,
    apiId: 'events123',
    token: 'events-secret',
    sheet: 'Events',
    roster: { apiId: 'roster123', token: 'roster-secret', sheet: 'Roster' },
  } as const
  const url = new URL(createStudentAccessLink('https://example.org/?token=old', access, studentA))
  expect(url.searchParams.get('student')).toBe(studentA)
  expect(url.search).not.toContain('secret')
  expect(decodeAccess(new URLSearchParams(url.hash.slice(1)).get('access') ?? '')).toEqual(access)
})

test('assigned links require separate roster and events API endpoints', () => {
  const result = assignedAccessSchema.safeParse({
    version: 2,
    username: 'Teacher A',
    teacherId: teacherA,
    apiId: 'shared123',
    token: 'events-secret',
    sheet: 'Events',
    roster: { apiId: 'shared123', token: 'roster-secret', sheet: 'Roster' },
  })
  expect(result.success).toBe(false)
})
