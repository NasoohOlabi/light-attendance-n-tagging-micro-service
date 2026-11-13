import { useState } from 'react'
import type { Access } from '../shared/access'
import { projectEvents, statuses, statusSchema, type LedgerEvent, type Payload, type Student } from '../shared/ledger'
import { clearSession } from './session'
import { setQuery, useQueryState, type Tab } from './queryState'
import { useLedger } from './useLedger'

const tabs: { id: Tab; label: string }[] = [
  { id: 'attendance', label: 'Attendance' }, { id: 'notes', label: 'Notes' }, { id: 'roster', label: 'Students' },
  { id: 'summary', label: 'Summary' }, { id: 'history', label: 'History & corrections' },
]
type Projection = ReturnType<typeof projectEvents>
type Save = (payloads: Payload[]) => Promise<boolean>

export function App({ initialSession }: { initialSession: { access: Access | null; error: string } }) {
  const [access, setAccess] = useState(initialSession.access)
  const [demo, setDemo] = useState(false)
  if (!access && !demo) return <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-6 px-6">
    <span className="text-5xl text-indigo-700" aria-hidden="true">◈</span>
    <h1 className="text-4xl font-semibold tracking-tight">Your halaqa,<br />one shared notebook.</h1>
    <p className="text-lg leading-relaxed text-slate-600">Record attendance. Leave a note. Keep the next teacher in the loop.</p>
    <div className="panel space-y-3"><h2 className="font-semibold">Open your personal access link</h2><p className="muted">Your manager sends you a link with your name and access. Keep it somewhere private and open it whenever you return.</p></div>
    {initialSession.error && <p role="alert" className="text-red-700">{initialSession.error}</p>}
    <button className="secondary self-start" onClick={() => setDemo(true)}>Explore with sample students</button>
    <p className="muted">الحضور والملاحظات · Arabic names, notes and tags are supported.</p>
  </main>
  return <Notebook key={access?.apiId ?? 'demo'} access={access} demo={demo} leave={() => { clearSession(); setAccess(null); setDemo(false) }} />
}

