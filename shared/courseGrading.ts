import type { projectEvents } from './ledger'
import type { Course, Enrollment } from './neon'

type Attendance = ReturnType<typeof projectEvents>['attendance']

export function courseAttendance(attendance: Attendance, entry: Enrollment) {
  const rows = attendance.filter(({ value }) => value.enrollmentId === entry.id)
  const present = rows.filter(({ value }) => value.status === 'present').length
  const absent = rows.filter(({ value }) => value.status === 'absent').length
  const excused = rows.filter(({ value }) => value.status === 'excused').length
  return {
    present,
    absent,
    excused,
    total: rows.length,
    ratio: rows.length ? (present / rows.length) * 100 : null,
  }
}

export function savedGradeResult(course: Course, entry: Enrollment, ratio: number | null) {
  if (entry.practical === null || entry.theory === null || ratio === null) return 'pending'
  return entry.practical >= course.practicalMinimum &&
    entry.theory >= course.theoryMinimum &&
    ratio >= course.attendanceMinimum
    ? 'pass'
    : 'fail'
}

export function effectiveGradeResult(course: Course, entry: Enrollment, ratio: number | null) {
  const decision = entry.gradeDecisions.at(-1)
  return decision && decision.result !== 'calculated'
    ? decision.result
    : savedGradeResult(course, entry, ratio)
}
