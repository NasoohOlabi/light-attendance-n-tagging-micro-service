import { DirectionProvider } from '@base-ui/react/direction-provider'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { RowActions } from './RowActions'
import { LevelInput } from './level'
import { formatLevel } from './levelFormat'
import { PhoneNumber } from './PhoneNumber'
import { TableHeader, TableToolbar } from './DataTable'
import { useDataTable } from './useDataTable'
import { matchesText } from './studentSearch'
import {
  Check,
  ChevronRight,
  CircleCheck,
  CircleMinus,
  Pencil,
  RefreshCw,
  StickyNote,
  UserRound,
  X,
} from 'lucide-react'
import { useLanguage, type TranslationKey } from './useLanguage'
import { useEffect, useRef, useState } from 'react'
import {
  projectEvents,
  normalizeStatus,
  normalizedNoteTags,
  statuses,
  statusSchema,
  type LedgerEvent,
  type Payload,
  type Student,
} from '../shared/ledger'
import { navigateNotebook, setQuery, useCoursePreference, useQueryState } from './queryState'
import { AttendanceChartExport } from './AttendanceChartExport'
import { SummaryInsights } from './SummaryInsights'
import { CourseReadiness } from './CourseReadiness'
import { NotebookDashboard } from './NotebookDashboard'
import { WorkspaceNavigation } from './WorkspaceNavigation'
import { useLedger } from './useLedger'
import { NeonAuth } from './NeonAuth'
import { WorkspaceLoading } from './WorkspaceLoading'
import { AdminConsole } from './AdminConsole'
import { StudentAttendance } from './StudentAttendance'
import { CourseSections, Courses } from './Courses'
import type { Profile } from './ProfileMenu'
import { ProfileSettings } from './ProfileSettings'
import { enrollmentSchema, type NeonTeacher } from '../shared/neon'
import { allowOfflineAccess, clearOfflineAccess, offlineAccess } from './offlineAccess'
import {
  cacheOfflineRoster,
  listPendingAttendance,
  listPendingStudent,
  subscribeOfflineQueue,
} from './offlineAttendanceStore'
import { OfflineAttendance } from './OfflineAttendance'
import { syncOfflineAttendance, syncOfflineStudent } from './offlineAttendanceSync'

type Projection = ReturnType<typeof projectEvents>
type Save = (payloads: Payload[]) => Promise<boolean>

type Demo = 'editable' | 'assigned'

export default function Workspace({
  demo,
  openDemo,
  goHome,
}: {
  demo: Demo | null
  openDemo: (demo: Demo) => void
  goHome: () => void
}) {
  const { t } = useLanguage()
  const query = useQueryState()
  if (!demo)
    return (
      <NeonAuth
        onSignOut={goHome}
        samples={
          <>
            <button className="secondary self-start" onClick={() => openDemo('editable')}>
              {t('Explore with sample students')}
            </button>
            <button className="secondary self-start" onClick={() => openDemo('assigned')}>
              {t('Explore assigned teacher sample')}
            </button>
          </>
        }
      >
        {(userId, account, signOut, profile) =>
          query.view === 'profile' ? (
            <ProfileSettings key={userId} profile={profile} signOut={signOut} role={account.role} />
          ) : account.role === 'student' ? (
            <StudentAttendance key={userId} userId={userId} signOut={signOut} profile={profile} />
          ) : account.role === 'administrator' &&
            (query.view === 'settings' ||
              query.view === 'administration' ||
              query.view === 'add-student') ? (
            <AdminConsole
              key={`${userId}:${query.view === 'add-student'}`}
              userId={userId}
              signOut={signOut}
              profile={profile}
              initialCreateStudent={query.view === 'add-student'}
              courseId={
                query.view === 'add-student' && query.courseView === 'students' ? query.course : ''
              }
            />
          ) : (
            <Notebook
              key={userId}
              demo={null}
              neon={{ userId, teacher: account }}
              leave={signOut}
              profile={profile}
            />
          )
        }
      </NeonAuth>
    )
  return <Notebook demo={demo} leave={goHome} />
}

