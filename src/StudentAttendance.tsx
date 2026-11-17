import { formatLevel } from './levelFormat'
import { TableHeader, useDataTable } from './DataTable'
import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { neonStudentAttendanceSchema } from '../shared/neon'
import { useLanguage } from './i18n'
import { ProfileMenu, type Profile } from './ProfileMenu'
import { WartaqLogo } from './brand/components'
import { request } from './neon'
import './roles.css'

type Attendance = z.infer<typeof neonStudentAttendanceSchema>
export function StudentAttendance({
  userId,
  signOut,
  profile,
}: {
  userId: string
  signOut: () => void
  profile: Profile
}) {
  const { language, t, errorMessage } = useLanguage()
  const ar = language === 'ar'
  const [data, setData] = useState<Attendance | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let cancelled = false
    request('/api/student/attendance', userId)
      .then((value) => {
        if (!cancelled) {
          setData(neonStudentAttendanceSchema.parse(value))
          setError('')
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setData(null)
          setError(
            cause instanceof Error
              ? cause.message
              : 'The notebook request failed. Please try again.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId, revision])
  const attendanceTable = useDataTable('portal-attendance', data?.attendance ?? [], [
    {
      id: 'course',
      label: ar ? 'الدورة' : 'Course',
      value: (item) => item.course ?? (ar ? 'سجل سابق' : 'Previous record'),
    },
    { id: 'date', label: t('Date'), value: (item) => item.date },
    {
      id: 'status',
      choices: [t('present'), t('absent'), t('excused')],
      label: ar ? 'الحالة' : 'Status',
      value: (item) => t(item.status),
    },
  ])
  return (
    <main id="main-content" className="role-page" tabIndex={-1}>
      <header className="role-header">
        <WartaqLogo />
        <ProfileMenu profile={profile} leave={signOut} />
      </header>
      <div className="role-heading">
        <div>
          <span>{ar ? 'طالب' : 'Student'}</span>
          <h1>{ar ? 'حضوري' : 'My attendance'}</h1>
          {data && (
            <dl className="grid grid-cols-2 gap-2 break-words">
              <div>
                <dt>{ar ? 'الطالب' : 'Student'}</dt>
                <dd dir="auto">{data.student.name}</dd>
              </div>
              <div>
                <dt>{ar ? 'مستوى السجل' : 'Roster level'}</dt>
                <dd dir="auto">{formatLevel(data.student.group) || '—'}</dd>
              </div>
            </dl>
          )}
        </div>
        <button
          className="icon-button"
          aria-label={t('Refresh')}
          title={t('Refresh')}
          disabled={loading}
          onClick={() => {
            setLoading(true)
            setRevision((n) => n + 1)
          }}
        >
          <RefreshCw size={20} strokeWidth={1.6} aria-hidden="true" focusable="false" />
        </button>
      </div>
      {loading && <p role="status">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
      {error && <p role="alert">{errorMessage(error)}</p>}
      {data && !loading && (
        <section className="panel">
          {data.attendance.length ? (
            <table className="mobile-record-table role-table">
              <TableHeader model={attendanceTable} />
              <tbody>
                {attendanceTable.rows.map((item) => (
                  <tr key={`${item.enrollmentId ?? 'legacy'}:${item.date}`}>
                    <td data-label={ar ? 'الدورة' : 'Course'}>
                      {item.course ?? (ar ? 'سجل سابق' : 'Previous record')}
                    </td>
                    <td data-label={t('Date')}>
                      <bdi>{item.date}</bdi>
                    </td>
                    <td data-label={ar ? 'الحالة' : 'Status'}>{t(item.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>{ar ? 'لا توجد سجلات حضور بعد.' : 'No attendance records yet.'}</p>
          )}
        </section>
      )}
    </main>
  )
}
