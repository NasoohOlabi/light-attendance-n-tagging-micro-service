import { LogOut, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { neonStudentAttendanceSchema } from '../shared/neon'
import { LanguageSwitch, useLanguage } from './i18n'
import { WartaqLogo } from './brand/components'
import { request } from './neon'
import './roles.css'

type Attendance = z.infer<typeof neonStudentAttendanceSchema>
export function StudentAttendance({ userId, signOut }: { userId: string; signOut: () => void }) {
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
  return (
    <main id="main-content" className="role-page" tabIndex={-1}>
      <header className="role-header">
        <WartaqLogo />
        <div className="header-actions">
          <LanguageSwitch />
          <button
            className="icon-button"
            aria-label={t('Sign out')}
            title={t('Sign out')}
            onClick={signOut}
          >
            <LogOut
              className="icon-directional"
              size={20}
              strokeWidth={1.6}
              aria-hidden="true"
              focusable="false"
            />
          </button>
        </div>
      </header>
      <div className="role-heading">
        <div>
          <span>{ar ? 'طالب' : 'Student'}</span>
          <h1>{ar ? 'حضوري' : 'My attendance'}</h1>
          {data && (
            <p dir="auto">
              {data.student.name}
              {data.student.group && ` · ${data.student.group}`}
            </p>
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
            <table className="role-table">
              <thead>
                <tr>
                  <th>{t('Date')}</th>
                  <th>{ar ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody>
                {data.attendance.map((item) => (
                  <tr key={item.date}>
                    <td>
                      <bdi>{item.date}</bdi>
                    </td>
                    <td>{t(item.status)}</td>
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
