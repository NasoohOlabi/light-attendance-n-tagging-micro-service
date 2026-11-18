import type { ReactNode } from 'react'
import { useState } from 'react'
import type { Attendance, Student } from '../shared/ledger'
import { useLanguage } from './i18n'
import { setQuery } from './queryState'
import './dashboard.css'

export function NotebookDashboard({
  projected,
  date,
  canAdd,
  canRecord,
  onAttendance,
  onAdd,
  onStudent,
  children,
}: {
  projected: { students: Student[]; attendance: { value: Attendance }[] }
  date: string
  canAdd: boolean
  canRecord: boolean
  onAttendance: (unmarked?: boolean) => void
  onAdd: () => void
  onStudent: (studentId: string, trigger: HTMLElement) => void
  children?: ReactNode
}) {
  const { language, t } = useLanguage()
  const ar = language === 'ar'
  const [showAll, setShowAll] = useState(false)
  const students = projected.students.filter((student) => student.active)
  const ids = new Set(students.map((student) => student.studentId))
  const records = projected.attendance.filter(
    ({ value }) => ids.has(value.studentId) && value.date <= date,
  )
  const dates = [
    ...new Set(
      projected.attendance.filter(({ value }) => value.date <= date).map(({ value }) => value.date),
    ),
  ]
    .sort()
    .slice(-6)
  const marksByStudent = new Map<string, Map<string, Attendance['status']>>()
  for (const { value } of records) {
    const marks = marksByStudent.get(value.studentId) ?? new Map<string, Attendance['status']>()
    marks.set(value.date, value.status)
    marksByStudent.set(value.studentId, marks)
  }
  const rows = students
    .map((student) => {
      const marks = dates.map(
        (day) => marksByStudent.get(student.studentId)?.get(day) ?? 'unmarked',
      )
      return { student, marks, absences: marks.filter((mark) => mark === 'absent').length }
    })
    .filter((row) => row.absences > 0)
    .sort(
      (a, b) => b.absences - a.absences || a.student.name.localeCompare(b.student.name, language),
    )
  const marked = new Set(
    records.filter(({ value }) => value.date === date).map(({ value }) => value.studentId),
  ).size
  const unmarked = students.length - marked
  const numberFormatter = new Intl.NumberFormat(language)
  const dateFormatter = new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const number = (value: number) => numberFormatter.format(value)
  const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00Z`))
  const dateLabels = new Map(dates.map((day) => [day, formatDate(day)]))
  const markLabel = (mark: Attendance['status'] | 'unmarked') =>
    mark === 'unmarked' ? (ar ? 'غير مسجل' : 'Unmarked') : t(mark)
  return (
    <section className="dashboard" aria-label={ar ? 'الرئيسية' : 'Dashboard'}>
      <section className="dashboard-actions">
        <div className="dashboard-session">
          <label>
            {t('Session date')}
            <input
              type="date"
              value={date}
              onChange={(event) => {
                if (event.target.value) setQuery({ date: event.target.value })
              }}
            />
          </label>
          {!canRecord ? (
            <p className="muted">
              {ar ? 'الحضور متاح للعرض فقط هنا.' : 'Attendance is view-only here.'}
            </p>
          ) : !students.length ? (
            <p className="muted">
              {ar ? 'لا يوجد طلاب حاليون في هذا العرض.' : 'No current students in this view.'}
            </p>
          ) : (
            <>
              <p>
                {ar
                  ? `${number(marked)} مسجل، ${number(unmarked)} غير مسجل`
                  : `${number(marked)} marked, ${number(unmarked)} unmarked`}
              </p>
              {unmarked === 0 && (
                <p className="muted">
                  {ar ? 'تم تسجيل حضور جميع الطلاب.' : 'Attendance is complete for this date.'}
                </p>
              )}
            </>
          )}
        </div>
        <div className="dashboard-buttons">
          <button
            className="primary dashboard-primary"
            onClick={() => onAttendance(canRecord && marked > 0 && unmarked > 0)}
          >
            {canRecord && marked > 0 && unmarked > 0
              ? ar
                ? `\u0645\u062a\u0627\u0628\u0639\u0629 \u0627\u0644\u062d\u0636\u0648\u0631 (${unmarked})`
                : `Continue attendance · ${unmarked} unmarked`
              : ar
                ? '\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062d\u0636\u0648\u0631'
                : 'Take attendance'}
          </button>
          {canAdd && (
            <button className="secondary" onClick={onAdd}>
              {ar ? 'إضافة طالب' : 'Add student'}
            </button>
          )}
        </div>
      </section>
      <section className="panel dashboard-insight">
        <h2>{ar ? 'طلاب للمتابعة' : 'Students to follow up'}</h2>
        <p className="muted">
          {ar
            ? 'أكثر الطلاب غياباً في آخر ست جلسات مسجلة حتى التاريخ المحدد. افتح اسم الطالب للاطلاع على بيانات التواصل وسجل الحضور.'
            : 'Most recorded absences across the last six sessions through the selected date. Open a name for contact details and attendance history.'}
        </p>
        {!dates.length ? (
          <p className="muted">{ar ? 'لا توجد بيانات حضور بعد.' : 'No attendance data yet.'}</p>
        ) : !rows.length ? (
          <p className="muted">
            {ar
              ? 'لا توجد غيابات مسجلة تحتاج للمتابعة في هذه الفترة.'
              : 'No recorded absences to follow up in this window.'}
          </p>
        ) : (
          <>
            <ol className="dashboard-followups">
              {(showAll ? rows : rows.slice(0, 5)).map(({ student, marks, absences }) => (
                <li key={student.studentId}>
                  <div className="dashboard-followup-heading">
                    <button
                      className="dashboard-student"
                      onClick={(event) => onStudent(student.studentId, event.currentTarget)}
                      dir="auto"
                    >
                      {student.name}
                    </button>
                    <strong>
                      {ar
                        ? `${number(absences)} غياب`
                        : `${number(absences)} ${absences === 1 ? 'absence' : 'absences'}`}
                    </strong>
                  </div>
                  <ul
                    className="dashboard-strip"
                    aria-label={
                      ar
                        ? `الحضور الأخير لـ ${student.name}`
                        : `Recent attendance for ${student.name}`
                    }
                  >
                    {dates.map((day, index) => (
                      <li key={day} className={`dashboard-mark dashboard-mark-${marks[index]}`}>
                        <time dateTime={day}>{dateLabels.get(day)}</time>
                        <span>{markLabel(marks[index])}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
            {rows.length > 5 && (
              <button
                className="secondary dashboard-show-all"
                aria-expanded={showAll}
                onClick={() => setShowAll(!showAll)}
              >
                {showAll
                  ? ar
                    ? 'عرض أقل'
                    : 'Show less'
                  : ar
                    ? `عرض الكل (${number(rows.length)})`
                    : `Show all (${number(rows.length)})`}
              </button>
            )}
          </>
        )}
      </section>
      {children}
    </section>
  )
}
