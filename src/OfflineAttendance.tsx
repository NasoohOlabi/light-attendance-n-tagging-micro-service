import { useEffect, useState } from 'react'
import { makeEvent, statuses, type Status } from '../shared/ledger'
import { offlineAttendanceRecordSchema } from '../shared/offlineAttendance'
import { useLanguage } from './useLanguage'
import {
  listPendingAttendance,
  listPreparedRosters,
  queueAttendance,
  resolveAttendanceConflict,
  type PendingAttendance,
  type PreparedRoster,
} from './offlineAttendanceStore'
import { syncOfflineAttendance } from './offlineAttendanceSync'
import { offlineAccess, clearOfflineAccess } from './offlineAccess'
import { AccessDeniedEvent, NeonRequestError } from './neon'

export function OfflineAttendance({
  userId,
  actor,
  close,
  requireLease = false,
}: {
  userId: string
  actor: string
  close: () => void
  requireLease?: boolean
}) {
  const { language, t } = useLanguage()
  const ar = language === 'ar'
  const [rosters, setRosters] = useState<PreparedRoster[]>([])
  const [pending, setPending] = useState<PendingAttendance[]>([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [leaseExpired, setLeaseExpired] = useState(false)
  useEffect(() => {
    const timer = window.setInterval(() => {
      if ((requireLease || !navigator.onLine) && !offlineAccess()) setLeaseExpired(true)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [requireLease])
  const refresh = async () => {
    setRosters(await listPreparedRosters(userId))
    setPending(await listPendingAttendance(userId))
  }
  // The store is external and must be read when the account changes.
  useEffect(() => {
    void refresh().catch(() => setError('Offline storage is unavailable.'))
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])
  const sync = async () => {
    if (!navigator.onLine) return
    setBusy(true)
    try {
      await syncOfflineAttendance(userId)
      await refresh()
      setError('')
    } catch (cause) {
      if (cause instanceof NeonRequestError && (cause.status === 401 || cause.status === 403)) {
        clearOfflineAccess()
        setLeaseExpired(true)
        window.dispatchEvent(new AccessDeniedEvent(userId, cause.status))
      }
      setError(
        ar
          ? 'تعذرت المزامنة. سجّل الدخول مجدداً وحاول مرة أخرى.'
          : 'Sync failed. Sign in again and retry.',
      )
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    const online = () => void sync()
    window.addEventListener('online', online)
    const timer = window.setInterval(online, 5000)
    if (navigator.onLine) void sync()
    return () => {
      window.removeEventListener('online', online)
      window.clearInterval(timer)
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])
  if (leaseExpired)
    return (
      <main id="main-content" className="workspace-auth panel space-y-3">
        <p role="alert">
          {ar
            ? 'انتهت صلاحية الوصول. اتصل بالإنترنت.'
            : 'Offline access expired. Connect and sign in again.'}
        </p>
        <button className="secondary" onClick={close}>
          {ar ? 'رجوع' : 'Back'}
        </button>
      </main>
    )
  const roster = rosters.find((item) => `${item.courseId}:${item.date}` === selected)
  const save = async (student: PreparedRoster['students'][number], status: Status) => {
    if (!roster || student.revision.kind !== 'confirmed') return
    setBusy(true)
    try {
      await queueAttendance(
        userId,
        offlineAttendanceRecordSchema.parse({
          event: makeEvent(actor, {
            kind: 'attendance',
            studentId: student.studentId,
            enrollmentId: student.enrollmentId,
            date: roster.date,
            status,
          }),
          expectedEventId: student.revision.eventId,
        }),
      )
      await refresh()
      setError('')
      if (navigator.onLine) await sync()
    } catch {
      setError(ar ? 'تعذر حفظ الحضور على الجهاز.' : 'Could not save attendance on this device.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <main id="main-content" tabIndex={-1} className="workspace-auth panel space-y-3">
      <h1 className="title">{ar ? 'الحضور دون اتصال' : 'Offline attendance'}</h1>
      <p role="status">
        {navigator.onLine ? (ar ? 'متصل' : 'Online') : ar ? 'دون اتصال' : 'Offline'} آ·{' '}
        {pending.length} {ar ? 'بانتظار المزامنة' : 'pending sync'}
      </p>
      {error && <p role="alert">{error}</p>}
      <label>
        {ar ? 'الجلسة المحضّرة' : 'Prepared session'}
        <select value={selected} onChange={(event) => setSelected(event.target.value)}>
          <option value="">{ar ? 'اختر جلسة' : 'Choose a session'}</option>
          {rosters.map((item) => (
            <option key={`${item.courseId}:${item.date}`} value={`${item.courseId}:${item.date}`}>
              {item.courseName} آ· {item.date}
            </option>
          ))}
        </select>
      </label>
      {!rosters.length && <p>{ar ? 'لا توجد جلسات محضّرة.' : 'No prepared sessions.'}</p>}
      {roster && (
        <div className="space-y-3">
          {roster.students.map((student) => {
            const records = pending.filter(
              (item) =>
                item.event.payload.kind === 'attendance' &&
                item.event.payload.enrollmentId === student.enrollmentId &&
                item.event.payload.date === roster.date,
            )
            const last = records.at(-1)
            const status =
              last?.event.payload.kind === 'attendance'
                ? last.event.payload.status
                : student.revision.kind === 'confirmed'
                  ? student.revision.status
                  : null
            const conflict = records.some((item) => item.outcome)
            const failed = records.find((item) => item.outcome?.kind === 'conflict')
            return (
              <section key={student.studentId} className="rounded-lg border p-3 space-y-2">
                <strong dir="auto">{student.name}</strong>
                <p>
                  {ar ? 'المستوى' : 'Level'}: <bdi>{student.level || '—'}</bdi>
                </p>
                <p role="status">
                  {conflict
                    ? ar
                      ? 'تعارض — يلزم المراجعة'
                      : 'Conflict — review required'
                    : records.length
                      ? ar
                        ? 'محفوظ على الجهاز'
                        : 'Saved on device'
                      : ar
                        ? 'محفوظ على الخادم'
                        : 'Server record'}
                </p>
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label={`${t('Attendance for')} ${student.name}`}
                >
                  {statuses.map((choice) => (
                    <button
                      type="button"
                      key={choice}
                      className={status === choice ? 'primary' : 'secondary'}
                      aria-pressed={status === choice}
                      disabled={busy || conflict || student.revision.kind !== 'confirmed'}
                      onClick={() => void save(student, choice)}
                    >
                      {t(choice)}
                    </button>
                  ))}
                </div>
                {failed && (
                  <div className="flex flex-wrap gap-2">
                    <p className="w-full">
                      {ar
                        ? '\u0627\u0644\u0639\u0644\u0627\u0645\u0629 \u0627\u0644\u0645\u062d\u0641\u0648\u0638\u0629'
                        : 'Saved mark'}
                      :{' '}
                      {failed.outcome?.current?.status
                        ? t(failed.outcome.current.status)
                        : t('Not marked')}{' '}
                      ? {ar ? '\u0639\u0644\u0627\u0645\u062a\u064a' : 'My mark'}:{' '}
                      {status ? t(status) : t('Not marked')}
                    </p>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void resolveAttendanceConflict(userId, failed.event.id, 'server').then(
                          refresh,
                        )
                      }
                    >
                      {ar ? 'الاحتفاظ بعلامة الخادم' : 'Keep saved mark'}
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void resolveAttendanceConflict(userId, failed.event.id, 'local').then(
                          async () => {
                            await refresh()
                            await sync()
                          },
                        )
                      }
                    >
                      {ar ? 'استخدام علامتي' : 'Use my mark'}
                    </button>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
      {pending.some((item) => item.outcome) && (
        <p role="alert">
          {ar
            ? 'بقيت العلامات المتعارضة على الجهاز. تواصل مع المسؤول للمراجعة.'
            : 'Conflicting marks remain on this device. Contact an administrator to review them.'}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className="secondary"
          disabled={busy || !navigator.onLine}
          onClick={() => void sync()}
        >
          {ar ? 'مزامنة الآن' : 'Sync now'}
        </button>
        <button className="secondary" onClick={close}>
          {ar ? 'رجوع' : 'Back'}
        </button>
      </div>
    </main>
  )
}
