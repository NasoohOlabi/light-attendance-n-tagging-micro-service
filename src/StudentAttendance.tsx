import { today } from './queryState'
import { formatLevel } from './levelFormat'
import { TableHeader, TableToolbar } from './DataTable'
import { useDataTable } from './useDataTable'
import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { neonStudentAttendanceSchema } from '../shared/neon'
import { useLanguage } from './useLanguage'
import { ProfileMenu, type Profile } from './ProfileMenu'
import { WartaqLogo } from './brand/components'
import { request } from './neon'

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
          setError(cause instanceof Error ? cause.message : 'The request failed. Please try again.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId, revision])
  const attendanceTable = useDataTable(
    'portal-attendance',
    [...(data?.attendance ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [
      {
        id: 'course',
        label: ar ? 'الدورة' : 'Course',
        value: (item) => item.course ?? (ar ? 'سجل سابق' : 'Previous record'),
      },
      { id: 'date', filterMode: 'literal', label: t('Date'), value: (item) => item.date },
      {
        id: 'status',
        choices: [t('present'), t('absent'), t('excused')],
        label: ar ? 'الحالة' : 'Status',
        value: (item) => t(item.status),
      },
    ],
  )
  return (
    <main id="main-content" className="role-page" tabIndex={-1}>
      <header className="role-header">
        <WartaqLogo />
        <ProfileMenu profile={profile} leave={signOut} />
      </header>
      <div className="role-heading">
        <div className="min-w-0 grow">
          <span>{ar ? 'طالب' : 'Student'}</span>
          <TableToolbar
            model={!loading && data?.attendance.length ? attendanceTable : undefined}
            actions={
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
            }
          >
            <h1>{ar ? 'حضوري' : 'My attendance'}</h1>
          </TableToolbar>
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
      </div>
      {loading && <p role="status">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
      {error && <p role="alert">{errorMessage(error)}</p>}
      {data && !loading && (
        <section className="panel">
          {!data.attendance.some((item) => item.date === today()) && (
            <p>
              {ar
                ? '\u0644\u0627 \u064a\u0648\u062c\u062f \u0633\u062c\u0644 \u062d\u0636\u0648\u0631 \u0644\u0644\u064a\u0648\u0645.'
                : 'No attendance recorded today.'}
            </p>
          )}
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
