import type { projectEvents, Student } from './ledger'

type Attendance = ReturnType<typeof projectEvents>['attendance']
export const studentsPerChart = 6

export function attendanceChartRows(students: Student[], attendance: Attendance) {
  const counts = new Map<string, { present: number; total: number }>()
  for (const { value } of attendance) {
    const count = counts.get(value.studentId) ?? { present: 0, total: 0 }
    count.total++
    if (value.status === 'present') count.present++
    counts.set(value.studentId, count)
  }
  return students
    .map((student) => {
      const { present, total } = counts.get(student.studentId) ?? { present: 0, total: 0 }
      return {
        student,
        present,
        total,
        rate: total ? present / total : null,
      }
    })
    .sort(
      (a, b) =>
        (b.rate ?? -1) - (a.rate ?? -1) ||
        a.student.name.localeCompare(b.student.name) ||
        a.student.studentId.localeCompare(b.student.studentId),
    )
}

export function labelChartRows(
  rows: ReturnType<typeof attendanceChartRows>,
  language: 'en' | 'ar',
  showNames: boolean,
  highlight: string,
) {
  const ar = language === 'ar'
  const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 1 })
  const number = new Intl.NumberFormat(language)
  return rows.map(({ student, present, total, rate }, index) => {
    const highlighted = student.studentId === highlight
    return {
      id: student.studentId,
      highlighted,
      rate,
      label:
        showNames || highlighted
          ? student.name
          : `${ar ? 'طالب' : 'Student'} ${number.format(index + 1)}`,
      evidence:
        rate === null
          ? ar
            ? 'لا سجلات'
            : 'No records'
          : `${percent.format(rate)} (${number.format(present)}/${number.format(total)})`,
    }
  })
}
