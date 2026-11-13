import { LanguageProvider, LanguageSwitch, useLanguage, type TranslationKey } from './i18n'
import { useEffect, useState } from 'react'
import type { Access } from '../shared/access'
import {
  projectEvents,
  statuses,
  statusSchema,
  type LedgerEvent,
  type Payload,
  type Student,
} from '../shared/ledger'
import { clearSession, loadSession } from './session'
import { navigatePage, setQuery, useQueryState, type Tab } from './queryState'
import { HomePage } from './HomePage'
import { InstallApp } from './InstallApp'
import { WartaqIcon, WartaqLogo } from './brand/components'
import './workspace.css'
import { useLedger } from './useLedger'
import { NeonAuth } from './NeonAuth'
import { AdminConsole } from './AdminConsole'
import { StudentAttendance } from './StudentAttendance'
import { authClient } from './neon'
import type { NeonTeacher } from '../shared/neon'

const tabs: { id: Tab; label: TranslationKey }[] = [
  { id: 'attendance', label: 'Attendance' },
  { id: 'notes', label: 'Notes' },
  { id: 'roster', label: 'Students' },
  { id: 'summary', label: 'Summary' },
  { id: 'history', label: 'History & corrections' },
]
type Projection = ReturnType<typeof projectEvents>
type Save = (payloads: Payload[]) => Promise<boolean>

export function App(props: {
  initialSession: { access: Access | null; error: string }
  initialResetToken?: string
}) {
  return (
    <LanguageProvider>
      <div className="wartaq-site">
        <a className="skip-link" href="#main-content">
          <SkipText />
        </a>
        <InstallApp />
        <AppContent {...props} />
      </div>
    </LanguageProvider>
  )
}

