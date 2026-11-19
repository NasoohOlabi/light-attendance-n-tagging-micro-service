import { expect, test } from 'bun:test'
import { matchesText, rankStudents } from '../src/studentSearch'
import type { Student } from '../shared/ledger'

const students: Student[] = [
  { kind: 'student', studentId: '1', name: 'Omar', group: '', active: true },
  { kind: 'student', studentId: '2', name: 'سَلْمى إبراهيم', group: '', active: true },
  { kind: 'student', studentId: '3', name: 'Martin', group: '', active: true },
]
test('search normalizes and ranks fuzzy names', () => {
  expect(rankStudents(students, 'OMR').map((student) => student.name)).toEqual(['Omar'])
  expect(rankStudents(students, 'سلمى').map((student) => student.name)).toEqual(['سَلْمى إبراهيم'])
  expect(rankStudents(students, ' ابرا ').map((student) => student.name)).toEqual(['سَلْمى إبراهيم'])
  expect(rankStudents(students, '')).toEqual(students)
  expect(rankStudents(students, 'not found')).toEqual([])
  expect(matchesText('سَلْمى إبراهيم', 'ابرا')).toBe(true)
  expect(matchesText('Martin', 'xz')).toBe(false)
})
