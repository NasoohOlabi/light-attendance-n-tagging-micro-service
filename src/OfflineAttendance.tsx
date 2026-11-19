import { useEffect, useRef, useState } from 'react'
import { makeEvent, normalizedNoteTags, statuses, type Status } from '../shared/ledger'
import { offlineAttendanceRecordSchema } from '../shared/offlineAttendance'
import { offlineStudentOperationSchema } from '../shared/offlineStudent'
import { useLanguage } from './useLanguage'
import { setQuery, useQueryState } from './queryState'
import {
  cacheOfflineRoster,
  attendanceKey,
  getOfflineSnapshot,
  listPendingAttendance,
  listPendingStudent,
  queueStudentOperation,
  resolveStudentConflict,
  studentOperationId,
  type PendingStudent,
  listPreparedRosters,
  queueAttendance,
  resolveAttendanceConflict,
  type PendingAttendance,
  type PreparedRoster,
  type OfflineSnapshot,
} from './offlineAttendanceStore'
import { syncOfflineAttendance, syncOfflineStudent } from './offlineAttendanceSync'
import { offlineAccess, clearOfflineAccess } from './offlineAccess'
import { AccessDeniedEvent, NeonRequestError, getNotebook } from './neon'

export function OfflineAttendance({
  userId,
  actor,
  close,
  reviewChanges = false,
}: {
  userId: string
  actor: string
  close: () => void
  reviewChanges?: boolean
}) {
  const { language, t } = useLanguage()
  const ar = language === 'ar'
  const [rosters, setRosters] = useState<PreparedRoster[]>([])
  const [pending, setPending] = useState<PendingAttendance[]>([])
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null)
  const [studentPending, setStudentPending] = useState<PendingStudent[]>([])
  const [studentId, setStudentId] = useState('')
  const [note, setNote] = useState('')
  const [tags, setTags] = useState('')
  const [phoneDraft, setPhoneDraft] = useState<string>()
  const query = useQueryState()
  const date = query.date
  const selected = query.course
  const showAttendance = !reviewChanges && query.tab === 'attendance'
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const saveLock = useRef(false)
  const [syncing, setSyncing] = useState(false)
  const syncLock = useRef(false)
  const revalidated = useRef(false)
  const [leaseExpired, setLeaseExpired] = useState(false)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (offlineAccess()?.userId !== userId) setLeaseExpired(true)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [userId])
  const refresh = async () => {
    setSnapshot(await getOfflineSnapshot(userId))
    setRosters(await listPreparedRosters(userId))
    setPending(await listPendingAttendance(userId))
    setStudentPending(await listPendingStudent(userId))
    setLoaded(true)
  }
  // The store is external and must be read when the account changes.
  useEffect(() => {
    void refresh().catch(() => setError('Offline storage is unavailable.'))
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])
  const sync = async (retryBlocked = false) => {
    if (!navigator.onLine || syncLock.current) return
    syncLock.current = true
    setSyncing(true)
    try {
      if (!revalidated.current) {
        const notebook = await getNotebook(userId)
        if (!notebook.teacher.canRead || !notebook.teacher.canWrite) throw new NeonRequestError(403)
        await cacheOfflineRoster(userId, notebook)
        await refresh()
        revalidated.current = true
      }
      const results = await Promise.allSettled([
        syncOfflineAttendance(userId, retryBlocked),
        syncOfflineStudent(userId, retryBlocked),
      ])
      await refresh()
      for (const result of results) if (result.status === 'rejected') throw result.reason
      setError('')
    } catch (cause) {
      if (cause instanceof NeonRequestError && cause.status === 403) {
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
      syncLock.current = false
      setSyncing(false)
    }
  }
  useEffect(() => {
    const online = () => void sync(true)
    const offline = () => {
      revalidated.current = false
    }
    window.addEventListener('offline', offline)
    window.addEventListener('online', online)
    const timer = window.setInterval(() => void sync(), 5000)
    if (navigator.onLine) void sync(true)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
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
  const course = snapshot?.courses.find((item) => item.id === selected)
  const selectedStudent = snapshot?.students.find((student) => student.id === studentId)
  const pendingContact = studentPending.findLast(
    ({ operation }) => operation.kind === 'contact' && operation.studentId === studentId,
  )
  const savedPhone =
    pendingContact?.operation.kind === 'contact'
      ? (pendingContact.operation.whatsapp ?? '')
      : (selectedStudent?.phone ?? '')
  const phone = phoneDraft ?? savedPhone
  const notes = (snapshot?.notes ?? []).filter((item) => item.studentId === studentId)
  const localNotes = studentPending.flatMap(({ operation }) =>
    operation.kind === 'note' &&
    operation.event.payload.studentId === studentId &&
    !notes.some((item) => item.id === operation.event.id)
      ? [{ ...operation.event.payload, id: operation.event.id }]
      : [],
  )
  const roster: PreparedRoster | undefined =
    course && snapshot
      ? {
          courseId: course.id,
          courseName: course.name,
          date,
          students: course.enrollments.flatMap((enrollment) => {
            const student = snapshot.students.find((item) => item.id === enrollment.studentId)
            if (!student) return []
            const mark = snapshot.attendance.find(
              (item) => item.enrollmentId === enrollment.id && item.date === date,
            )
            return [
              {
                studentId: student.id,
                enrollmentId: enrollment.id,
                name: student.name,
                group: student.group,
                level: enrollment.level,
                revision: {
                  kind: 'confirmed',
                  eventId: mark?.eventId ?? null,
                  status: mark?.status ?? null,
                },
              },
            ]
          }),
        }
      : rosters.find((item) => item.courseId === selected && item.date === date)
  const save = async (student: PreparedRoster['students'][number], status: Status) => {
    if (!roster || student.revision.kind !== 'confirmed') return
    setSaving(true)
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
      if (navigator.onLine) void sync()
    } catch {
      setError(ar ? 'تعذر حفظ الحضور على الجهاز.' : 'Could not save attendance on this device.')
    } finally {
      setSaving(false)
    }
  }
  const changeStatus = (
    kind?: 'conflict' | 'id_conflict' | 'forbidden' | 'saved' | 'unchanged',
  ) => {
    switch (kind) {
      case 'conflict':
        return ar ? 'تعارض — يلزم المراجعة' : 'Conflict — review required'
      case 'id_conflict':
        return ar ? 'يلزم مراجعة المسؤول' : 'Needs administrator review'
      case 'forbidden':
        return ar
          ? 'متوقف — حاول المزامنة عند استعادة الصلاحية'
          : 'Blocked — retry when access returns'
      default:
        return ar ? 'بانتظار المزامنة' : 'Pending sync'
    }
  }
  const pendingCount = pending.length + studentPending.length
  return (
    <main id="main-content" tabIndex={-1} className="workspace-auth panel space-y-3">
      <h1 className="title">
        {reviewChanges
          ? ar
            ? 'تغييراتي'
            : 'My changes'
          : ar
            ? 'الدفتر دون اتصال'
            : 'Offline notebook'}
      </h1>
      <p role="status">
        {navigator.onLine ? (ar ? 'متصل' : 'Online') : ar ? 'دون اتصال' : 'Offline'} آ·{' '}
        {pendingCount} {ar ? 'بانتظار المزامنة' : 'pending sync'}
      </p>
      {error && <p role="alert">{error}</p>}
      <nav
        hidden={reviewChanges}
        className={reviewChanges ? undefined : 'flex flex-wrap gap-2'}
        aria-label={ar ? 'الدفتر' : 'Notebook'}
      >
        <button
          className={showAttendance ? 'secondary' : 'primary'}
          aria-pressed={!showAttendance}
          onClick={() => setQuery({ tab: 'roster' })}
        >
          {t('Students')}
        </button>
        <button
          className={showAttendance ? 'primary' : 'secondary'}
          aria-pressed={showAttendance}
          onClick={() => setQuery({ tab: 'attendance' })}
        >
          {ar ? 'الحضور' : 'Attendance'}
        </button>
      </nav>
      {!reviewChanges && !snapshot && !rosters.length && (
        <p>{ar ? 'لا توجد بيانات محفوظة.' : 'No saved roster on this device.'}</p>
      )}
      {showAttendance && (
        <>
          <div className="space-y-1">
            <label htmlFor="offline-course">{ar ? 'الدورة' : 'Course'}</label>
            <select
              id="offline-course"
              value={selected}
              onChange={(event) => setQuery({ course: event.target.value })}
            >
              <option value="">{ar ? 'اختر دورة' : 'Choose a course'}</option>
              {(
                snapshot?.courses ??
                rosters.map((item) => ({ id: item.courseId, name: item.courseName }))
              )
                .filter(
                  (item, index, all) => all.findIndex((entry) => entry.id === item.id) === index,
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </div>
          <label>
            {ar ? 'التاريخ' : 'Date'}
            <input
              type="date"
              value={date}
              onChange={(event) => setQuery({ date: event.target.value })}
            />
          </label>
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
                return (
                  <section key={student.studentId} className="rounded-lg border p-3 space-y-2">
                    <strong dir="auto">{student.name}</strong>
                    <p>
                      {ar ? 'المستوى' : 'Level'}: <bdi>{student.level || '—'}</bdi>
                    </p>
                    <p role="status">
                      {conflict
                        ? changeStatus(records.find((record) => record.outcome)?.outcome?.kind)
                        : records.length
                          ? ar
                            ? 'محفوظ على الجهاز'
                            : 'Saved on device'
                          : status
                            ? ar
                              ? 'تمت المزامنة'
                              : 'Synced'
                            : t('Not marked')}
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
                          disabled={saving || conflict || student.revision.kind !== 'confirmed'}
                          onClick={() => void save(student, choice)}
                        >
                          {t(choice)}
                        </button>
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </>
      )}
      {snapshot && !reviewChanges && !showAttendance && (
        <section className="space-y-3">
          {!selectedStudent ? (
            <ul aria-label={t('Students')} className="space-y-2">
              {snapshot.students.map((student) => (
                <li key={student.id}>
                  <button
                    className="secondary w-full text-start"
                    dir="auto"
                    onClick={() => setStudentId(student.id)}
                  >
                    {student.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <button
                className="secondary"
                onClick={() => {
                  setStudentId('')
                  setPhoneDraft(undefined)
                  setNote('')
                  setTags('')
                }}
              >
                {ar ? 'العودة إلى الطلاب' : 'Back to students'}
              </button>
              <h2 dir="auto">{selectedStudent.name}</h2>
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (saveLock.current) return
                  saveLock.current = true
                  setSaving(true)
                  void (async () => {
                    try {
                      await queueStudentOperation(
                        userId,
                        offlineStudentOperationSchema.parse({
                          kind: 'note',
                          event: makeEvent(actor, {
                            kind: 'note',
                            studentId,
                            date,
                            text: note,
                            tags: normalizedNoteTags(tags),
                          }),
                        }),
                      )
                      setNote('')
                      setTags('')
                      await refresh()
                      setError('')
                      if (navigator.onLine) void sync()
                    } catch {
                      setError(ar ? 'تعذر حفظ الملاحظة' : 'Could not save note on this device.')
                    } finally {
                      saveLock.current = false
                      setSaving(false)
                    }
                  })()
                }}
              >
                <label>
                  {ar ? 'ملاحظة' : 'Note'}
                  <textarea
                    required
                    maxLength={10000}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
                <label>
                  {ar ? 'الوسوم' : 'Tags, separated by commas'}
                  <input value={tags} onChange={(event) => setTags(event.target.value)} />
                </label>
                <button className="primary" disabled={saving}>
                  {ar ? 'حفظ الملاحظة' : 'Save note'}
                </button>
              </form>
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (saveLock.current || phone.trim() === savedPhone || pendingContact?.outcome)
                    return
                  saveLock.current = true
                  setSaving(true)
                  void (async () => {
                    try {
                      const expectedWhatsapp =
                        pendingContact?.operation.kind === 'contact'
                          ? pendingContact.operation.whatsapp
                          : selectedStudent.phone
                      await queueStudentOperation(userId, {
                        kind: 'contact',
                        id: crypto.randomUUID(),
                        studentId,
                        clientTime: new Date().toISOString(),
                        expectedWhatsapp,
                        whatsapp: phone.trim() || null,
                      })
                      await refresh()
                      setPhoneDraft(undefined)
                      setError('')
                      if (navigator.onLine) void sync()
                    } catch {
                      setError(
                        ar
                          ? 'تعذر حفظ الهاتف'
                          : 'Could not save phone update. Resolve any blocked update first.',
                      )
                    } finally {
                      saveLock.current = false
                      setSaving(false)
                    }
                  })()
                }}
              >
                <label>
                  {ar ? 'الهاتف' : 'Phone'}
                  <input
                    type="tel"
                    maxLength={40}
                    value={phone}
                    onChange={(event) => setPhoneDraft(event.target.value)}
                  />
                </label>
                <button
                  className="secondary"
                  disabled={
                    saving || phone.trim() === savedPhone || Boolean(pendingContact?.outcome)
                  }
                >
                  {ar ? 'حفظ الهاتف' : 'Save phone'}
                </button>
                {pendingContact && (
                  <p role="status">{ar ? 'محفوظ على الجهاز' : 'Saved on device'}</p>
                )}
              </form>
              {(notes.length > 0 || localNotes.length > 0) && (
                <ul aria-label={ar ? 'ملاحظات الطالب' : 'Student notes'}>
                  {[...notes, ...localNotes].map((item, index) => (
                    <li key={item.id}>
                      <time dateTime={item.date}>{item.date}</time>
                      {' · '}
                      <span dir="auto" className="whitespace-pre-wrap break-words">
                        {item.text}
                      </span>
                      {index >= notes.length && (
                        <span> ({ar ? 'محفوظ على الجهاز' : 'Saved on device'})</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}
      {reviewChanges && loaded && pendingCount === 0 && (
        <p>{ar ? 'لا توجد تغييرات بانتظار المزامنة.' : 'No changes waiting to sync.'}</p>
      )}
      {((reviewChanges ? pending.length > 0 : pending.some((item) => item.outcome)) ||
        studentPending.length > 0) && (
        <section className="space-y-2" aria-label={ar ? 'التغييرات المنتظرة' : 'Pending changes'}>
          <h2>{ar ? 'التغييرات المنتظرة' : 'Pending changes'}</h2>
          {pending
            .filter((item) => reviewChanges || item.outcome)
            .map((item) => (
              <div key={item.event.id}>
                <p>
                  {item.event.payload.date} -{' '}
                  {snapshot?.students.find((student) => student.id === item.event.payload.studentId)
                    ?.name ?? (ar ? 'طالب غير متاح' : 'Student unavailable')}{' '}
                  · {changeStatus(item.outcome?.kind)}
                  {reviewChanges && item.outcome?.kind !== 'conflict' && (
                    <> · {t(item.event.payload.status)}</>
                  )}
                </p>
                {item.outcome?.kind === 'conflict' && (
                  <div className="flex flex-wrap gap-2">
                    <p>
                      {ar
                        ? '\u0627\u0644\u0639\u0644\u0627\u0645\u0629 \u0627\u0644\u0645\u062d\u0641\u0648\u0638\u0629'
                        : 'Saved mark'}
                      :{' '}
                      {item.outcome.current?.status
                        ? t(item.outcome.current.status)
                        : t('Not marked')}{' '}
                      - {ar ? '\u0639\u0644\u0627\u0645\u062a\u064a' : 'My mark'}:{' '}
                      {t(
                        pending.findLast(
                          (candidate) => attendanceKey(candidate) === attendanceKey(item),
                        )?.event.payload.status ?? item.event.payload.status,
                      )}
                    </p>
                    <button
                      className="secondary"
                      onClick={() =>
                        void resolveAttendanceConflict(userId, item.event.id, 'server')
                          .then(refresh)
                          .catch(() => setError('Could not resolve conflict.'))
                      }
                    >
                      {ar
                        ? '\u0627\u0644\u0627\u062d\u062a\u0641\u0627\u0638 \u0628\u0639\u0644\u0627\u0645\u0629 \u0627\u0644\u062e\u0627\u062f\u0645'
                        : 'Keep saved mark'}
                    </button>
                    <button
                      className="secondary"
                      onClick={() =>
                        void resolveAttendanceConflict(userId, item.event.id, 'local')
                          .then(async () => {
                            await refresh()
                            await sync()
                          })
                          .catch(() => setError('Could not resolve conflict.'))
                      }
                    >
                      {ar
                        ? '\u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0639\u0644\u0627\u0645\u062a\u064a'
                        : 'Use my mark'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          {studentPending.map((item) => {
            const operation = item.operation
            const id = studentOperationId(operation)
            const student =
              operation.kind === 'note' ? operation.event.payload.studentId : operation.studentId
            const latestContact = studentPending.findLast(
              ({ operation }) => operation.kind === 'contact' && operation.studentId === student,
            )?.operation
            return (
              <div key={id}>
                <p>
                  {snapshot?.students.find((entry) => entry.id === student)?.name ??
                    (ar ? 'طالب غير متاح' : 'Student unavailable')}{' '}
                  · {operation.kind === 'note' ? (ar ? 'ملاحظة' : 'Note') : ar ? 'هاتف' : 'Phone'} ·{' '}
                  {changeStatus(item.outcome?.kind)}
                </p>
                {item.outcome?.kind === 'conflict' && operation.kind === 'contact' && (
                  <div className="flex flex-wrap gap-2">
                    <p>
                      {ar ? 'الهاتف المحفوظ' : 'Saved phone'}: {item.outcome.currentWhatsapp ?? '-'}{' '}
                      · {ar ? 'هاتفي' : 'Your phone'}:{' '}
                      {(latestContact?.kind === 'contact'
                        ? latestContact.whatsapp
                        : operation.whatsapp) ?? '-'}
                    </p>
                    <button
                      className="secondary"
                      onClick={() =>
                        void resolveStudentConflict(userId, id, 'server')
                          .then(refresh)
                          .catch(() => setError('Could not resolve conflict.'))
                      }
                    >
                      {ar ? 'استخدام المحفوظ' : 'Keep saved phone'}
                    </button>
                    <button
                      className="secondary"
                      onClick={() =>
                        void resolveStudentConflict(userId, id, 'local')
                          .then(async () => {
                            await refresh()
                            await sync()
                          })
                          .catch(() => setError('Could not resolve conflict.'))
                      }
                    >
                      {ar ? 'استخدام هاتفي' : 'Use my phone'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className="secondary"
          disabled={saving || syncing || !navigator.onLine || (reviewChanges && pendingCount === 0)}
          onClick={() => void sync(true)}
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
