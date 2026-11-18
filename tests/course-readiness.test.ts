import { expect, test } from 'bun:test'
import { makeEvent, projectEvents } from '../shared/ledger'
import { courseSchema, enrollmentSchema, neonStudentSchema } from '../shared/neon'
import { courseReadiness } from '../src/readinessCounts'

test('readiness counts active course records, preserving zero and projected corrections', () => {
  const course = courseSchema.parse({ id: crypto.randomUUID(), name: 'Course' })
  const otherCourse = crypto.randomUUID()
  const student = (name: string, active = true) =>
    neonStudentSchema.parse({
      kind: 'student',
      studentId: crypto.randomUUID(),
      name,
      group: '',
      active,
    })
  const a = student('A')
  const b = student('B')
  const inactive = student('Inactive', false)
  const enrollment = (studentId: string, overrides: object = {}) =>
    enrollmentSchema.parse({
      id: crypto.randomUUID(),
      courseId: course.id,
      studentId,
      level: '',
      practical: null,
      theory: null,
      ...overrides,
    })
  const first = enrollment(a.studentId, { practical: 0, theory: 0 })
  const second = enrollment(b.studentId, {
    practical: 80,
    gradeDecisions: [
      {
        requestId: crypto.randomUUID(),
        result: 'pass',
        note: 'Override',
        actor: 'admin',
        at: '2026-01-01T00:00:00.000Z',
      },
    ],
  })
  const mark = makeEvent('test', {
    kind: 'attendance',
    studentId: a.studentId,
    enrollmentId: first.id,
    date: '2026-01-01',
    status: 'early',
  })
  const reversal = makeEvent('test', { kind: 'reversal', targetId: mark.id, reason: 'Correction' })
  const result = courseReadiness({
    course,
    students: [a, b, inactive],
    enrollments: [
      first,
      second,
      enrollment(inactive.studentId),
      enrollment(a.studentId, { active: false }),
      enrollment(a.studentId, { courseId: otherCourse }),
    ],
    attendance: projectEvents([mark, reversal]).attendance,
  })
  expect(result.total).toBe(2)
  expect(result.theory.map(({ student }) => student.name)).toEqual(['B'])
  expect(result.practical).toHaveLength(0)
  expect(result.lowTheory.map(({ student }) => student.name)).toEqual(['A'])
  expect(result.lowPractical.map(({ student }) => student.name)).toEqual(['A'])
  expect(result.attendance).toHaveLength(2)
  expect(
    courseReadiness({
      course,
      students: [a],
      enrollments: [first],
      attendance: projectEvents([mark]).attendance,
    }).attendance,
  ).toHaveLength(0)
})
