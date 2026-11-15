import { expect, test } from 'bun:test'
import { rankStudents } from '../src/studentSearch'
import type { Student } from '../shared/ledger'

const students: Student[] = [
  { kind: 'student', studentId: '1', name: 'Omar', group: '', active: true },
  {
    kind: 'student',
    studentId: '2',
    name: '\u0623\u062d\u0652\u0645\u064e\u062f',
    group: '',
    active: true,
  },
  { kind: 'student', studentId: '3', name: 'Martin', group: '', active: true },
]
test('search ranks normalized names and supports subsequences', () => {
  expect(rankStudents(students, 'OMR').map((student) => student.name)).toEqual(['Omar'])
  expect(rankStudents(students, '\u0627\u062d\u0645\u062f').map((student) => student.name)).toEqual(
    ['\u0623\u062d\u0652\u0645\u064e\u062f'],
  )
  expect(rankStudents(students, 'not found')).toEqual([])
})
