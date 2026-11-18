import type { projectEvents, Status } from '../shared/ledger'
import type { Course, Enrollment, neonAdminBoardSchema } from '../shared/neon'
import { courseAttendance, effectiveGradeResult } from '../shared/courseGrading'

type Student = Pick<
  ReturnType<typeof neonAdminBoardSchema.parse>['students'][number],
  'studentId' | 'name' | 'firstName' | 'lastName'
> &
  Partial<
    Pick<
      ReturnType<typeof neonAdminBoardSchema.parse>['students'][number],
      'group' | 'active' | 'whatsapp' | 'location' | 'birthYear'
    >
  >
type Attendance = ReturnType<typeof projectEvents>['attendance']
export type CourseExportReport = 'full' | 'grades' | 'students' | 'attendance' | 'participants'
export type CourseExportColumn =
  | 'firstName'
  | 'lastName'
  | 'level'
  | 'enrolled'
  | 'theory'
  | 'practical'
  | 'present'
  | 'absent'
  | 'excused'
  | 'total'
  | 'ratio'
  | 'result'
  | 'date'
  | 'mark'
  | 'rosterLevel'
  | 'studentActive'
  | 'whatsapp'
  | 'location'
  | 'birthYear'
  | 'teacher'
  | 'handbook'
export type CourseExportOptions = {
  report: CourseExportReport
  columns?: CourseExportColumn[]
  enrollment?: 'all' | 'active' | 'withdrawn'
  studentId?: string
  level?: string
  coverage?: 'all' | 'any' | 'both' | 'theory' | 'practical' | 'none'
  result?: 'all' | 'pass' | 'fail' | 'pending'
  from?: string
  to?: string
  mark?: 'all' | Status
}
export type CourseExportInput = {
  course: Course
  entries: Enrollment[]
  students: Student[]
  attendance: Attendance
  ar: boolean
  options?: CourseExportOptions
}
type Cell = string | number | null

export const courseExportColumnLabels: Record<CourseExportColumn, [string, string]> = {
  firstName: ['First name', 'الاسم الأول'],
  lastName: ['Last name', 'اسم العائلة'],
  level: ['Course level', 'مستوى الدورة'],
  enrolled: ['Enrolled', 'مسجل'],
  theory: ['Theory', 'نظري'],
  practical: ['Practical', 'عملي'],
  present: ['Present', 'حاضر'],
  absent: ['Absent', 'غائب'],
  excused: ['Excused', 'معذور'],
  total: ['Total recorded', 'المجموع'],
  ratio: ['Attendance %', 'الحضور %'],
  result: ['Result', 'النتيجة'],
  date: ['Date', 'التاريخ'],
  mark: ['Attendance', 'الحضور'],
  rosterLevel: ['Roster level', 'مستوى السجل'],
  studentActive: ['Student active', 'الطالب نشط'],
  whatsapp: ['WhatsApp', 'واتساب'],
  location: ['Location', 'الموقع'],
  birthYear: ['Birth year', 'سنة الميلاد'],
  teacher: ['Teacher', 'المعلم'],
  handbook: ['Handbook received', 'استلم الدليل'],
}
const identity: CourseExportColumn[] = ['firstName', 'lastName', 'level', 'enrolled']
const gradeColumns: CourseExportColumn[] = [
  ...identity,
  'theory',
  'practical',
  'present',
  'absent',
  'excused',
  'total',
  'ratio',
  'result',
]
const studentColumns: CourseExportColumn[] = [
  ...identity,
  'rosterLevel',
  'studentActive',
  'teacher',
  'handbook',
  'whatsapp',
  'location',
  'birthYear',
]
export function courseExportColumns(report: CourseExportReport): CourseExportColumn[] {
  switch (report) {
    case 'full':
      return [...gradeColumns, ...studentColumns.filter((column) => !gradeColumns.includes(column))]
    case 'grades':
      return gradeColumns
    case 'students':
      return studentColumns
    case 'attendance':
      return [...identity, 'date', 'mark']
    case 'participants':
      return [...identity, 'theory', 'practical']
  }
}
export function courseExportDefaultColumns(report: CourseExportReport): CourseExportColumn[] {
  if (report === 'full') return gradeColumns
  if (report === 'grades') return ['firstName', 'lastName', 'theory', 'practical', 'result']
  return report === 'students' ? identity : courseExportColumns(report)
}

