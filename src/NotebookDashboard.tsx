import { statuses, type Attendance, type Student } from '../shared/ledger'
import { useLanguage } from './i18n'
import { setQuery } from './queryState'

type ProjectedAttendance = { value: Attendance }[]

export function NotebookDashboard({
  projected,
  date,
  canAdd,
  onAttendance,
  onAdd,
}: {
  projected: { students: Student[]; attendance: ProjectedAttendance }
  date: string
  canAdd: boolean
  onAttendance: () => void
  onAdd: () => void
}) {
  const { language, t } = useLanguage()
  const ar = language === 'ar'
  const ids = new Set(
    projected.students.filter((student) => student.active).map((student) => student.studentId),
  )
  const records = projected.attendance.filter(({ value }) => ids.has(value.studentId))
  const today = records.filter(({ value }) => value.date === date)
  const recentDates = [
    ...new Set(records.filter(({ value }) => value.date <= date).map(({ value }) => value.date)),
  ]
    .sort()
    .slice(-5)
  const present = records.filter(({ value }) => value.status === 'present')
  const max = Math.max(
    1,
    ...recentDates.map((day) => present.filter(({ value }) => value.date === day).length),
  )
  return (
    <section className="dashboard" aria-label={ar ? 'الرئيسية' : 'Dashboard'}>
      <div className="dashboard-actions">
        <div>
          <h2>{ar ? 'حلقتك اليوم' : 'Your circle today'}</h2>
          <p>
            {ar ? 'ابدأ تسجيل الحضور أو راجع السجل.' : 'Start attendance or review the record.'}
          </p>
        </div>
        <div className="dashboard-buttons">
          <button className="primary dashboard-primary" onClick={onAttendance}>
            {ar ? 'تسجيل الحضور' : 'Take attendance'}
          </button>
          {canAdd && (
            <button className="secondary" onClick={onAdd}>
              {ar ? 'إضافة طالب' : 'Add student'}
            </button>
          )}
        </div>
      </div>
      <div className="dashboard-charts">
        <section className="panel dashboard-chart">
          <div className="dashboard-chart-heading">
            <h2>{ar ? 'الحضور حسب الحالة' : 'Attendance by status'}</h2>
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
          </div>
          {!today.length && (
            <p className="muted">
              {ar ? 'لا توجد علامات لهذا اليوم.' : 'No attendance marked on this date.'}
            </p>
          )}
          <div className="dashboard-statuses">
            {statuses.map((status) => {
              const count = today.filter(({ value }) => value.status === status).length
              return (
                <div key={status}>
                  <span>{t(status)}</span>
                  <strong>{count}</strong>
                  <meter
                    min={0}
                    max={Math.max(today.length, 1)}
                    value={count}
                    aria-label={`${t(status)}: ${count}`}
                  />
                </div>
              )
            })}
          </div>
          <p className="muted">
            {ar
              ? `${today.length} مسجل ${Math.max(0, ids.size - today.length)} غير مسجل`
              : `${today.length} marked, ${Math.max(0, ids.size - today.length)} unmarked`}
          </p>
        </section>
        <section className="panel dashboard-chart">
          <h2>{ar ? 'الجلسات الأخيرة' : 'Recent sessions'}</h2>
          <p className="muted">{ar ? 'عدد الحاضرين في كل يوم' : 'Present per date'}</p>
          {!recentDates.length ? (
            <p className="muted">{ar ? 'لا توجد بيانات حضور بعد.' : 'No attendance data yet.'}</p>
          ) : (
            <ol className="dashboard-trend">
              {recentDates.map((day) => {
                const count = present.filter(({ value }) => value.date === day).length
                return (
                  <li key={day}>
                    <time dateTime={day}>{day}</time>
                    <meter min={0} max={max} value={count} aria-label={`${day}: ${count}`} />
                    <strong>{count}</strong>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>
    </section>
  )
}
