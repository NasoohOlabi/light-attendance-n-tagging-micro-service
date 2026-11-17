import type { projectEvents } from '../shared/ledger'
import type { Course, Enrollment, neonAdminBoardSchema } from '../shared/neon'

type Student = Pick<
  ReturnType<typeof neonAdminBoardSchema.parse>['students'][number],
  'studentId' | 'name' | 'firstName' | 'lastName'
>
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

export async function courseWorkbook({
  course,
  entries,
  students,
  attendance,
  ar,
}: {
  course: Course
  entries: Enrollment[]
  students: Student[]
  attendance: Attendance
  ar: boolean
}) {
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const rows = [
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
    ar
      ? [
          'الاسم الأول',
          'اسم العائلة',
          'مستوى الدورة',
          'مسجل',
          'نظري',
          'عملي',
          'حاضر',
          'غائب',
          'معذور',
          'المجموع',
          'الحضور %',
          'النتيجة',
        ]
      : [
          'First name',
          'Last name',
          'Course level',
          'Enrolled',
          'Theory',
          'Practical',
          'Present',
          'Absent',
          'Excused',
          'Total recorded',
          'Attendance %',
          'Result',
        ],
    ...entries
      .filter((entry) => entry.courseId === course.id)
      .map((entry) => {
        const student = students.find((item) => item.studentId === entry.studentId)
        const counts = courseAttendance(attendance, entry)
        const decision = entry.gradeDecisions.at(-1)
        const result =
          decision && decision.result !== 'calculated'
            ? decision.result
            : savedGradeResult(course, entry, counts.ratio)
        return [
          student?.firstName || student?.name || '',
          student?.lastName ?? '',
          entry.level,
          entry.active ? (ar ? 'نعم' : 'Yes') : ar ? 'لا' : 'No',
          entry.theory,
          entry.practical,
          counts.present,
          counts.absent,
          counts.excused,
          counts.total,
          counts.ratio,
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
        ]
      }),
  ]
  return writeExcelFile(rows, {
    columns: Array.from({ length: 12 }, () => ({ width: 22 })),
  }).toBlob()
}

export async function downloadCourseWorkbook(input: Parameters<typeof courseWorkbook>[0]) {
  const blob = await courseWorkbook(input)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${
    input.course.name
      .replace(/[\\/:*?"<>|\p{Cc}]/gu, '_')
      .replace(/[. ]+$/g, '')
      .slice(0, 100) || 'course'
  }.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}
