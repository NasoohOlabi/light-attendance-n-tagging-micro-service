import type { projectEvents } from '../shared/ledger'
import type { Course, Enrollment, neonAdminBoardSchema } from '../shared/neon'
import { courseAttendance, effectiveGradeResult } from '../shared/courseGrading'

type Student = Pick<
  ReturnType<typeof neonAdminBoardSchema.parse>['students'][number],
  'studentId' | 'name' | 'firstName' | 'lastName'
>
type Attendance = ReturnType<typeof projectEvents>['attendance']

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
        const result = effectiveGradeResult(course, entry, counts.ratio)
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
