import type { projectEvents } from '../shared/ledger'
import type { Course, Enrollment, NeonRosterStudent } from '../shared/neon'
import { courseReadiness } from './readinessCounts'
import { useLanguage } from './useLanguage'
import './course-readiness.css'

export function CourseReadiness({
  course,
  enrollments,
  students,
  attendance,
  onGrades,
}: {
  course: Course
  enrollments: Enrollment[]
  students: NeonRosterStudent[]
  attendance: ReturnType<typeof projectEvents>['attendance']
  onGrades: () => void
}) {
  const { language } = useLanguage()
  const ar = language === 'ar'
  const readiness = courseReadiness({ course, enrollments, students, attendance })
  const number = new Intl.NumberFormat(language).format
  const groups = [
    {
      title: ar ? 'يحتاجون إلى تدريب' : 'Needs practice',
      categories: [
        {
          label: ar ? 'نظري دون الحد' : 'Theory below minimum',
          rows: readiness.lowTheory,
          score: 'theory' as const,
          minimum: course.theoryMinimum,
        },
        {
          label: ar ? 'عملي دون الحد' : 'Practical below minimum',
          rows: readiness.lowPractical,
          score: 'practical' as const,
          minimum: course.practicalMinimum,
        },
      ],
    },
    {
      title: ar ? 'بيانات ناقصة' : 'Missing evidence',
      categories: [
        { label: ar ? 'الدرجة النظرية الناقصة' : 'Missing theory score', rows: readiness.theory },
        {
          label: ar ? 'الدرجة العملية الناقصة' : 'Missing practical score',
          rows: readiness.practical,
        },
        { label: ar ? 'لا يوجد حضور مسجل' : 'No attendance recorded', rows: readiness.attendance },
      ],
    },
  ]
  return (
    <section className="panel course-readiness" aria-labelledby="course-readiness-title">
      <div className="course-readiness-heading">
        <div>
          <h2 id="course-readiness-title">
            {ar ? 'الاستعداد لنتائج الدورة' : 'Course result readiness'}
          </h2>
          <p className="muted">
            {course.name} ·{' '}
            {ar
              ? `${number(readiness.total)} طالب مسجل نشط`
              : `${number(readiness.total)} active enrolled students`}
          </p>
        </div>
        <button type="button" className="secondary" onClick={onGrades}>
          {ar ? 'فتح الدرجات' : 'Open grades'}
        </button>
      </div>
      <p className="muted">
        {ar
          ? course.open
            ? 'الدرجات الناقصة تمنع الإغلاق من صفحة الدرجات. تحتاج النتيجة المحسوبة أيضاً إلى سجل حضور.'
            : 'الدورة مغلقة. تحتاج النتيجة المحسوبة أيضاً إلى سجل حضور.'
          : course.open
            ? 'Missing scores prevent closing from Grades. The calculated result also needs an attendance record.'
            : 'This course is closed. The calculated result also needs an attendance record.'}
      </p>
      {readiness.total === 0 ? (
        <p>
          {ar
            ? 'لا يوجد طلاب نشطون في هذه الدورة.'
            : 'No active students are enrolled in this course.'}
        </p>
      ) : (
        <div className="course-readiness-groups">
          {groups.map(({ title, categories }) => (
            <section key={title}>
              <h3>{title}</h3>
              <ul className="course-readiness-list">
                {categories.map((category) => {
                  const { label, rows } = category
                  const scored = 'score' in category ? category : undefined
                  return (
                    <li key={label}>
                      <div className="course-readiness-row">
                        <span>
                          {label}
                          {scored && ` (${ar ? 'الحد' : 'minimum'} ${number(scored.minimum)})`}
                        </span>
                        <strong>
                          {number(rows.length)} / {number(readiness.total)}
                        </strong>
                      </div>
                      <meter
                        min={0}
                        max={readiness.total}
                        value={rows.length}
                        aria-label={`${label}: ${number(rows.length)} / ${number(readiness.total)}`}
                      />
                      {rows.length > 0 && (
                        <details>
                          <summary>{ar ? 'عرض الطلاب' : 'Show students'}</summary>
                          <ul>
                            {rows.map(({ student, entry }) => {
                              const score = scored ? entry[scored.score] : null
                              return (
                                <li key={student.studentId}>
                                  <bdi>{student.name}</bdi>
                                  {score !== null && ` — ${number(score)}`}
                                </li>
                              )
                            })}
                          </ul>
                        </details>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      <p className="muted">
        {ar ? 'قد يظهر الطالب في أكثر من قائمة.' : 'A student can appear in more than one list.'}
      </p>
    </section>
  )
}