export function courseExportRows(input: CourseExportInput): Record<CourseExportColumn, Cell>[] {
  const { course, entries, students, attendance, ar } = input
  const options = input.options
  const studentById = new Map(students.map((student) => [student.studentId, student]))
  const attendanceByEnrollment = new Map<string, Attendance>()
  for (const row of attendance) {
    if (!row.value.enrollmentId) continue
    const rows = attendanceByEnrollment.get(row.value.enrollmentId) ?? []
    rows.push(row)
    attendanceByEnrollment.set(row.value.enrollmentId, rows)
  }
  const yesNo = (value: boolean) => (value ? (ar ? 'نعم' : 'Yes') : ar ? 'لا' : 'No')
  return entries
    .filter((entry) => {
      if (entry.courseId !== course.id) return false
      if (
        (options?.enrollment === 'active' && !entry.active) ||
        (options?.enrollment === 'withdrawn' && entry.active)
      )
        return false
      if (options?.studentId && entry.studentId !== options.studentId) return false
      if (options?.level !== undefined && entry.level !== options.level) return false
      if (
        options?.result &&
        options.result !== 'all' &&
        effectiveGradeResult(
          course,
          entry,
          courseAttendance(attendanceByEnrollment.get(entry.id) ?? [], entry).ratio,
        ) !== options.result
      )
        return false
      const theory = entry.theory !== null
      const practical = entry.practical !== null
      if (options?.report === 'participants' && !theory && !practical) return false
      switch (options?.coverage) {
        case 'any':
          if (!theory && !practical) return false
          break
        case 'both':
          if (!theory || !practical) return false
          break
        case 'theory':
          if (!theory) return false
          break
        case 'practical':
          if (!practical) return false
          break
        case 'none':
          if (theory || practical) return false
          break
      }
      return true
    })
    .flatMap((entry) => {
      const student = studentById.get(entry.studentId)
      const counts = courseAttendance(attendanceByEnrollment.get(entry.id) ?? [], entry)
      const result = effectiveGradeResult(course, entry, counts.ratio)
      const row: Record<CourseExportColumn, Cell> = {
        firstName: student?.firstName || student?.name || '',
        lastName: student?.lastName ?? '',
        level: entry.level,
        enrolled: yesNo(entry.active),
        theory: entry.theory,
        practical: entry.practical,
        present: counts.present,
        absent: counts.absent,
        excused: counts.excused,
        total: counts.total,
        ratio: counts.ratio,
        result:
          result === 'pending'
            ? ar
              ? 'قيد الانتظار'
              : 'Pending'
            : result === 'pass'
              ? ar
                ? 'ناجح'
                : 'Pass'
              : ar
                ? 'راسب'
                : 'Fail',
        date: '',
        mark: '',
        rosterLevel: student?.group ?? '',
        studentActive: student ? yesNo(student.active ?? false) : '',
        whatsapp: student?.whatsapp ?? '',
        location: student?.location ?? '',
        birthYear: student?.birthYear ?? null,
        teacher: entry.teacherName ?? '',
        handbook: yesNo(entry.handbookReceived),
      }
      if (options?.report !== 'attendance') return [row]
      return (attendanceByEnrollment.get(entry.id) ?? [])
        .filter(
          ({ value }) =>
            value.enrollmentId === entry.id &&
            value.studentId === entry.studentId &&
            (!options.from || value.date >= options.from) &&
            (!options.to || value.date <= options.to) &&
            (!options.mark || options.mark === 'all' || value.status === options.mark),
        )
        .map(({ value }) => ({
          ...row,
          date: value.date,
          mark: courseExportColumnLabels[value.status][ar ? 1 : 0],
        }))
    })
}

export async function courseWorkbook(input: CourseExportInput) {
  const { course, ar } = input
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const report = input.options?.report ?? 'full'
  const allowed = courseExportColumns(report)
  const columns = (input.options?.columns ?? courseExportDefaultColumns(report)).filter((column) =>
    allowed.includes(column),
  )
  const metadata: Cell[][] = [
    ar
      ? ['الدورة', 'الحالة', 'الحد الأدنى للحضور %', 'درجة النجاح النظري', 'درجة النجاح العملي']
      : [
          'Course',
          'Status',
          'Minimum attendance %',
          'Theory passing grade',
          'Practical passing grade',
        ],
    [
      course.name,
      course.open ? (ar ? 'مفتوحة' : 'Open') : ar ? 'مغلقة' : 'Closed',
      course.attendanceMinimum,
      course.theoryMinimum,
      course.practicalMinimum,
    ],
    [],
  ]
  const rows: Cell[][] = [
    ...(report === 'full' ? metadata : []),
    columns.map((column) => courseExportColumnLabels[column][ar ? 1 : 0]),
    ...courseExportRows(input).map((row) => columns.map((column) => row[column])),
  ]
  return writeExcelFile(rows, {
    columns: Array.from({ length: Math.max(columns.length, 5) }, () => ({ width: 22 })),
  }).toBlob()
}

export async function downloadCourseWorkbook(input: CourseExportInput) {
  const blob = await courseWorkbook(input)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const name =
    input.course.name
      .replace(/[\\/:*?"<>|\p{Cc}]/gu, '_')
      .replace(/[. ]+$/g, '')
      .slice(0, 100) || 'course'
  const report = input.options?.report ?? 'full'
  link.download = `${name}${report === 'full' ? '' : `-${report}`}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}
