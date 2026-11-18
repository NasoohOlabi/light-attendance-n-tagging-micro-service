import type { projectEvents } from '../shared/ledger'
import type { Course, Enrollment, NeonRosterStudent } from '../shared/neon'

export function courseReadiness({
  course,
  enrollments,
  students,
  attendance,
}: {
  course: Course
  enrollments: Enrollment[]
  students: NeonRosterStudent[]
  attendance: ReturnType<typeof projectEvents>['attendance']
}) {
  const activeStudents = new Map(
    students.filter((student) => student.active).map((student) => [student.studentId, student]),
  )
  const marked = new Set(
    attendance.flatMap(({ value }) => (value.enrollmentId ? [value.enrollmentId] : [])),
  )
  const rows = enrollments.flatMap((entry) => {
    const student = activeStudents.get(entry.studentId)
    if (!entry.active || entry.courseId !== course.id || !student) return []
    return [{ entry, student, hasAttendance: marked.has(entry.id) }]
  })
  return {
    total: rows.length,
    theory: rows.filter(({ entry }) => entry.theory === null),
    practical: rows.filter(({ entry }) => entry.practical === null),
    attendance: rows.filter((row) => !row.hasAttendance),
    lowTheory: rows.filter(
      ({ entry }) => entry.theory !== null && entry.theory < course.theoryMinimum,
    ),
    lowPractical: rows.filter(
      ({ entry }) => entry.practical !== null && entry.practical < course.practicalMinimum,
    ),
  }
}