function Notebook({
  demo,
  leave,
  neon,
  profile,
}: {
  neon?: { userId: string; teacher: NeonTeacher }
  demo: 'editable' | 'assigned' | null
  leave: () => void
  profile?: Profile
}) {
  const { t, language, errorMessage } = useLanguage()
  const [offlineView, setOfflineView] = useState(false)
  const [offlineRoster, setOfflineRoster] = useState<ReturnType<typeof useLedger>['roster']>()
  const [hasPendingChanges, setHasPendingChanges] = useState(false)
  const query = useQueryState()
  const changesOrigin = useRef<typeof query.view>('notebook')
  const administrator = neon?.teacher.role === 'administrator'
  const canViewHistory = administrator || demo === 'editable'
  const history = query.view === 'history' && canViewHistory
  const tab = history ? 'history' : query.tab
  useEffect(() => {
    if (query.view === 'history') {
      if (!canViewHistory) setQuery({ view: 'notebook', tab: '' })
      else if (new URLSearchParams(window.location.search).get('tab') === 'history')
        setQuery({ view: 'history', tab: '' })
    }
  }, [canViewHistory, query.view])
  const [sessionDrafts, setSessionDrafts] = useState<Record<string, Record<string, string>>>({})
  const sessionKey = `${query.courseScope}:${query.date}`
  const listOrigin = useRef<{ trigger: HTMLElement; top: number; search: string } | null>(null)
  const previousView = useRef(query.view)
  useEffect(() => {
    const origin = listOrigin.current
    if (origin && previousView.current === 'student' && query.view === 'notebook') {
      requestAnimationFrame(() => {
        if (origin.trigger.isConnected && window.location.search === origin.search) {
          origin.trigger.focus({ preventScroll: true })
          window.scrollTo(0, origin.top)
        }
      })
    }
    previousView.current = query.view
  }, [query.view])
  const openStudent = (studentId: string, trigger: HTMLElement) => {
    listOrigin.current = { trigger, top: window.scrollY, search: window.location.search }
    setQuery({ view: 'student', student: studentId }, true)
    window.scrollTo(0, 0)
  }
  const returnToList = () => {
    if (listOrigin.current) {
      const search = listOrigin.current.search
      window.history.replaceState(null, '', window.location.pathname + search)
      window.dispatchEvent(new PopStateEvent('popstate'))
    } else {
      setQuery({ view: 'notebook', tab: 'roster', student: '' }, true)
    }
  }
  const ledger = useLedger(demo !== null, demo === 'assigned', neon)
  const userId = neon?.userId
  const access = ledger.snapshotTeacher ?? neon?.teacher
  const canCacheOffline = Boolean(access?.canRead && access.canWrite)
  const reviewChanges = query.view === 'changes' && canCacheOffline
  const actor = access?.name
  const expires = access?.expiresAt
  const { loaded, roster, courses, enrollments, events, refresh } = ledger
  useEffect(() => {
    if (!userId || !actor || !loaded) return
    if (!canCacheOffline) {
      if (offlineAccess()?.userId === userId) clearOfflineAccess()
      return
    }
    if (!navigator.locks) return
    let current = true
    void cacheOfflineRoster(userId, { students: roster, courses, enrollments, events })
      .then(() => {
        if (!current) return
        allowOfflineAccess(userId, actor, expires ? Date.parse(expires) : null)
        setOfflineRoster(roster)
      })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [userId, actor, expires, canCacheOffline, loaded, roster, courses, enrollments, events])
  useEffect(() => {
    if (!userId || !canCacheOffline || !navigator.locks) return
    let revision = 0
    const readQueue = () => {
      const current = ++revision
      void Promise.all([listPendingAttendance(userId), listPendingStudent(userId)]).then(
        ([attendance, students]) => {
          if (current === revision)
            setHasPendingChanges(attendance.length > 0 || students.length > 0)
        },
        () => {
          if (current === revision) setHasPendingChanges(false)
        },
      )
    }
    const unsubscribe = subscribeOfflineQueue(readQueue)
    readQueue()
    return () => {
      revision++
      unsubscribe()
    }
  }, [userId, canCacheOffline])
  useEffect(() => {
    if (query.view === 'changes' && !canCacheOffline) setQuery({ view: 'notebook' })
  }, [query.view, canCacheOffline])
  useEffect(() => {
    if (!userId || !canCacheOffline || !navigator.locks) return
    let active = true
    let syncing = false
    const reconnect = (retryBlocked = false) => {
      if (!navigator.onLine || syncing || offlineView || reviewChanges) return
      syncing = true
      void Promise.allSettled([
        syncOfflineAttendance(userId, retryBlocked),
        syncOfflineStudent(userId, retryBlocked),
      ])
        .then((results) => {
          const needsRefresh = results.some(
            (result) =>
              result.status === 'fulfilled' &&
              result.value.some((item) => item.kind === 'saved' || item.kind === 'unchanged'),
          )
          if (active && needsRefresh) void refresh()
        })
        .finally(() => {
          syncing = false
        })
    }
    const disconnect = () => {
      if (offlineAccess()?.userId === userId) setOfflineView(true)
    }
    const online = () => reconnect(true)
    const focus = () => reconnect()
    window.addEventListener('online', online)
    window.addEventListener('offline', disconnect)
    window.addEventListener('focus', focus)
    reconnect(true)
    return () => {
      active = false
      window.removeEventListener('online', online)
      window.removeEventListener('offline', disconnect)
      window.removeEventListener('focus', focus)
    }
  }, [userId, canCacheOffline, offlineView, reviewChanges, refresh])
  const preference = useCoursePreference(neon?.userId, ledger.loaded, ledger.courses)
  const assigned = !!neon || demo === 'assigned'
  const fullRegister =
    administrator &&
    (query.view === 'notebook' || query.view === 'student') &&
    tab === 'roster' &&
    !query.course
  const includeInactive = fullRegister || (history && administrator)
  const baseProjection = projectEvents(ledger.events)
  const selectedCourse = ledger.courses.find((course) => course.id === query.course)
  const closedCourse = selectedCourse?.open === false ? selectedCourse : undefined
  const selectedEnrollments =
    demo === 'assigned'
      ? ledger.roster.map((student) =>
          enrollmentSchema.parse({
            id: student.studentId,
            courseId: student.studentId,
            studentId: student.studentId,
            level: student.group,
            practical: null,
            theory: null,
          }),
        )
      : ledger.enrollments.filter((entry) => entry.courseId === query.course)
  const activeEnrollments = selectedEnrollments.filter((entry) => entry.active)
  const selectedIds = new Set(selectedEnrollments.map((entry) => entry.id))
  const scopedEvents = baseProjection.events.filter((event) => {
    const payload = event.payload
    const target =
      payload.kind === 'reversal'
        ? baseProjection.events.find((item) => item.id === payload.targetId)
        : event
    return (
      !target ||
      target.payload.kind !== 'attendance' ||
      demo === 'assigned' ||
      (query.course
        ? !!target.payload.enrollmentId && selectedIds.has(target.payload.enrollmentId)
        : !target.payload.enrollmentId)
    )
  })
  const scopedProjection = projectEvents(scopedEvents)
  const courseStudents = ledger.roster.filter((student) =>
    query.course
      ? tab === 'dashboard' || tab === 'attendance' || tab === 'roster'
        ? student.active && activeEnrollments.some((entry) => entry.studentId === student.studentId)
        : selectedEnrollments.some((entry) => entry.studentId === student.studentId)
      : includeInactive || student.active,
  )
  const projected = assigned ? { ...scopedProjection, students: courseStudents } : baseProjection
  const groups = [
    ...new Set(projected.students.map((student) => student.group).filter(Boolean)),
  ].sort()
  const students = projected.students.filter(
    (student) =>
      (includeInactive || query.all || student.active) &&
      (tab === 'attendance' ||
        !assigned ||
        !query.student ||
        student.studentId === query.student) &&
      (tab === 'attendance' || !query.group || student.group === query.group) &&
      (tab === 'attendance' || matchesText(student.name, query.q)),
  )
  const visibleIds = new Set(students.map((student) => student.studentId))
  const markedToday = projected.attendance.filter(
    ({ value }) => value.date === query.date && visibleIds.has(value.studentId),
  ).length
  const visibleNotes = projected.notes.filter(
    ({ value }) => !value.studentId || visibleIds.has(value.studentId),
  )
  const latestNote = visibleNotes[visibleNotes.length - 1]
  const disabled =
    ledger.busy ||
    !!ledger.pending.length ||
    !!ledger.storageBlocked ||
    !ledger.loaded ||
    !!(neon && !neon.teacher.canWrite)
  const openOfflineLabel = language === 'ar' ? 'فتح الدفتر دون اتصال' : 'Open offline notebook'
  if (offlineView && neon && canCacheOffline)
    return (
      <OfflineAttendance
        userId={neon.userId}
        actor={neon.teacher.name}
        close={() => {
          setOfflineView(false)
          if (navigator.onLine) void ledger.refresh()
        }}
      />
    )
  if (!ledger.loaded || !preference.ready)
    return ledger.error ? (
      <main id="main-content" tabIndex={-1} className="workspace-auth panel space-y-3">
        <p role="alert">{errorMessage(ledger.error)}</p>
        <button className="secondary" disabled={ledger.busy} onClick={() => void ledger.refresh()}>
          {t('Try again')}
        </button>
        {canCacheOffline && offlineAccess()?.userId === userId && (
          <button className="secondary" onClick={() => setOfflineView(true)}>
            {openOfflineLabel}
          </button>
        )}
      </main>
    ) : (
      <WorkspaceLoading message={t('Loading records…')} />
    )
  const showCourseSwitcher =
    neon && (query.view === 'notebook' || query.view === 'student' || history)
  const navigation = (
    <WorkspaceNavigation
      defaultCourse={preference.defaultCourse}
      courses={
        showCourseSwitcher
          ? ledger.courses.map((course) => ({
              id: course.id,
              name: course.name,
              closed: !course.open,
            }))
          : undefined
      }
      currentCourse={query.courseScope}
      chooseDefault={showCourseSwitcher ? preference.chooseDefault : undefined}
      courseName={ledger.courses.find((course) => course.id === query.course)?.name}
      administrator={administrator}
      assigned={assigned}
      profile={
        profile && canCacheOffline && offlineRoster === roster && hasPendingChanges
          ? {
              ...profile,
              openChanges: () => {
                if (reviewChanges) return
                changesOrigin.current = query.view
                setQuery({ view: 'changes' }, true)
                window.scrollTo(0, 0)
              },
            }
          : profile
      }
      leave={leave}
      sample={!neon}
      sampleHistory={demo === 'editable'}
      disabled={ledger.busy}
    />
  )
  if (reviewChanges && neon)
    return (
      <div className="workspace">
        {navigation}
        <main id="main-content" tabIndex={-1} className="workspace-main">
          <OfflineAttendance
            userId={neon.userId}
            actor={neon.teacher.name}
            reviewChanges
            onSynced={() => void refresh()}
            close={() => setQuery({ view: changesOrigin.current })}
          />
        </main>
      </div>
    )
  return (
    <div className="workspace">
      {navigation}
      <main id="main-content" tabIndex={-1} className="workspace-main">
        {history && administrator && (
          <button
            className="secondary mb-4"
            onClick={() => setQuery({ view: 'settings', student: '' }, true)}
          >
            {t('Back to settings')}
          </button>
        )}
        {!history && query.view !== 'courses' && query.view !== 'student' && (
          <header className="workspace-welcome">
            <div>
              <h1>{t('Attendance & notes')}</h1>
            </div>
            <div className="workspace-count">
              <strong>{projected.students.length}</strong>
              <span>{t('Students')}</span>
            </div>
          </header>
        )}
        {demo && (
          <p className="mb-5 rounded-lg bg-amber-100 p-3 text-amber-900">
            {demo === 'assigned' ? t('Assigned teacher sample.') : t('Sample data.')}{' '}
            {t('Changes stay in memory and disappear when you leave. No server requests are made.')}
          </p>
        )}
        {neon && query.view !== 'courses' && query.course && closedCourse && (
          <p role="status">
            <strong dir="auto">{closedCourse.name}</strong>{' '}
            {language === 'ar'
              ? 'الدورة مغلقة. لا يمكن تسجيل حضور جديد.'
              : 'This course is closed. New attendance is disabled.'}
          </p>
        )}
        <div
          className="mb-6 flex flex-wrap items-end gap-3"
          hidden={
            tab === 'dashboard' ||
            tab === 'attendance' ||
            tab === 'summary' ||
            query.view === 'courses' ||
            query.view === 'student'
          }
        >
          <label className="grow">
            {t('Find a student')}
            <input
              type="search"
              value={query.q}
              onChange={(event) => setQuery({ q: event.target.value })}
              dir="auto"
              enterKeyHint="search"
              placeholder={t('Name / اسم الطالب')}
            />
          </label>
          <label>
            {t('Group')}
            <select
              value={query.group}
              onChange={(event) => setQuery({ group: event.target.value })}
            >
              <option value="">{t('All groups')}</option>
              {groups.map((group) => (
                <option key={group} value={group}>
                  {formatLevel(group)}
                </option>
              ))}
            </select>
          </label>
          {!assigned && (
            <label className="mb-3 min-h-11 flex-row items-center">
              <input
                type="checkbox"
                checked={query.all}
                onChange={(event) => setQuery({ all: event.target.checked ? '1' : '' })}
              />
              {t('Include inactive')}
            </label>
          )}
          {assigned && query.student && (
            <button className="secondary" onClick={() => setQuery({ student: '' }, true)}>
              {t('All my students')}
            </button>
          )}
          {!demo && (
            <button
              className="icon-button"
              aria-label={t('Refresh')}
              title={t('Refresh')}
              disabled={ledger.busy}
              onClick={() => void ledger.refresh()}
            >
              <RefreshCw size={20} strokeWidth={1.6} aria-hidden="true" focusable="false" />
            </button>
          )}
        </div>
        {ledger.storageBlocked && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-red-800">
            {errorMessage(ledger.storageBlocked)}
          </p>
        )}
        {ledger.error && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-red-800">
            {errorMessage(ledger.error)}
          </p>
        )}
        {ledger.message && (
          <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-4 text-emerald-800">
            {language === 'ar'
              ? `${ledger.pending.length || (ledger.message.match(/^\d+/)?.[0] ?? '')} سجل محفوظ${demo ? ' في النموذج التجريبي' : ''}.`
              : ledger.message}
          </p>
        )}
        {projected.conflicts > 0 && (
          <p role="alert" className="mb-4 text-red-800">
            {language === 'ar'
              ? `تم اكتشاف ${projected.conflicts} معرّفات مكررة متعارضة. اطلب من المسؤول فحص الجدول.`
              : `${projected.conflicts} conflicting duplicate IDs detected. Ask the manager to inspect the records.`}
          </p>
        )}
        {(ledger.invalid > 0 || projected.invalidReversals > 0) && (
          <p role="status" className="mb-4 text-amber-800">
            {language === 'ar'
              ? `تم تجاوز ${ledger.invalid} صفوف غير صالحة و${projected.invalidReversals} تصحيحات غير صالحة. اطلب من المسؤول فحص الجدول.`
              : `${ledger.invalid} invalid rows and ${projected.invalidReversals} invalid corrections were skipped. Ask the manager to inspect the records.`}
          </p>
        )}
        {ledger.pending.length > 0 && (
          <div className="panel mb-4 space-y-3">
            <h2 className="font-semibold">
              {language === 'ar'
                ? `${ledger.pending.length} سجلات بانتظار التأكيد`
                : `${ledger.pending.length} records awaiting confirmation`}
            </h2>
            <p className="muted">
              {t('Retry reuses the original IDs, so each record is counted once.')}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                disabled={
                  ledger.busy || !!ledger.storageBlocked || !!(neon && !neon.teacher.canWrite)
                }
                className="primary"
                onClick={() => void ledger.retry()}
              >
                {t('Retry pending batch')}
              </button>
              <button
                disabled={ledger.busy}
                className="secondary"
                onClick={() => void ledger.discard()}
              >
                {t('Discard pending retry')}
              </button>
            </div>
          </div>
        )}
        {query.view === 'courses' && neon?.teacher.role === 'administrator' && (
          <Courses
            userId={neon.userId}
            courses={ledger.courses}
            exportEnrollments={ledger.enrollments}
            enrollments={ledger.enrollments.filter((entry) =>
              ledger.roster.some(
                (student) => student.active && student.studentId === entry.studentId,
              ),
            )}
            events={ledger.events}
            refresh={ledger.refresh}
            defaultCourse={preference.defaultCourse}
            chooseDefault={preference.chooseDefault}
          />
        )}
        {query.view === 'student' && (
          <StudentDetails
            student={(assigned ? ledger.roster : baseProjection.students).find(
              (student) => student.studentId === query.student,
            )}
            projected={query.course ? scopedProjection : baseProjection}
            courses={ledger.courses}
            enrollments={ledger.enrollments}
            courseId={query.course}
            refresh={neon ? ledger.refresh : undefined}
            busy={ledger.busy}
            canWrite={!disabled}
            administrator={administrator}
            onBack={returnToList}
          />
        )}
        <div
          hidden={query.view === 'courses' || query.view === 'student'}
          className={tab === 'attendance' ? 'workspace-content' : ''}
        >
          <fieldset
            disabled={disabled && (tab === 'roster' || tab === 'history')}
            className="min-w-0"
          >
            {tab === 'dashboard' && query.view === 'notebook' && (
              <NotebookDashboard
                projected={projected}
                date={query.date}
                canAdd={administrator || demo === 'editable'}
                canRecord={!disabled && (!!demo || selectedCourse?.open === true)}
                onStudent={openStudent}
                onAttendance={(unmarked = false) =>
                  navigateNotebook('attendance', query.courseScope || '', {
                    student: '',
                    q: '',
                    group: '',
                    unmarked: unmarked ? '1' : '',
                  })
                }
                onAdd={() =>
                  neon
                    ? setQuery({ view: 'add-student', courseView: '', student: '' }, true)
                    : setQuery({ tab: 'roster', q: '', group: '' }, true)
                }
              >
                {administrator && selectedCourse && (
                  <CourseReadiness
                    course={selectedCourse}
                    enrollments={selectedEnrollments}
                    students={ledger.roster}
                    attendance={scopedProjection.attendance}
                    onGrades={() => setQuery({ view: 'courses', courseView: 'grades' }, true)}
                  />
                )}
              </NotebookDashboard>
            )}
            {(tab === 'attendance' || tab === 'summary') && (
              <nav
                className="attendance-siblings"
                aria-label={
                  language === 'ar'
                    ? '\u0635\u0641\u062d\u0627\u062a \u0627\u0644\u062d\u0636\u0648\u0631'
                    : 'Attendance pages'
                }
              >
                <button
                  type="button"
                  aria-current={tab === 'attendance' ? 'page' : undefined}
                  onClick={() => setQuery({ tab: 'attendance' }, true)}
                >
                  {language === 'ar' ? '\u0627\u0644\u062c\u0644\u0633\u0629' : 'Session'}
                </button>
                <button
                  type="button"
                  aria-label={t('Summary')}
                  aria-current={tab === 'summary' ? 'page' : undefined}
                  onClick={() => setQuery({ tab: 'summary' }, true)}
                >
                  {language === 'ar'
                    ? '\u0645\u0644\u062e\u0635 \u0627\u0644\u062f\u0648\u0631\u0629'
                    : 'Course summary'}
                </button>
              </nav>
            )}
            {tab === 'attendance' && neon && (!query.course || closedCourse) && (
              <section className="panel">
                <p>
                  {language === 'ar'
                    ? '\u0627\u062e\u062a\u0631 \u062f\u0648\u0631\u0629 \u0645\u0641\u062a\u0648\u062d\u0629 \u0644\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062d\u0636\u0648\u0631.'
                    : 'Choose an open course to take attendance.'}
                </p>
                <button
                  className="primary mt-4"
                  onClick={() =>
                    neon.teacher.role === 'administrator'
                      ? setQuery({ view: 'courses', courseView: '', q: '' }, true)
                      : navigateNotebook('dashboard', preference.defaultCourse)
                  }
                >
                  {neon.teacher.role === 'administrator'
                    ? language === 'ar'
                      ? '\u0627\u0644\u062f\u0648\u0631\u0627\u062a'
                      : 'Go to courses'
                    : language === 'ar'
                      ? '\u0644\u0648\u062d\u0629 \u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629'
                      : 'Dashboard'}
                </button>
              </section>
            )}
            {tab === 'attendance' && (!neon || (query.course && !closedCourse)) && (
              <AttendanceView
                key={`${query.date}:${query.course}`}
                draft={sessionDrafts[sessionKey] ?? {}}
                setDraft={(draft) =>
                  setSessionDrafts((previous) => ({ ...previous, [sessionKey]: draft }))
                }
                enrollments={activeEnrollments}
                courseSelected={!!query.course}
                courseName={
                  demo
                    ? language === 'ar'
                      ? '\u062f\u0648\u0631\u0629 \u062a\u062c\u0631\u064a\u0628\u064a\u0629'
                      : 'Sample course'
                    : ledger.courses.find((course) => course.id === query.course)?.name
                }
                students={students.filter(
                  (student) =>
                    student.active &&
                    (!query.course ||
                      ledger.courses.some((course) => course.id === query.course && course.open)) &&
                    (query.course ||
                      !ledger.enrollments.some((entry) => entry.studentId === student.studentId)),
                )}
                allStudents={projected.students.filter(
                  (student) =>
                    student.active &&
                    (!query.course ||
                      ledger.courses.some((course) => course.id === query.course && course.open)) &&
                    (query.course ||
                      !ledger.enrollments.some((entry) => entry.studentId === student.studentId)),
                )}
                projected={projected}
                disabled={disabled}
                saveError={
                  ledger.error || ledger.storageBlocked
                    ? errorMessage(ledger.error || ledger.storageBlocked)
                    : ''
                }
                date={query.date}
                save={ledger.save}
                canCorrect={canViewHistory}
                onOpenStudent={openStudent}
              />
            )}
            {tab === 'roster' && (
              <RosterView
                students={students}
                save={ledger.save}
                assigned={assigned}
                courseSelected={!!query.course}
                enrollments={selectedEnrollments}
                courses={ledger.courses}
                allEnrollments={ledger.enrollments}
                attendance={(query.course ? scopedProjection : baseProjection).attendance}
                onOpenStudent={openStudent}
              />
            )}
            {tab === 'summary' && (
              <Summary
                key={query.course}
                students={projected.students}
                projected={projected}
                scope={
                  demo
                    ? language === 'ar'
                      ? 'دورة تجريبية'
                      : 'Sample course'
                    : ledger.courses.find((course) => course.id === query.course)?.name ||
                      (language === 'ar'
                        ? '\u0627\u0644\u0633\u062c\u0644 \u0627\u0644\u0633\u0627\u0628\u0642 / \u0628\u0644\u0627 \u062f\u0648\u0631\u0629'
                        : 'Previous / no course')
                }
              />
            )}
            {tab === 'history' && administrator && query.course && (
              <CourseSections courseId={query.course} ar={language === 'ar'} current="history" />
            )}
            {tab === 'history' && (
              <History
                key={query.course}
                projected={projected}
                students={students}
                save={ledger.save}
                assigned={assigned}
              />
            )}
          </fieldset>
          {tab === 'attendance' && (!neon || (query.course && !closedCourse)) && (
            <aside className="workspace-context" aria-label={t('Summary')}>
              <section className="panel">
                <h2>{t('Summary')}</h2>
                <div className="workspace-metrics">
                  <div>
                    <strong>{students.filter((student) => student.active).length}</strong>
                    <span>{t('Students')}</span>
                  </div>
                  <div>
                    <strong>{markedToday}</strong>
                    <span>{language === 'ar' ? 'تم تسجيل الحضور' : 'Marked on this date'}</span>
                  </div>
                  <div>
                    <strong>{visibleNotes.length}</strong>
                    <span>{t('Notes')}</span>
                  </div>
                </div>
              </section>
              {latestNote && (
                <section className="panel workspace-recent">
                  <h2>{language === 'ar' ? 'آخر ملاحظة' : 'Latest note'}</h2>
                  <small>{latestNote.value.date}</small>
                  <p dir="auto">{latestNote.value.text}</p>
                </section>
              )}
            </aside>
          )}
        </div>
      </main>
    </div>
  )
}