function Notebook({ access, demo, leave }: { access: Access | null; demo: boolean; leave: () => void }) {
  const query = useQueryState()
  const ledger = useLedger(access, demo)
  const projected = projectEvents(ledger.events)
  const groups = [...new Set(projected.students.map((student) => student.group).filter(Boolean))].sort()
  const students = projected.students.filter((student) => (query.all || student.active) && (!query.group || student.group === query.group) && student.name.toLocaleLowerCase().includes(query.q.toLocaleLowerCase()))
  const disabled = ledger.busy || !!ledger.pending.length || !ledger.loaded
  return <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8">
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
      <div><div className="flex items-center gap-3"><span aria-hidden="true" className="text-3xl text-indigo-700">◈</span><h1 className="text-2xl font-semibold">Halaqa notebook</h1></div><p className="muted mt-1">Attendance & notes · الحضور والملاحظات</p></div>
      <div className="flex items-center gap-3 text-sm"><span dir="auto">{access?.username ?? 'Demo teacher'}</span><button disabled={ledger.busy} className="secondary" onClick={leave}>Close session</button></div>
    </header>
    {demo && <p className="mb-5 rounded-lg bg-amber-100 p-3 text-amber-900">Sample notebook. Changes stay in memory and disappear when you leave. No SheetDB requests are made.</p>}
    <nav aria-label="Notebook" className="mb-6 flex flex-wrap gap-2">{tabs.map((tab) => <button key={tab.id} className={query.tab === tab.id ? 'primary' : 'secondary'} aria-current={query.tab === tab.id ? 'page' : undefined} onClick={() => setQuery({ tab: tab.id, student: '', tag: '' }, true)}>{tab.label}</button>)}</nav>
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <label className="grow">Find a student<input value={query.q} onChange={(event) => setQuery({ q: event.target.value })} placeholder="Name / اسم الطالب" /></label>
      <label>Group<select value={query.group} onChange={(event) => setQuery({ group: event.target.value })}><option value="">All groups</option>{groups.map((group) => <option key={group}>{group}</option>)}</select></label>
      <label className="mb-3 flex-row items-center"><input type="checkbox" checked={query.all} onChange={(event) => setQuery({ all: event.target.checked ? '1' : '' })} />Include inactive</label>
      {!demo && <button className="secondary" disabled={ledger.busy} onClick={() => void ledger.refresh()}>Refresh</button>}
    </div>
    {ledger.error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-red-800">{ledger.error}</p>}
    {ledger.message && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-4 text-emerald-800">{ledger.message}</p>}
    {(ledger.invalid > 0 || projected.invalidReversals > 0) && <p className="mb-4 text-amber-800">{ledger.invalid} invalid rows and {projected.invalidReversals} invalid corrections were skipped. Ask the manager to inspect the sheet.</p>}
    {ledger.pending.length > 0 && <div className="panel mb-4 space-y-3"><h2 className="font-semibold">{ledger.pending.length} records awaiting confirmation</h2><p className="muted">Retry reuses their original IDs. Even if a request reached the sheet twice, summaries count each record once.</p><div className="flex flex-wrap gap-3"><button disabled={ledger.busy} className="primary" onClick={() => void ledger.retry()}>Retry pending batch</button><button disabled={ledger.busy} className="secondary" onClick={ledger.discard}>Discard pending retry</button></div></div>}
    {!ledger.loaded && !ledger.error && <p role="status">Loading the shared notebook…</p>}
    <fieldset disabled={disabled} className="min-w-0">
      {query.tab === 'attendance' && <AttendanceView key={query.date} students={students.filter((student) => student.active)} projected={projected} date={query.date} save={ledger.save} />}
      {query.tab === 'notes' && <NotesView students={students} projected={projected} save={ledger.save} />}
      {query.tab === 'roster' && <RosterView students={students} save={ledger.save} />}
      {query.tab === 'summary' && <Summary students={students} projected={projected} />}
      {query.tab === 'history' && <History projected={projected} students={students} save={ledger.save} />}
    </fieldset>
    <footer className="mt-8 border-t border-slate-200 py-5 text-sm text-slate-500">Every change leaves a record. Use History & corrections to undo a mistake.</footer>
  </div>
}

function AttendanceView({ students, projected, date, save }: { students: Student[]; projected: Projection; date: string; save: Save }) {
  const [draft, setDraft] = useState<Record<string, string>>({})
  const current = new Map(projected.attendance.filter(({ value }) => value.date === date).map(({ value }) => [value.studentId, value.status]))
  const changed = students.filter((student) => draft[student.studentId] && draft[student.studentId] !== current.get(student.studentId))
  return <section className="panel">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><h2 className="title">Who is here today?</h2><p className="muted mt-2">Only marked students are saved. Unmarked students are not counted as absent.</p></div><label>Session date<input type="date" required value={date} onChange={(event) => { if (event.target.value) setQuery({ date: event.target.value }) }} /></label></div>
    {!students.length ? <Empty text="Add your students in Students, or adjust the group filter." /> : <>
      <button className="secondary mb-4" onClick={() => setDraft(Object.fromEntries(students.map((student) => [student.studentId, 'present'])))}>Mark displayed students present</button>
      <div className="divide-y divide-slate-100">{students.map((student) => <label key={student.studentId} className="flex-row flex-wrap items-center justify-between gap-3 py-3"><span dir="auto" className="text-base font-semibold">{student.name}<span className="ms-3 text-sm font-normal text-slate-500">{student.group}</span></span><select aria-label={`Attendance for ${student.name}`} value={draft[student.studentId] ?? current.get(student.studentId) ?? ''} onChange={(event) => setDraft({ ...draft, [student.studentId]: event.target.value })}><option value="">Not marked</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>)}</div>
      <button className="primary mt-5" disabled={!changed.length} onClick={async () => {
        const payloads: Payload[] = changed.map((student) => ({ kind: 'attendance', studentId: student.studentId, date, status: statusSchema.parse(draft[student.studentId]) }))
        if (await save(payloads)) setDraft({})
      }}>Save attendance ({changed.length})</button>
    </>}
  </section>
}

function NotesView({ students, projected, save }: { students: Student[]; projected: Projection; save: Save }) {
  const query = useQueryState()
  const [text, setText] = useState('')
  const [tags, setTags] = useState('')
  const [studentId, setStudentId] = useState('')
  const ids = new Set(students.map((student) => student.studentId))
  const notes = projected.notes.filter(({ value }) => (!value.studentId || ids.has(value.studentId)) && (!query.tag || value.tags.includes(query.tag)) && (!query.student || value.studentId === query.student))
  const availableTags = [...new Set(projected.notes.flatMap(({ value }) => value.tags))].sort()
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
    <form className="panel space-y-4 self-start" onSubmit={async (event) => {
      event.preventDefault()
      const normalized = [...new Set(tags.split(/[,،]/).map((tag) => tag.trim().replace(/^#/, '').toLocaleLowerCase()).filter(Boolean))]
      if (await save([{ kind: 'note', studentId, date: query.date, tags: normalized, text }])) { setText(''); setTags('') }
    }}><h2 className="title">Leave a note</h2><label>Student<select value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">General note</option>{students.map((student) => <option key={student.studentId} value={student.studentId}>{student.name}</option>)}</select></label><label>Date<input type="date" required value={query.date} onChange={(event) => setQuery({ date: event.target.value })} /></label><label>Tags, separated by commas<input required maxLength={500} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="revision, follow-up / مراجعة" /></label><label>Note<textarea dir="auto" rows={6} required maxLength={10000} value={text} onChange={(event) => setText(event.target.value)} placeholder="What should the next teacher know?" /></label><p className="muted">Plain text or your own structured format. Tags make it easy to find later.</p><button className="primary">Save note</button></form>
    <section className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><h2 className="title">Shared notes</h2><label>Filter tag<select value={query.tag} onChange={(event) => setQuery({ tag: event.target.value })}><option value="">All tags</option>{availableTags.map((tag) => <option key={tag}>{tag}</option>)}</select></label></div>{!notes.length && <Empty text="No notes match this view. Add the first one." />}{notes.toReversed().map(({ event, value }) => <article key={event.id} className="panel"><div className="mb-3 flex flex-wrap justify-between gap-2"><h3 dir="auto" className="font-semibold">{projected.students.find((student) => student.studentId === value.studentId)?.name ?? (value.studentId ? 'Unknown student' : 'General note')}</h3><span className="muted">{value.date} · {event.actor}</span></div><p dir="auto" className="whitespace-pre-wrap break-words leading-relaxed">{value.text}</p><div className="mt-4 flex flex-wrap gap-2">{value.tags.map((tag) => <button key={tag} className="rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-800" onClick={() => setQuery({ tag })}>#{tag}</button>)}</div></article>)}</section>
  </div>
}

function RosterView({ students, save }: { students: Student[]; save: Save }) {
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  return <section className="panel"><h2 className="title mb-5">Your students</h2><form className="mb-6 flex flex-wrap items-end gap-3" onSubmit={async (event) => {
    event.preventDefault()
    if (await save([{ kind: 'student', studentId: crypto.randomUUID(), name, group, active: true }])) setName('')
  }}><label className="grow">Student name<input dir="auto" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /></label><label>Group<input dir="auto" maxLength={100} value={group} onChange={(event) => setGroup(event.target.value)} /></label><button className="primary">Add student</button></form><div className="divide-y divide-slate-100">{students.map((student) => <StudentEditor key={`${student.studentId}:${student.name}:${student.group}:${student.active}`} student={student} save={save} />)}</div>{!students.length && <Empty text="No students yet. Add a name and optional group above." />}</section>
}
function StudentEditor({ student, save }: { student: Student; save: Save }) {
  const [name, setName] = useState(student.name)
  const [group, setGroup] = useState(student.group)
  return <form className="flex flex-wrap items-end gap-3 py-4" onSubmit={(event) => { event.preventDefault(); void save([{ ...student, name, group }]) }}><label className="grow">Name<input dir="auto" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /></label><label>Group<input dir="auto" maxLength={100} value={group} onChange={(event) => setGroup(event.target.value)} /></label><button className="secondary" disabled={name === student.name && group === student.group}>Save changes</button><button className="secondary" type="button" onClick={() => void save([{ ...student, active: !student.active }])}>{student.active ? 'Make inactive' : 'Activate'}</button></form>
}

function Summary({ students, projected }: { students: Student[]; projected: Projection }) {
  const query = useQueryState()
  const ids = new Set(students.map((student) => student.studentId))
  const records = projected.attendance.filter(({ value }) => ids.has(value.studentId) && value.date >= query.from && value.date <= query.to)
  return <section className="panel"><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><h2 className="title">Attendance overview</h2><div className="flex flex-wrap gap-3"><label>From<input type="date" value={query.from} onChange={(event) => setQuery({ from: event.target.value })} /></label><label>To<input type="date" value={query.to} onChange={(event) => setQuery({ to: event.target.value })} /></label></div></div>{query.from > query.to && <p role="alert" className="text-red-700">The end date must be on or after the start date.</p>}<p className="muted mb-5">{records.length} marked student-sessions. Unmarked days are excluded.</p><div className="mb-8 space-y-3" aria-label="Attendance totals">{statuses.map((status) => {
    const count = records.filter(({ value }) => value.status === status).length
    return <div key={status} className="grid grid-cols-[5rem_1fr_3rem] items-center gap-3"><span>{status}</span><meter className="h-6 w-full accent-indigo-700" min={0} max={Math.max(records.length, 1)} value={count} aria-label={`${status}: ${count}`} /><strong className="text-end">{count}</strong></div>
  })}</div><div className="overflow-x-auto"><table className="w-full text-start text-sm"><thead><tr><th className="p-3 text-start">Student</th>{statuses.map((status) => <th key={status} className="p-3">{status}</th>)}<th className="p-3">Notes</th></tr></thead><tbody>{students.map((student) => <tr key={student.studentId} className="border-t border-slate-100"><th dir="auto" className="p-3 text-start font-medium">{student.name}</th>{statuses.map((status) => <td key={status} className="p-3 text-center">{records.filter(({ value }) => value.studentId === student.studentId && value.status === status).length}</td>)}<td className="p-3 text-center">{projected.notes.filter(({ value }) => value.studentId === student.studentId && value.date >= query.from && value.date <= query.to).length}</td></tr>)}</tbody></table></div></section>
}

function History({ projected, students, save }: { projected: Projection; students: Student[]; save: Save }) {
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')
  const query = useQueryState()
  const ids = new Set(students.map((student) => student.studentId))
  const visible = projected.events.filter((event) => {
    const payload = event.payload
    return (!query.q && !query.group) || payload.kind === 'reversal' || !payload.studentId || ids.has(payload.studentId)
  })
  return <section className="panel"><h2 className="title">History & corrections</h2><p className="muted mt-2 mb-6">Undo appends a correction. The original stays in the sheet. Undoing the latest attendance restores the previous status. {projected.duplicates > 0 ? `${projected.duplicates} duplicate deliveries were counted once.` : ''}</p>
    {target && <form className="mb-6 space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4" onSubmit={async (event) => { event.preventDefault(); if (await save([{ kind: 'reversal', targetId: target, reason }])) { setTarget(''); setReason('') } }}><p>Undo record <code className="break-all">{target}</code></p><label>Reason<input required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label><div className="flex gap-3"><button className="primary">Append correction</button><button type="button" className="secondary" onClick={() => setTarget('')}>Cancel</button></div></form>}
    {!visible.length && <Empty text="New attendance, notes and student changes will appear here." />}<ol className="divide-y divide-slate-100">{visible.toReversed().map((event) => <li key={event.id} className="flex flex-wrap items-start justify-between gap-3 py-4"><div className="min-w-0 flex-1"><p dir="auto" className="font-medium">{describeEvent(event, projected.students)}</p><p className="muted mt-1">{event.actor} · {event.receivedAt ? `${event.receivedAt} (SheetDB)` : `${event.clientTime} (device)`}{projected.reversed.has(event.id) ? ' · Undone' : ''}</p><details className="mt-2 text-xs text-slate-500"><summary>Record details</summary><pre className="mt-2 whitespace-pre-wrap break-all">{JSON.stringify(event, null, 2)}</pre></details></div>{event.payload.kind !== 'reversal' && !projected.reversed.has(event.id) && <button className="secondary" onClick={() => setTarget(event.id)}>Undo</button>}</li>)}</ol>
  </section>
}
function describeEvent(event: LedgerEvent, students: Student[]) {
  const value = event.payload
  if (value.kind === 'reversal') return `Correction: ${value.reason}`
  const name = students.find((student) => student.studentId === value.studentId)?.name ?? 'General / unknown student'
  if (value.kind === 'student') return `Student: ${value.name} · ${value.group || 'No group'} · ${value.active ? 'active' : 'inactive'}`
  if (value.kind === 'attendance') return `${name} · ${value.date} · ${value.status}`
  return `${name} · #${value.tags.join(' #')} · ${value.text}`
}
function Empty({ text }: { text: string }) { return <p className="rounded-lg bg-slate-50 p-5 text-slate-600">{text}</p> }
