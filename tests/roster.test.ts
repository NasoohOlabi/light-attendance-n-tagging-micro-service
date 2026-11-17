import { describe, expect, test } from 'bun:test'
import { assignedEvents, validateAssignedPayloads } from '../shared/roster'
import { makeEvent, type Student } from '../shared/ledger'
const studentA = '20000000-0000-4000-8000-000000000001'
const studentB = '20000000-0000-4000-8000-000000000002'

describe('assigned roster', () => {
  test('filters events and validates writes against active assignments', () => {
    const students: Student[] = [
      { kind: 'student', studentId: studentA, name: 'Student A', group: '', active: true },
    ]
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
    expect(() => validateAssignedPayloads([own.payload], students, [own])).toThrow()
    expect(() =>
      validateAssignedPayloads(
        [
          {
            kind: 'attendance',
            studentId: studentA,
            enrollmentId: studentA,
            date: '2026-11-13',
            status: 'present',
          },
        ],
        students,
        [own],
      ),
    ).not.toThrow()
  })
})