function StudentDetails({
  student,
  projected,
  courses,
  enrollments,
  courseId,
  refresh,
  busy,
  canWrite,
  administrator,
  onBack,
}: {
  onBack: () => void
  student: import('../shared/neon').NeonRosterStudent | undefined
  projected: Projection
  courses: import('../shared/neon').Course[]
  enrollments: import('../shared/neon').Enrollment[]
  courseId: string
  refresh?: () => Promise<void>
  busy: boolean
  canWrite: boolean
  administrator: boolean
}) {
  const { t, language } = useLanguage()
  const ar = language === 'ar'
  const detailRecords = projected.attendance.filter(
    ({ value }) => value.studentId === student?.studentId,
  )
  const detailTable = useDataTable('student-history', detailRecords, [
    {
      id: 'date',
      filterMode: 'literal',
      label: ar ? 'التاريخ' : 'Date',
      value: (row) => row.value.date,
    },
    {
      id: 'course',
      label: ar ? 'الدورة' : 'Course',
      value: (row) =>
        courses.find((course) =>
          enrollments.some(
            (entry) => entry.id === row.value.enrollmentId && entry.courseId === course.id,
          ),
        )?.name ?? (ar ? 'بلا دورة' : 'No course'),
    },
    {
      id: 'status',
      choices: [t('present'), t('absent'), t('excused')],
      label: ar ? 'الحالة' : 'Status',
      value: (row) => t(row.value.status),
    },
  ])
  if (!student)
    return (
      <section className="panel">
        <p>{ar ? 'الطالب غير متاح' : 'Student unavailable'}</p>
        <button className="secondary" onClick={onBack}>
          {t('Students')}
        </button>
      </section>
    )
  const records = projected.attendance.filter(({ value }) => value.studentId === student.studentId)
  const counts = { present: 0, absent: 0, excused: 0 }
  for (const { value } of records) counts[value.status]++
  const memberships = enrollments.filter((entry) => entry.studentId === student.studentId)
  const eligible =
    student.active &&
    (!courseId
      ? !memberships.length
      : memberships.some((entry) => entry.courseId === courseId && entry.active) &&
        courses.some((course) => course.id === courseId && course.open))
  return (
    <section className="panel student-details">
      <div className="student-details-actions">
        <button className="secondary" onClick={onBack}>
          {ar ? '\u0639\u0648\u062f\u0629' : 'Back'}
        </button>
        {refresh && (
          <button
            className="icon-button"
            aria-label={t('Refresh')}
            title={t('Refresh')}
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RefreshCw size={20} aria-hidden="true" />
          </button>
        )}
      </div>
      <h1 className="title">{ar ? 'معلومات الطالب' : 'Student information'}</h1>
      {administrator && (
        <button
          className="secondary"
          onClick={() =>
            setQuery({ view: 'settings', student: student.studentId, account: '' }, true)
          }
        >
          {ar
            ? '\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0637\u0627\u0644\u0628'
            : 'Edit student'}
        </button>
      )}
      <dl className="student-detail-fields">
        <div>
          <dt>{ar ? 'الاسم الأول' : 'First name'}</dt>
          <dd dir="auto">{student.firstName ?? student.name}</dd>
        </div>
        <div>
          <dt>{ar ? 'اسم العائلة' : 'Last name'}</dt>
          <dd dir="auto">{student.lastName || '—'}</dd>
        </div>
        <div>
          <dt>{ar ? 'رقم الهاتف' : 'Phone'}</dt>
          <dd dir="auto">
            {student.whatsapp ? (
              <PhoneNumber value={student.whatsapp} />
            ) : ar ? (
              'غير متوفر'
            ) : (
              'Not provided'
            )}
          </dd>
        </div>
        <div>
          <dt>{ar ? 'المستوى' : 'Level'}</dt>
          <dd dir="auto">{studentLevel(student, !!courseId, memberships) || '—'}</dd>
        </div>
      </dl>
      <h3>{ar ? 'معلومات الحضور' : 'Attendance information'}</h3>
      <dl className="student-detail-fields">
        <div>
          <dt>{t('present')}</dt>
          <dd>{counts.present}</dd>
        </div>
        <div>
          <dt>{t('absent')}</dt>
          <dd>{counts.absent}</dd>
        </div>
        <div>
          <dt>{t('excused')}</dt>
          <dd>{counts.excused}</dd>
        </div>
        <div>
          <dt>{ar ? 'الجلسات المسجلة' : 'Recorded sessions'}</dt>
          <dd>{records.length}</dd>
        </div>
        <div>
          <dt>{ar ? 'نسبة الحضور' : 'Attendance percentage'}</dt>
          <dd>
            {records.length ? `${((counts.present / records.length) * 100).toFixed(1)}%` : '—'}
          </dd>
        </div>
      </dl>
      {eligible && canWrite && (
        <button
          className="primary"
          onClick={() =>
            navigateNotebook('attendance', courseId, { q: '', group: '', student: '' })
          }
        >
          {ar ? 'تسجيل الحضور' : 'Take attendance'}
        </button>
      )}
      <h3>{ar ? 'الدورات' : 'Courses'}</h3>
      <p>
        {courses
          .filter((course) =>
            memberships.some((entry) => entry.courseId === course.id && entry.active),
          )
          .map((course) => course.name)
          .join(', ') || (ar ? 'لا يوجد' : 'None')}
      </p>
      <TableToolbar model={records.length ? detailTable : undefined} className="mt-6 mb-2">
        <h3 className="m-0!">{ar ? 'سجل الحضور' : 'Attendance history'}</h3>
      </TableToolbar>
      {records.length ? (
        <div
          className="role-table-scroll"
          tabIndex={0}
          role="region"
          aria-label={ar ? 'سجل الحضور' : 'Attendance history'}
        >
          <table className="mobile-record-table role-table">
            <TableHeader model={detailTable} />
            <tbody>
              {detailTable.rows.map(({ event, value }) => (
                <tr key={event.id}>
                  <td data-label={ar ? 'التاريخ' : 'Date'}>{value.date}</td>
                  <td data-label={ar ? 'الدورة' : 'Course'}>
                    {courses.find((course) =>
                      memberships.some(
                        (entry) => entry.id === value.enrollmentId && entry.courseId === course.id,
                      ),
                    )?.name || (ar ? 'بلا دورة' : 'No course')}
                  </td>
                  <td data-label={ar ? 'الحالة' : 'Status'}>{t(value.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>{ar ? 'لا توجد سجلات حضور' : 'No attendance records'}</p>
      )}
    </section>
  )
}

function studentLevel(
  student: Student,
  courseSelected: boolean,
  enrollments: import('../shared/neon').Enrollment[],
) {
  return courseSelected
    ? formatLevel(enrollments.find((entry) => entry.studentId === student.studentId)?.level ?? '')
    : formatLevel(student.group)
}

function AttendanceView({
  draft,
  setDraft,
  students,
  allStudents,
  projected,
  date,
  save,
  enrollments,
  courseSelected,
  courseName,
  disabled,
  saveError,
  canCorrect,
  onOpenStudent,
}: {
  draft: Record<string, string>
  setDraft: (draft: Record<string, string>) => void
  canCorrect: boolean
  onOpenStudent: (studentId: string, element: HTMLElement) => void
  disabled: boolean
  saveError: string
  courseSelected: boolean
  courseName?: string
  enrollments: import('../shared/neon').Enrollment[]
  students: Student[]
  allStudents: Student[]
  projected: Projection
  date: string
  save: Save
}) {
  const { t, language } = useLanguage()
  const query = useQueryState()
  const [noteStudent, setNoteStudent] = useState<Student | null>(null)
  const [noteText, setNoteText] = useState('')
  const [noteTags, setNoteTags] = useState('')
  const [correction, setCorrection] = useState<{ id: string; name: string } | null>(null)
  const [reason, setReason] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [noteSaveFailed, setNoteSaveFailed] = useState(false)
  const correctionDialog = useRef<HTMLDialogElement>(null)
  const noteDialog = useRef<HTMLDialogElement>(null)
  const current = new Map(
    projected.attendance
      .filter(({ value }) => value.date === date)
      .map(({ value }) => [value.studentId, value.status]),
  )
  const candidates = [...students].sort((a, b) => a.name.localeCompare(b.name, language))
  const level = (student: Student) => studentLevel(student, courseSelected, enrollments)
  const attendanceTable = useDataTable('attendance', candidates, [
    { id: 'student', label: t('Student'), value: (student) => student.name },
    { id: 'level', label: language === 'ar' ? 'المستوى' : 'Level', value: level },
    {
      id: 'teacher',
      label: language === 'ar' ? '\u0627\u0644\u0645\u0639\u0644\u0645' : 'Teacher',
      value: (student) =>
        enrollments.find((entry) => entry.studentId === student.studentId)?.teacherName ?? '',
    },
    {
      id: 'attendance',
      choices: [t('Not marked'), t('present'), t('absent'), t('excused')],
      label: language === 'ar' ? 'الحضور' : 'Attendance',
      value: (student) => {
        const status = draft[student.studentId] ?? current.get(student.studentId)
        return status === 'present' || status === 'absent' || status === 'excused'
          ? t(status)
          : t('Not marked')
      },
    },
  ])
  const visible = query.unmarked
    ? attendanceTable.rows.filter((student) => !current.has(student.studentId))
    : attendanceTable.rows
  const unmarked = visible.filter(
    (student) => !current.has(student.studentId) && !draft[student.studentId],
  )
  const addNoteButton = (student: Student) => (
    <button
      type="button"
      className="attendance-note-button"
      aria-label={`${t('Add note for')} ${student.name}`}
      title={t('Add note')}
      aria-haspopup="dialog"
      onClick={() => {
        setNoteStudent(student)
        noteDialog.current?.showModal()
      }}
    >
      <StickyNote size={18} aria-hidden="true" />
    </button>
  )
  const rows = (items: Student[]) => (
    <div
      className="role-table-scroll"
      role="region"
      aria-label={language === 'ar' ? 'قائمة الحضور' : 'Attendance list'}
      tabIndex={0}
    >
      <table className="mobile-record-table role-table roster-table">
        <colgroup>
          <col />
          <col className="roster-level-column" />
          <col />
          <col
            className={
              canCorrect ? 'roster-attendance-correction-column' : 'roster-attendance-column'
            }
          />
        </colgroup>
        <TableHeader model={attendanceTable} />
        <tbody>
          {items.map((student) => (
            <tr key={student.studentId} data-student-id={student.studentId}>
              <td className="record-title" data-label={t('Student')}>
                <button
                  type="button"
                  className="student-name-link"
                  onClick={(event) => onOpenStudent(student.studentId, event.currentTarget)}
                >
                  <bdi>{student.name}</bdi>
                </button>
              </td>
              <td data-label={language === 'ar' ? 'المستوى' : 'Level'}>
                <bdi>{level(student) || '—'}</bdi>
              </td>
              <td
                data-label={language === 'ar' ? '\u0627\u0644\u0645\u0639\u0644\u0645' : 'Teacher'}
              >
                <bdi>
                  {enrollments.find((entry) => entry.studentId === student.studentId)
                    ?.teacherName || '\u2014'}
                </bdi>
              </td>
              <td data-label={language === 'ar' ? 'الحضور' : 'Attendance'}>
                <div className="attendance-row-controls">
                  {language === 'ar' && addNoteButton(student)}
                  <ToggleGroup
                    className="attendance-segments"
                    aria-label={`${t('Attendance for')} ${student.name}`}
                    value={[
                      draft[student.studentId] ?? current.get(student.studentId) ?? '',
                    ].filter(Boolean)}
                    disabled={disabled}
                    onValueChange={(value) => {
                      if (!value.length && current.has(student.studentId)) return
                      setDraft({ ...draft, [student.studentId]: value[0] ?? '' })
                    }}
                  >
                    {statuses.map((status) => {
                      const Icon =
                        status === 'present' ? Check : status === 'absent' ? X : CircleMinus
                      return (
                        <Toggle
                          key={status}
                          value={status}
                          className={`attendance-segment attendance-segment-${status}`}
                          aria-label={t(status)}
                          title={t(status)}
                        >
                          <Icon size={18} aria-hidden="true" />
                        </Toggle>
                      )
                    })}
                  </ToggleGroup>
                  {language === 'en' && addNoteButton(student)}
                  {canCorrect && current.has(student.studentId) && (
                    <button
                      type="button"
                      className="attendance-correct-button"
                      aria-label={`${language === 'ar' ? 'تصحيح العلامة' : 'Correct this mark'}: ${student.name}`}
                      title={language === 'ar' ? 'تصحيح العلامة' : 'Correct this mark'}
                      aria-haspopup="dialog"
                      disabled={disabled}
                      onClick={() => {
                        const record = projected.attendance.find(
                          ({ value }) =>
                            value.date === date && value.studentId === student.studentId,
                        )
                        if (record) {
                          setCorrection({ id: record.event.id, name: student.name })
                          correctionDialog.current?.showModal()
                        }
                      }}
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
  const changed = allStudents.filter(
    (student) =>
      draft[student.studentId] && draft[student.studentId] !== current.get(student.studentId),
  )
  return (
    <section className="panel attendance-session">
      <dialog
        ref={correctionDialog}
        className="grade-dialog attendance-note-dialog rounded-xl"
        aria-labelledby="correct-attendance-title"
        onClose={() => {
          setCorrection(null)
          setReason('')
        }}
      >
        {correction && (
          <form
            className="grid gap-3"
            onSubmit={async (event) => {
              event.preventDefault()
              if (
                await save([{ kind: 'reversal', targetId: correction.id, reason: reason.trim() }])
              )
                correctionDialog.current?.close()
            }}
          >
            <h2 id="correct-attendance-title" className="title">
              {language === 'ar' ? 'تصحيح العلامة' : 'Correct this mark'} ·{' '}
              <bdi>{correction.name}</bdi>
            </h2>
            <p className="muted">
              <bdi>{courseName}</bdi> · <time dateTime={date}>{date}</time>
            </p>
            <label>
              {t('Reason')}
              <input
                required
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            {saveError && <p role="alert">{saveError}</p>}
            <div className="flex flex-wrap gap-2">
              <button className="primary" disabled={disabled || !reason.trim()}>
                {t('Append correction')}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => correctionDialog.current?.close()}
              >
                {t('Cancel')}
              </button>
            </div>
          </form>
        )}
      </dialog>
      <dialog
        ref={noteDialog}
        className="grade-dialog attendance-note-dialog rounded-xl"
        aria-labelledby="attendance-note-title"
        aria-describedby="attendance-note-date"
        onCancel={(event) => {
          if (savingNote) event.preventDefault()
        }}
        onClose={() => {
          setNoteStudent(null)
          setNoteText('')
          setNoteTags('')
          setNoteSaveFailed(false)
        }}
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            if (!noteStudent || disabled || savingNote) return
            setSavingNote(true)
            const saved = await save([
              {
                kind: 'note',
                studentId: noteStudent.studentId,
                date,
                tags: normalizedNoteTags(noteTags),
                text: noteText,
              },
            ])
            setSavingNote(false)
            if (saved) noteDialog.current?.close()
            else setNoteSaveFailed(true)
          }}
        >
          <h2 id="attendance-note-title" className="title">
            {language === 'ar' ? 'ملاحظة الطالب' : 'Student note for'}{' '}
            <bdi>{noteStudent?.name}</bdi>
          </h2>
          <p id="attendance-note-date" className="muted">
            {t('Session date')}{' '}
            <time dateTime={date} dir="ltr">
              {date}
            </time>
          </p>
          <label>
            <span id="attendance-note-label">{t('Note')}</span>
            <textarea
              aria-labelledby="attendance-note-label"
              dir="auto"
              rows={4}
              disabled={disabled || savingNote}
              required
              maxLength={10000}
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
            />
          </label>
          <label>
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span id="attendance-note-tags">{t('Tags, separated by commas')}</span>
              <small id="attendance-note-tags-optional" className="muted">
                {t('Optional')}
              </small>
            </span>
            <input
              aria-labelledby="attendance-note-tags"
              aria-describedby="attendance-note-tags-optional"
              maxLength={500}
              dir="auto"
              disabled={disabled || savingNote}
              value={noteTags}
              onChange={(event) => setNoteTags(event.target.value)}
            />
          </label>
          {noteSaveFailed && saveError && <p role="alert">{saveError}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="primary" disabled={disabled || savingNote || !noteText.trim()}>
              {t('Save note')}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={savingNote}
              onClick={() => noteDialog.current?.close()}
            >
              {t('Cancel')}
            </button>
          </div>
        </form>
        {projected.notes
          .filter(({ value }) => value.studentId === noteStudent?.studentId && value.date === date)
          .toReversed()
          .map(({ event, value }) => (
            <article key={event.id} className="mt-4 border-t pt-3">
              <p dir="auto" className="whitespace-pre-wrap">
                {value.text}
              </p>
              <p className="muted">
                <bdi>{event.actor}</bdi> {value.tags.map((tag) => `#${tag}`).join(' ')}
              </p>
            </article>
          ))}
      </dialog>
      <TableToolbar model={candidates.length ? attendanceTable : undefined}>
        <h2 className="title">
          {courseName ? (
            <>
              {t('Attendance')} · <bdi>{courseName}</bdi>
            </>
          ) : (
            t('Who is here today?')
          )}
        </h2>
      </TableToolbar>
      <div className="mb-6 mt-2 flex flex-wrap items-end justify-between gap-4">
        <label>
          {t('Session date')}
          <input
            type="date"
            required
            value={date}
            onChange={(event) => {
              if (event.target.value) setQuery({ date: event.target.value })
            }}
          />
        </label>
        {candidates.length > 0 && (
          <button
            className="secondary unmarked-toggle"
            aria-pressed={query.unmarked}
            onClick={() => setQuery({ unmarked: query.unmarked ? '' : '1' }, true)}
          >
            {language === 'ar'
              ? '\u0639\u0631\u0636 \u063a\u064a\u0631 \u0627\u0644\u0645\u0633\u062c\u0644\u064a\u0646'
              : 'Show unmarked'}
          </button>
        )}
      </div>
      {!candidates.length ? (
        <Empty
          text={
            language === 'ar'
              ? '\u0644\u0627 \u064a\u0648\u062c\u062f \u0637\u0644\u0627\u0628 \u0645\u0633\u062c\u0644\u0648\u0646.'
              : 'No enrolled students.'
          }
        />
      ) : (
        <>
          {unmarked.length > 0 && (
            <button
              className="secondary mb-3"
              disabled={disabled}
              onClick={() =>
                setDraft({
                  ...draft,
                  ...Object.fromEntries(unmarked.map((student) => [student.studentId, 'present'])),
                })
              }
            >
              {language === 'ar'
                ? `\u062a\u0633\u062c\u064a\u0644 ${unmarked.length} \u063a\u064a\u0631 \u0645\u0633\u062c\u0644 \u062d\u0627\u0636\u0631\u064a\u0646`
                : `Mark ${unmarked.length} unmarked present`}
            </button>
          )}
          <DirectionProvider direction={language === 'ar' ? 'rtl' : 'ltr'}>
            {rows(visible)}
          </DirectionProvider>
          {changed.length > 0 && (
            <div className="attendance-save">
              <button
                className="primary"
                disabled={disabled}
                onClick={async () => {
                  const payloads: Payload[] = changed.map((student) => ({
                    kind: 'attendance',
                    studentId: student.studentId,
                    ...(enrollments.find((entry) => entry.studentId === student.studentId)
                      ? {
                          enrollmentId: enrollments.find(
                            (entry) => entry.studentId === student.studentId,
                          )?.id,
                        }
                      : {}),
                    date,
                    status: statusSchema.parse(draft[student.studentId]),
                  }))
                  if (await save(payloads)) setDraft({})
                }}
              >
                {t('Save attendance')} ({changed.length})
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function RosterView({
  students,
  save,
  assigned,
  courseSelected,
  enrollments,
  courses,
  allEnrollments,
  attendance,
  onOpenStudent,
}: {
  onOpenStudent: (studentId: string, element: HTMLElement) => void
  students: import('../shared/neon').NeonRosterStudent[]
  save: Save
  assigned: boolean
  courseSelected: boolean
  enrollments: import('../shared/neon').Enrollment[]
  courses: import('../shared/neon').Course[]
  allEnrollments: import('../shared/neon').Enrollment[]
  attendance: Projection['attendance']
}) {
  const { t, language } = useLanguage()
  const ar = language === 'ar'
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const rosterTable = useDataTable('roster', students, [
    { id: 'first', label: ar ? 'الاسم الأول' : 'First name', value: (s) => s.firstName ?? s.name },
    { id: 'last', label: ar ? 'اسم العائلة' : 'Last name', value: (s) => s.lastName },
    {
      id: 'phone',
      filterMode: 'literal',
      label: ar ? 'رقم الهاتف' : 'Phone',
      value: (s) => s.whatsapp,
    },
    {
      id: 'attendance',
      label: ar ? 'الحضور' : 'Attendance',
      value: (s) => {
        const rows = attendance.filter(({ value }) => value.studentId === s.studentId)
        return rows.length
          ? (rows.filter(({ value }) => value.status === 'present').length / rows.length) * 100
          : null
      },
      filterText: (s) => {
        const rows = attendance.filter(({ value }) => value.studentId === s.studentId)
        return rows.length
          ? `${((rows.filter(({ value }) => value.status === 'present').length / rows.length) * 100).toFixed(1)}%`
          : ar
            ? 'غير مسجل'
            : 'Not recorded'
      },
    },
    {
      id: 'level',
      label: ar ? 'المستوى' : 'Level',
      value: (s) => studentLevel(s, courseSelected, enrollments),
    },
    {
      id: 'courses',
      label: ar ? 'الدورات' : 'Courses',
      value: (s) =>
        courses
          .filter((course) =>
            allEnrollments.some(
              (entry) =>
                entry.studentId === s.studentId && entry.courseId === course.id && entry.active,
            ),
          )
          .map((course) => course.name)
          .join(', ') || (ar ? 'لا يوجد' : 'None'),
    },
    {
      id: 'active',
      choices: ar ? ['نشط', 'غير نشط'] : ['Active', 'Inactive'],
      label: ar ? 'الحالة' : 'Active',
      value: (s) => (s.active ? (ar ? 'نشط' : 'Active') : ar ? 'غير نشط' : 'Inactive'),
    },
  ])
  return (
    <section className="panel">
      <TableToolbar model={assigned ? rosterTable : undefined} className="mb-3">
        <h2 className="title">{t('Your students')}</h2>
      </TableToolbar>
      {!assigned && (
        <form
          className="mb-6 flex flex-wrap items-end gap-3"
          onSubmit={async (event) => {
            event.preventDefault()
            if (
              await save([
                { kind: 'student', studentId: crypto.randomUUID(), name, group, active: true },
              ])
            )
              setName('')
          }}
        >
          <label className="grow">
            {t('Student name')}
            <input
              dir="auto"
              required
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            {t('Group')}
            <input
              dir="auto"
              maxLength={100}
              value={group}
              onChange={(event) => setGroup(event.target.value)}
            />
          </label>
          <button className="primary">{t('Add student')}</button>
        </form>
      )}
      {assigned ? (
        <div
          className="role-table-scroll"
          role="region"
          aria-label={ar ? 'قائمة الطلاب' : 'Student list'}
          tabIndex={0}
        >
          <table className="mobile-record-table role-table roster-table roster-students-table">
            <colgroup>
              <col className="roster-name-column" />
              <col className="roster-name-column" />
              <col className="roster-phone-column" />
              <col className="roster-summary-column" />
              <col className="roster-level-column" />
              <col className="roster-courses-column" />
              <col className="roster-active-column" />
              <col className="roster-actions-column" />
            </colgroup>
            <TableHeader model={rosterTable} actions />
            <tbody>
              {rosterTable.rows.map((student) => (
                <tr key={student.studentId} data-student-id={student.studentId}>
                  <td
                    className="roster-student-name"
                    data-label={ar ? 'الاسم الأول' : 'First name'}
                  >
                    <button
                      type="button"
                      className="roster-first-name student-name-link"
                      onClick={(event) => onOpenStudent(student.studentId, event.currentTarget)}
                    >
                      <bdi>{student.firstName ?? student.name}</bdi>
                    </button>
                    <button
                      type="button"
                      className="icon-button roster-mobile-open"
                      aria-label={`${t('Open student')}: ${student.name}`}
                      title={t('Open student')}
                      onClick={(event) => onOpenStudent(student.studentId, event.currentTarget)}
                    >
                      <bdi>{student.name}</bdi>
                      <ChevronRight
                        className="icon-directional shrink-0"
                        size={20}
                        aria-hidden="true"
                      />
                    </button>
                  </td>
                  <td className="roster-last-name" data-label={ar ? 'اسم العائلة' : 'Last name'}>
                    <bdi>{student.lastName || '—'}</bdi>
                  </td>
                  <td data-label={ar ? 'رقم الهاتف' : 'Phone'}>
                    {student.whatsapp ? (
                      <PhoneNumber value={student.whatsapp} />
                    ) : ar ? (
                      'غير متوفر'
                    ) : (
                      'Not provided'
                    )}
                  </td>
                  <td data-label={ar ? 'الحضور' : 'Attendance'}>
                    {(() => {
                      const records = attendance.filter(
                        ({ value }) => value.studentId === student.studentId,
                      )
                      if (!records.length) return ar ? 'غير مسجل' : 'Not recorded'
                      const present = records.filter(
                        ({ value }) => value.status === 'present',
                      ).length
                      return (
                        <>
                          <strong>{((present / records.length) * 100).toFixed(1)}%</strong>
                          <br />
                          <small>
                            {ar ? 'الجلسات المسجلة' : 'Recorded sessions'}: {records.length}
                          </small>
                        </>
                      )
                    })()}
                  </td>
                  <td data-label={ar ? 'المستوى' : 'Level'}>
                    <bdi>{studentLevel(student, courseSelected, enrollments) || '—'}</bdi>
                  </td>
                  <td data-label={ar ? 'الدورات' : 'Courses'}>
                    {(() => {
                      const names = courses.filter((course) =>
                        allEnrollments.some(
                          (entry) =>
                            entry.studentId === student.studentId &&
                            entry.courseId === course.id &&
                            entry.active,
                        ),
                      )
                      return names.length ? (
                        <>
                          <div className="roster-courses-desktop">
                            {names.map((course) => (
                              <span key={course.id} className="roster-course-badge" dir="auto">
                                {course.name}
                              </span>
                            ))}
                          </div>
                          <details className="roster-courses-mobile">
                            <summary
                              aria-label={
                                ar ? `الدورات (${names.length})` : `Courses (${names.length})`
                              }
                            >
                              {names.length}
                            </summary>
                            <div>
                              {names.map((course) => (
                                <span key={course.id} className="roster-course-badge" dir="auto">
                                  {course.name}
                                </span>
                              ))}
                            </div>
                          </details>
                        </>
                      ) : ar ? (
                        'لا يوجد'
                      ) : (
                        'None'
                      )
                    })()}
                  </td>
                  <td className="roster-student-status" data-label={ar ? 'الحالة' : 'Active'}>
                    <span
                      role="img"
                      aria-label={
                        student.active ? (ar ? 'نشط' : 'Active') : ar ? 'غير نشط' : 'Inactive'
                      }
                      title={student.active ? (ar ? 'نشط' : 'Active') : ar ? 'غير نشط' : 'Inactive'}
                    >
                      {student.active ? (
                        <CircleCheck className="mx-auto" size={20} aria-hidden="true" />
                      ) : (
                        <CircleMinus className="mx-auto" size={20} aria-hidden="true" />
                      )}
                    </span>
                  </td>
                  <td className="roster-desktop-action" data-label={ar ? 'الإجراءات' : 'Actions'}>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t('Open student')}
                      title={t('Open student')}
                      onClick={(event) => onOpenStudent(student.studentId, event.currentTarget)}
                    >
                      <UserRound size={20} strokeWidth={1.6} aria-hidden="true" focusable="false" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {students.map((student) => (
            <StudentEditor
              key={`${student.studentId}:${student.name}:${student.group}:${student.active}`}
              student={student}
              save={save}
            />
          ))}
        </div>
      )}
      {!students.length && (
        <Empty
          text={
            assigned
              ? t('No assigned students match this view.')
              : t('No students yet. Add a name and optional group above.')
          }
        />
      )}
    </section>
  )
}
function StudentEditor({ student, save }: { student: Student; save: Save }) {
  const { t } = useLanguage()
  const [name, setName] = useState(student.name)
  const [group, setGroup] = useState(student.group)
  return (
    <form
      className="flex flex-wrap items-end gap-3 py-4"
      onSubmit={(event) => {
        event.preventDefault()
        void save([{ ...student, name, group }])
      }}
    >
      <label className="grow">
        {t('Name')}
        <input
          dir="auto"
          required
          maxLength={200}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        {t('Group')}
        <LevelInput
          dir="auto"
          maxLength={100}
          value={group}
          onChange={(event) => setGroup(event.target.value)}
        />
      </label>
      <button className="secondary" disabled={name === student.name && group === student.group}>
        {t('Save changes')}
      </button>
      <button
        className="secondary"
        type="button"
        onClick={() => void save([{ ...student, active: !student.active }])}
      >
        {student.active ? t('Make inactive') : t('Activate')}
      </button>
    </form>
  )
}

function Summary({
  students,
  projected,
  scope,
}: {
  students: Student[]
  projected: Projection
  scope: string
}) {
  const { t } = useLanguage()
  const totals = new Map(
    students.map((student) => [student.studentId, { present: 0, absent: 0, excused: 0, notes: 0 }]),
  )
  const records = projected.attendance.filter(({ value }) => totals.has(value.studentId))
  for (const { value } of records) {
    const counts = totals.get(value.studentId)
    if (counts) counts[value.status]++
  }
  for (const { value } of projected.notes) {
    const counts = totals.get(value.studentId)
    if (counts) counts.notes++
  }
  const summaryTable = useDataTable('summary', students, [
    { id: 'student', label: t('Student'), value: (student) => student.name },
    ...statuses.map((status) => ({
      id: status,
      label: t(status),
      value: (student: Student) => totals.get(student.studentId)?.[status] ?? 0,
    })),
    {
      id: 'notes',
      label: t('Notes'),
      value: (student) => totals.get(student.studentId)?.notes ?? 0,
    },
  ])
  return (
    <section className="panel">
      <TableToolbar model={summaryTable} className="mb-6">
        <h2 className="title">{t('Attendance overview')}</h2>
      </TableToolbar>
      <AttendanceChartExport students={students} attendance={records} scope={scope} />
      <SummaryInsights students={students} records={records} />

      <div
        className="overflow-x-auto"
        role="region"
        aria-label={t('Attendance overview')}
        tabIndex={0}
      >
        <table className="mobile-record-table role-table summary-table min-w-[42rem] table-fixed text-start text-sm">
          <TableHeader model={summaryTable} />
          <tbody>
            {summaryTable.rows.map((student) => (
              <tr key={student.studentId} className="border-t border-slate-100">
                <th scope="row" dir="auto" className="record-title p-3 text-start font-medium">
                  {student.name}
                </th>
                {statuses.map((status) => (
                  <td data-label={t(status)} key={status} className="p-3 text-center">
                    {totals.get(student.studentId)?.[status] ?? 0}
                  </td>
                ))}
                <td data-label={t('Notes')} className="p-3 text-center">
                  {totals.get(student.studentId)?.notes ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function History({
  projected,
  students,
  save,
  assigned,
}: {
  projected: Projection
  students: Student[]
  save: Save
  assigned: boolean
}) {
  const { t, language } = useLanguage()
  const [target, setTarget] = useState('')
  const [expandedRecords, setExpandedRecords] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const query = useQueryState()
  const ids = new Set(students.map((student) => student.studentId))
  const visible = projected.events.filter((event) => {
    const payload = event.payload
    if (assigned && query.student) {
      if (payload.kind === 'reversal') {
        const target = projected.events.find((item) => item.id === payload.targetId)
        return (
          !!target &&
          target.payload.kind !== 'reversal' &&
          target.payload.studentId === query.student
        )
      }
      return payload.studentId === query.student
    }
    return (
      (!query.q && !query.group) ||
      payload.kind === 'reversal' ||
      !payload.studentId ||
      ids.has(payload.studentId)
    )
  })
  return (
    <section className="panel">
      <h1 className="title">{t('History & corrections')}</h1>
      <p className="muted mt-2 mb-6">
        {t(
          'Undo appends a correction. The original stays in the record. Undoing the latest attendance restores the previous status.',
        )}{' '}
        {projected.duplicates > 0
          ? language === 'ar'
            ? `تم احتساب ${projected.duplicates} عمليات إرسال مكررة مرة واحدة.`
            : `${projected.duplicates} duplicate deliveries were counted once.`
          : ''}
      </p>
      {target && (
        <form
          className="mb-6 space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4"
          onSubmit={async (event) => {
            event.preventDefault()
            if (await save([{ kind: 'reversal', targetId: target, reason }])) {
              setTarget('')
              setReason('')
            }
          }}
        >
          <p>
            {t('Undo record')} <code className="break-all">{target}</code>
          </p>
          <label>
            {t('Reason')}
            <input
              required
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="flex gap-3">
            <button className="primary">{t('Append correction')}</button>
            <button type="button" className="secondary" onClick={() => setTarget('')}>
              {t('Cancel')}
            </button>
          </div>
        </form>
      )}
      {!visible.length && (
        <Empty text={t('New attendance, notes and student changes will appear here.')} />
      )}
      <ol className="divide-y divide-slate-100">
        {visible.toReversed().map((event) => (
          <li key={event.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
            <div className="min-w-0 flex-1">
              {event.payload.kind === 'student' ? (
                <dl className="grid grid-cols-3 gap-2 break-words">
                  <div>
                    <dt>{t('Student')}</dt>
                    <dd dir="auto">{event.payload.name}</dd>
                  </div>
                  <div>
                    <dt>{language === 'ar' ? 'المستوى' : 'Level'}</dt>
                    <dd dir="auto">{formatLevel(event.payload.group) || '—'}</dd>
                  </div>
                  <div>
                    <dt>{language === 'ar' ? 'الحالة' : 'Status'}</dt>
                    <dd>{t(event.payload.active ? 'active' : 'inactive')}</dd>
                  </div>
                </dl>
              ) : (
                <p dir="auto" className="font-medium">
                  {describeEvent(event, projected.students, t)}
                </p>
              )}
              <p className="muted mt-1">
                <bdi>{event.actor}</bdi> ·{' '}
                {event.receivedAt
                  ? `${event.receivedAt} (server)`
                  : `${event.clientTime} (${t('device')})`}
                {projected.reversed.has(event.id) ? ` · ${t('Undone')}` : ''}
              </p>
              {expandedRecords.includes(event.id) && (
                <pre
                  dir="ltr"
                  className="mt-2 text-start text-xs text-slate-500 whitespace-pre-wrap break-all"
                >
                  {JSON.stringify(event, null, 2)}
                </pre>
              )}
            </div>
            <RowActions
              name={language === 'ar' ? 'السجل' : 'record'}
              ar={language === 'ar'}
              actions={[
                {
                  label: t('Record details'),
                  onClick: () =>
                    setExpandedRecords((items) =>
                      items.includes(event.id)
                        ? items.filter((id) => id !== event.id)
                        : [...items, event.id],
                    ),
                },
                ...(event.payload.kind !== 'reversal' && !projected.reversed.has(event.id)
                  ? [{ label: t('Undo'), onClick: () => setTarget(event.id) }]
                  : []),
              ]}
            />
          </li>
        ))}
      </ol>
    </section>
  )
}
function describeEvent(
  event: LedgerEvent,
  students: Student[],
  t: (text: TranslationKey) => string,
) {
  const value = event.payload
  if (value.kind === 'reversal') return `${t('Correction')}: ${value.reason}`
  const name =
    students.find((student) => student.studentId === value.studentId)?.name ??
    t('General / unknown student')
  if (value.kind === 'student')
    return `${t('Student')}: ${value.name} · ${t(value.active ? 'active' : 'inactive')}`
  if (value.kind === 'attendance')
    return `${name} · ${value.date} · ${t(normalizeStatus(value.status))}`
  return `${name} · ${value.date} · #${value.tags.join(' #')} · ${value.text}`
}
function Empty({ text }: { text: string }) {
  return <p className="rounded-lg bg-slate-50 p-5 text-slate-600">{text}</p>
}