function AppContent({
  initialSession,
  initialResetToken,
}: {
  initialSession: { access: Access | null; error: string }
  initialResetToken?: string
}) {
  const { t, errorMessage } = useLanguage()
  const [session, setSession] = useState({ ...initialSession, revision: 0 })
  const [demo, setDemo] = useState<'legacy' | 'assigned' | null>(null)
  const { access } = session
  const query = useQueryState()
  const [resetToken, setResetToken] = useState(initialResetToken)
  const reset = !!resetToken
  const openDemo = (kind: 'legacy' | 'assigned') => {
    setDemo(kind)
    navigatePage('app')
  }
  const goHome = () => {
    setDemo(null)
    setResetToken(undefined)
    navigatePage('home')
  }
  useEffect(() => {
    function onHashChange() {
      if (!new URLSearchParams(window.location.hash.slice(1)).has('access')) return
      const next = loadSession()
      setSession((previous) => ({ ...next, revision: previous.revision + 1 }))
      setDemo(null)
      setQuery({ page: 'app' })
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  if (query.page === 'home' && !reset)
    return (
      <HomePage
        onOpenApp={() => {
          setDemo(null)
          navigatePage('app')
        }}
        onExplore={() => openDemo('legacy')}
        onExploreAssigned={() => openDemo('assigned')}
        error={session.error ? errorMessage(session.error) : undefined}
      />
    )
  if (!access && !demo && authClient)
    return (
      <>
        <NeonAuth
          initialResetToken={resetToken}
          onResetComplete={() => setResetToken(undefined)}
          onSignOut={goHome}
          samples={
            <>
              <button className="secondary self-start" onClick={() => openDemo('legacy')}>
                {t('Explore with sample students')}
              </button>
              <button className="secondary self-start" onClick={() => openDemo('assigned')}>
                {t('Explore assigned teacher sample')}
              </button>
            </>
          }
        >
          {(userId, account, signOut) =>
            account.role === 'student' ? (
              <StudentAttendance key={userId} userId={userId} signOut={signOut} />
            ) : account.role === 'administrator' && query.view === 'administration' ? (
              <AdminConsole
                key={userId}
                userId={userId}
                signOut={signOut}
                openNotebook={() => setQuery({ view: 'notebook' }, true)}
              />
            ) : (
              <Notebook
                key={userId}
                access={null}
                demo={null}
                neon={{ userId, teacher: account }}
                leave={signOut}
              />
            )
          }
        </NeonAuth>
      </>
    )
  if (!access && !demo)
    return (
      <>
        <LanguageSwitch />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-6 px-6"
        >
          <WartaqLogo />
          <a className="secondary self-start" href={window.location.pathname}>
            {t('Halaqa notebook')}
          </a>
          <h1 className="text-4xl font-semibold tracking-tight">
            {t('Your halaqa, one shared notebook.')}
          </h1>
          <p className="text-lg leading-relaxed text-slate-600">
            {t('Record attendance. Leave a note. Keep the next teacher in the loop.')}
          </p>
          <div className="panel space-y-3">
            <h2 className="font-semibold">{t('Open your personal access link')}</h2>
            <p className="muted">
              {t(
                'Your manager sends you a link with your name and access. Keep it somewhere private and open it whenever you return.',
              )}
            </p>
          </div>
          {session.error && (
            <p role="alert" className="text-red-700">
              {errorMessage(session.error)}
            </p>
          )}
          <button className="secondary self-start" onClick={() => openDemo('legacy')}>
            {t('Explore with sample students')}
          </button>
          <button className="secondary self-start" onClick={() => openDemo('assigned')}>
            {t('Explore assigned teacher sample')}
          </button>
          <p className="muted">
            {t('الحضور والملاحظات · Arabic names, notes and tags are supported.')}
          </p>
        </main>
      </>
    )
  return (
    <Notebook
      key={session.revision}
      access={demo ? null : access}
      demo={demo}
      leave={() => {
        clearSession()
        setSession((previous) => ({ access: null, error: '', revision: previous.revision + 1 }))
        goHome()
      }}
    />
  )
}

function Notebook({
  access,
  demo,
  leave,
  neon,
}: {
  neon?: { userId: string; teacher: NeonTeacher }
  access: Access | null
  demo: 'legacy' | 'assigned' | null
  leave: () => void
}) {
  const { t, language, errorMessage } = useLanguage()
  const query = useQueryState()
  const ledger = useLedger(access, demo !== null, demo === 'assigned', neon)
  const assigned = !!neon || access?.version === 2 || demo === 'assigned'
  const baseProjection = projectEvents(ledger.events)
  const projected = assigned ? { ...baseProjection, students: ledger.roster } : baseProjection
  const groups = [
    ...new Set(projected.students.map((student) => student.group).filter(Boolean)),
  ].sort()
  const students = projected.students.filter(
    (student) =>
      (query.all || student.active) &&
      (!assigned || !query.student || student.studentId === query.student) &&
      (!query.group || student.group === query.group) &&
      student.name.toLocaleLowerCase().includes(query.q.toLocaleLowerCase()),
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
  return (
    <div className="workspace">
      <aside className="workspace-rail">
        <div className="workspace-brand">
          <WartaqLogo />
          <span>{t('Halaqa notebook')}</span>
        </div>
        <nav aria-label={t('Notebook')}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={query.tab === tab.id ? 'active' : ''}
              aria-label={t(tab.label)}
              aria-current={query.tab === tab.id ? 'page' : undefined}
              onClick={() =>
                setQuery({ tab: tab.id, ...(assigned ? {} : { student: '' }), tag: '' }, true)
              }
            >
              <WartaqIcon name={tab.id === 'roster' ? 'students' : tab.id} />
              <span className={tab.id === 'history' ? 'workspace-tab-long' : undefined}>
                {t(tab.label)}
              </span>
              {tab.id === 'history' && (
                <span className="workspace-tab-short" aria-hidden="true">
                  {language === 'ar' ? 'السجل' : 'History'}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="workspace-identity">
          <span>{t('Attendance & notes · الحضور والملاحظات')}</span>
        </div>
      </aside>
      <main id="main-content" tabIndex={-1} className="workspace-main">
        <div className="workspace-topline">
          <span>
            {t('Halaqa notebook')} /{' '}
            {t(tabs.find((tab) => tab.id === query.tab)?.label ?? 'Attendance')}
          </span>
          <LanguageSwitch />
          {neon && (
            <span>
              {neon.teacher.role === 'administrator'
                ? language === 'ar'
                  ? 'مسؤول'
                  : 'Administrator'
                : language === 'ar'
                  ? 'معلم'
                  : 'Teacher'}
            </span>
          )}
          {neon?.teacher.role === 'administrator' && (
            <button
              className="secondary"
              onClick={() => setQuery({ view: 'administration' }, true)}
            >
              {language === 'ar' ? 'الإدارة' : 'Administration'}
            </button>
          )}
          <button disabled={ledger.busy} className="secondary" onClick={leave}>
            {neon ? t('Sign out') : t('Close session')}
          </button>
        </div>
        <header className="workspace-welcome">
          <div>
            <p dir="auto">{neon?.teacher.name ?? access?.username ?? t('Demo teacher')}</p>
            <h1>{t('Halaqa notebook')}</h1>
            <span>{t('Record attendance. Leave a note. Keep the next teacher in the loop.')}</span>
          </div>
          <div className="workspace-count">
            <strong>{projected.students.length}</strong>
            <span>{t('Students')}</span>
          </div>
        </header>
        {demo && (
          <p className="mb-5 rounded-lg bg-amber-100 p-3 text-amber-900">
            {demo === 'assigned' ? t('Assigned teacher sample notebook.') : t('Sample notebook.')}{' '}
            {t(
              'Changes stay in memory and disappear when you leave. No SheetDB requests are made.',
            )}
          </p>
        )}
        <div className="mb-6 flex flex-wrap items-end gap-3">
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
                <option key={group}>{group}</option>
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
              className="secondary"
              disabled={ledger.busy}
              onClick={() => void ledger.refresh()}
            >
              {t('Refresh')}
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
              : `${projected.conflicts} conflicting duplicate IDs detected. Ask the manager to inspect the sheet.`}
          </p>
        )}
        {(ledger.invalid > 0 || projected.invalidReversals > 0) && (
          <p role="status" className="mb-4 text-amber-800">
            {language === 'ar'
              ? `تم تجاوز ${ledger.invalid} صفوف غير صالحة و${projected.invalidReversals} تصحيحات غير صالحة. اطلب من المسؤول فحص الجدول.`
              : `${ledger.invalid} invalid rows and ${projected.invalidReversals} invalid corrections were skipped. Ask the manager to inspect the sheet.`}
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
              {t(
                'Retry reuses their original IDs. Even if a request reached the sheet twice, summaries count each record once.',
              )}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                disabled={ledger.busy || !!(neon && !neon.teacher.canWrite)}
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
        {!ledger.loaded && !ledger.error && (
          <p role="status">{t('Loading the shared notebook…')}</p>
        )}
        <div className={query.tab === 'attendance' ? 'workspace-content' : ''}>
          <fieldset disabled={disabled} className="min-w-0">
            {query.tab === 'attendance' && (
              <AttendanceView
                key={query.date}
                students={students.filter((student) => student.active)}
                projected={projected}
                date={query.date}
                save={ledger.save}
              />
            )}
            {query.tab === 'notes' && (
              <NotesView
                students={students}
                projected={projected}
                save={ledger.save}
                assigned={assigned}
              />
            )}
            {query.tab === 'roster' && (
              <RosterView students={students} save={ledger.save} assigned={assigned} />
            )}
            {query.tab === 'summary' && <Summary students={students} projected={projected} />}
            {query.tab === 'history' && (
              <History
                projected={projected}
                students={students}
                save={ledger.save}
                assigned={assigned}
              />
            )}
          </fieldset>
          {query.tab === 'attendance' && (
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
        <footer className="mt-8 border-t border-slate-200 py-5 text-sm text-slate-500">
          {t('Every change leaves a record. Use History & corrections to undo a mistake.')}
        </footer>
      </main>
    </div>
  )
}

function AttendanceView({
  students,
  projected,
  date,
  save,
}: {
  students: Student[]
  projected: Projection
  date: string
  save: Save
}) {
  const { t } = useLanguage()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const current = new Map(
    projected.attendance
      .filter(({ value }) => value.date === date)
      .map(({ value }) => [value.studentId, value.status]),
  )
  const changed = students.filter(
    (student) =>
      draft[student.studentId] && draft[student.studentId] !== current.get(student.studentId),
  )
  return (
    <section className="panel">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="title">{t('Who is here today?')}</h2>
          <p className="muted mt-2">
            {t(
              'Only marked students are saved. To remove an existing mark, use History & corrections; undoing the latest mark may reveal an earlier one.',
            )}
          </p>
        </div>
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
      </div>
      {!students.length ? (
        <Empty text={t('Add your students in Students, or adjust the group filter.')} />
      ) : (
        <>
          <button
            className="secondary mb-4"
            onClick={() =>
              setDraft(
                Object.fromEntries(students.map((student) => [student.studentId, 'present'])),
              )
            }
          >
            {t('Mark displayed students present')}
          </button>
          <div className="divide-y divide-slate-100">
            {students.map((student) => (
              <label
                key={student.studentId}
                className="flex-row flex-wrap items-center justify-between gap-3 py-3"
              >
                <span dir="auto" className="text-base font-semibold">
                  {student.name}
                  <span className="ms-3 text-sm font-normal text-slate-500">{student.group}</span>
                </span>
                <select
                  aria-label={`${t('Attendance for')} ${student.name}`}
                  value={draft[student.studentId] ?? current.get(student.studentId) ?? ''}
                  onChange={(event) =>
                    setDraft({ ...draft, [student.studentId]: event.target.value })
                  }
                >
                  <option value="" disabled={current.has(student.studentId)}>
                    {t('Not marked')}
                  </option>
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {t(status)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            className="primary mt-5"
            disabled={!changed.length}
            onClick={async () => {
              const payloads: Payload[] = changed.map((student) => ({
                kind: 'attendance',
                studentId: student.studentId,
                date,
                status: statusSchema.parse(draft[student.studentId]),
              }))
              if (await save(payloads)) setDraft({})
            }}
          >
            {t('Save attendance')} ({changed.length})
          </button>
        </>
      )}
    </section>
  )
}

function NotesView({
  students,
  projected,
  save,
  assigned,
}: {
  students: Student[]
  projected: Projection
  save: Save
  assigned: boolean
}) {
  const { t } = useLanguage()
  const query = useQueryState()
  const [text, setText] = useState('')
  const [tags, setTags] = useState('')
  const [studentId, setStudentId] = useState(query.student)
  const ids = new Set(students.map((student) => student.studentId))
  const selectedStudentId = assigned && !ids.has(studentId) ? '' : studentId
  const notes = projected.notes.filter(
    ({ value }) =>
      (!value.studentId || ids.has(value.studentId)) &&
      (!query.tag || value.tags.includes(query.tag)) &&
      (!query.student || value.studentId === query.student) &&
      value.date >= query.from &&
      value.date <= query.to,
  )
  const availableTags = [...new Set(projected.notes.flatMap(({ value }) => value.tags))].sort()
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <form
        className="panel space-y-4 self-start"
        onSubmit={async (event) => {
          event.preventDefault()
          const normalized = [
            ...new Set(
              tags
                .split(/[,،]/)
                .map((tag) => tag.trim().replace(/^#/, '').toLocaleLowerCase())
                .filter(Boolean),
            ),
          ]
          if (
            await save([
              {
                kind: 'note',
                studentId: selectedStudentId,
                date: query.date,
                tags: normalized,
                text,
              },
            ])
          ) {
            setText('')
            setTags('')
          }
        }}
      >
        <h2 className="title">{t('Leave a note')}</h2>
        <label>
          {t('Student')}
          <select
            required={assigned}
            value={selectedStudentId}
            onChange={(event) => setStudentId(event.target.value)}
          >
            <option value="">{assigned ? t('Choose a student') : t('General note')}</option>
            {students.map((student) => (
              <option key={student.studentId} value={student.studentId}>
                {student.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('Date')}
          <input
            type="date"
            required
            value={query.date}
            onChange={(event) => setQuery({ date: event.target.value })}
          />
        </label>
        <label>
          {t('Tags, separated by commas')}
          <input
            required
            maxLength={500}
            dir="auto"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder={t('revision, follow-up / مراجعة')}
          />
        </label>
        <label>
          <span id="note-label">{t('Note')}</span>
          <textarea
            aria-labelledby="note-label"
            dir="auto"
            rows={6}
            required
            maxLength={10000}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t('What should the next teacher know?')}
          />
        </label>
        <p className="muted">
          {t('Plain text or your own structured format. Tags make it easy to find later.')}
        </p>
        <button className="primary" disabled={assigned && !selectedStudentId}>
          {t('Save note')}
        </button>
      </form>
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="title">{t('Shared notes')}</h2>
          <label>
            {t('From')}
            <input
              type="date"
              value={query.from}
              onChange={(event) => setQuery({ from: event.target.value })}
            />
          </label>
          <label>
            {t('To')}
            <input
              type="date"
              value={query.to}
              onChange={(event) => setQuery({ to: event.target.value })}
            />
          </label>
          <label>
            {t('Filter tag')}
            <select value={query.tag} onChange={(event) => setQuery({ tag: event.target.value })}>
              <option value="">{t('All tags')}</option>
              {availableTags.map((tag) => (
                <option key={tag}>{tag}</option>
              ))}
            </select>
          </label>
        </div>
        {!notes.length && <Empty text={t('No notes match this view. Add the first one.')} />}
        {notes.toReversed().map(({ event, value }) => (
          <article key={event.id} className="panel">
            <div className="mb-3 flex flex-wrap justify-between gap-2">
              <h3 dir="auto" className="font-semibold">
                {projected.students.find((student) => student.studentId === value.studentId)
                  ?.name ?? (value.studentId ? t('Unknown student') : t('General note'))}
              </h3>
              <span className="muted">
                <bdi>{value.date}</bdi> · <bdi>{event.actor}</bdi>
              </span>
            </div>
            <p dir="auto" className="whitespace-pre-wrap break-words leading-relaxed">
              {value.text}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {value.tags.map((tag) => (
                <button
                  key={tag}
                  dir="auto"
                  className="rounded-full bg-[#e2f4f4] px-3 py-1 text-sm text-[#005761]"
                  onClick={() => setQuery({ tag })}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}

function RosterView({
  students,
  save,
  assigned,
}: {
  students: Student[]
  save: Save
  assigned: boolean
}) {
  const { t } = useLanguage()
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  return (
    <section className="panel">
      <h2 className="title mb-5">{t('Your students')}</h2>
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
      <div className="divide-y divide-slate-100">
        {students.map((student) =>
          assigned ? (
            <div key={student.studentId} className="flex items-center justify-between py-4">
              <span>
                <bdi>{student.name}</bdi>
                {student.group && (
                  <>
                    {' '}
                    · <bdi>{student.group}</bdi>
                  </>
                )}
              </span>
              <button
                className="secondary"
                onClick={() => setQuery({ student: student.studentId, tab: 'attendance' }, true)}
              >
                {t('Open student')}
              </button>
            </div>
          ) : (
            <StudentEditor
              key={`${student.studentId}:${student.name}:${student.group}:${student.active}`}
              student={student}
              save={save}
            />
          ),
        )}
      </div>
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
        <input
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

function Summary({ students, projected }: { students: Student[]; projected: Projection }) {
  const { t, language } = useLanguage()
  const query = useQueryState()
  const ids = new Set(students.map((student) => student.studentId))
  const records = projected.attendance.filter(
    ({ value }) => ids.has(value.studentId) && value.date >= query.from && value.date <= query.to,
  )
  return (
    <section className="panel">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h2 className="title">{t('Attendance overview')}</h2>
        <div className="flex min-w-0 max-w-full flex-wrap gap-3">
          <label>
            {t('From')}
            <input
              type="date"
              value={query.from}
              onChange={(event) => setQuery({ from: event.target.value })}
            />
          </label>
          <label>
            {t('To')}
            <input
              type="date"
              value={query.to}
              onChange={(event) => setQuery({ to: event.target.value })}
            />
          </label>
        </div>
      </div>
      {query.from > query.to && (
        <p role="alert" className="text-red-700">
          {t('The end date must be on or after the start date.')}
        </p>
      )}
      <p className="muted mb-5">
        {language === 'ar'
          ? `${records.length} جلسات محددة للطلاب. لا تُحتسب الأيام غير المحددة.`
          : `${records.length} marked student-sessions. Unmarked days are excluded.`}
      </p>
      <div className="mb-8 space-y-3" aria-label={t('Attendance totals')}>
        {statuses.map((status) => {
          const count = records.filter(({ value }) => value.status === status).length
          return (
            <div
              key={status}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(2ch,auto)] items-center gap-3"
            >
              <span>{t(status)}</span>
              <meter
                className="h-6 w-full accent-[#007d8d]"
                min={0}
                max={Math.max(records.length, 1)}
                value={count}
                aria-label={`${t(status)}: ${count}`}
              />
              <strong className="text-end">{count}</strong>
            </div>
          )
        })}
      </div>
      <p className="muted mb-2 sm:hidden">{t('Scroll sideways to see all columns.')}</p>
      <div
        className="overflow-x-auto"
        role="region"
        aria-label={t('Attendance overview')}
        tabIndex={0}
      >
        <table className="w-full min-w-[42rem] table-fixed text-start text-sm">
          <thead>
            <tr>
              <th scope="col" className="w-40 p-3 text-start">
                {t('Student')}
              </th>
              {statuses.map((status) => (
                <th scope="col" key={status} className="p-3">
                  {t(status)}
                </th>
              ))}
              <th scope="col" className="p-3">
                {t('Notes')}
              </th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.studentId} className="border-t border-slate-100">
                <th scope="row" dir="auto" className="p-3 text-start font-medium">
                  {student.name}
                </th>
                {statuses.map((status) => (
                  <td key={status} className="p-3 text-center">
                    {
                      records.filter(
                        ({ value }) =>
                          value.studentId === student.studentId && value.status === status,
                      ).length
                    }
                  </td>
                ))}
                <td className="p-3 text-center">
                  {
                    projected.notes.filter(
                      ({ value }) =>
                        value.studentId === student.studentId &&
                        value.date >= query.from &&
                        value.date <= query.to,
                    ).length
                  }
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
      <h2 className="title">{t('History & corrections')}</h2>
      <p className="muted mt-2 mb-6">
        {t(
          'Undo appends a correction. The original stays in the sheet. Undoing the latest attendance restores the previous status.',
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
              <p dir="auto" className="font-medium">
                {describeEvent(event, projected.students, t)}
              </p>
              <p className="muted mt-1">
                <bdi>{event.actor}</bdi> ·{' '}
                {event.receivedAt
                  ? `${event.receivedAt} (SheetDB)`
                  : `${event.clientTime} (${t('device')})`}
                {projected.reversed.has(event.id) ? ` · ${t('Undone')}` : ''}
              </p>
              <details className="mt-2 text-xs text-slate-500">
                <summary>{t('Record details')}</summary>
                <pre dir="ltr" className="mt-2 text-start whitespace-pre-wrap break-all">
                  {JSON.stringify(event, null, 2)}
                </pre>
              </details>
            </div>
            {event.payload.kind !== 'reversal' && !projected.reversed.has(event.id) && (
              <button className="secondary" onClick={() => setTarget(event.id)}>
                {t('Undo')}
              </button>
            )}
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
    return `${t('Student')}: ${value.name} · ${value.group || t('No group')} · ${t(value.active ? 'active' : 'inactive')}`
  if (value.kind === 'attendance') return `${name} · ${value.date} · ${t(value.status)}`
  return `${name} · #${value.tags.join(' #')} · ${value.text}`
}
function Empty({ text }: { text: string }) {
  return <p className="rounded-lg bg-slate-50 p-5 text-slate-600">{text}</p>
}

function SkipText() {
  const { t } = useLanguage()
  return t('Skip to main content')
}
