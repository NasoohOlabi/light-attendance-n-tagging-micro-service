import { useState } from 'react'
import { WartaqIcon, WartaqLogo } from '../brand/components'
import { brandAsset } from '../brand/assets'
import { draftStudents, draftStatuses, type DraftProps } from './shared'
import './b.css'

type Tab = 'attendance' | 'notes' | 'students' | 'summary'
type Status = (typeof draftStatuses)[number]

const copy = {
  ar: {
    sample: 'مساحة تجريبية ببيانات غير حقيقية',
    workspace: 'مساحة المعلم',
    attendance: 'الحضور',
    notes: 'الملاحظات',
    students: 'الطلاب',
    summary: 'الملخص',
    greeting: 'السلام عليكم، أستاذ أحمد',
    intro: 'كل ما تحتاجه لمتابعة حلقتك في مكان واحد.',
    today: 'متابعة الحلقة',
    group: 'حلقة النور',
    date: 'تاريخ الحلقة',
    roster: 'كشف الحضور',
    rosterDesc: 'سجّل حضور الطلاب لهذا اللقاء.',
    search: 'ابحث عن طالب',
    student: 'الطالب',
    status: 'الحالة',
    present: 'حاضر',
    absent: 'غائب',
    early: 'مبكر',
    late: 'متأخر',
    markAll: 'تحديد الجميع حاضرين',
    excused: 'بعذر',
    save: 'حفظ الحضور',
    saved: 'تم حفظ الحضور في هذه المعاينة',
    noResults: 'لا يوجد طلاب بهذا الاسم.',
    overview: 'نظرة على اللقاء',
    presentCount: 'حاضرون',
    absentCount: 'غائبون',
    notesCount: 'ملاحظات',
    notebook: 'دفتر الملاحظات',
    notebookDesc: 'تفاصيل صغيرة تستحق المتابعة.',
    noteLabel: 'ملاحظة جديدة',
    notePlaceholder: 'اكتب ملاحظة عن الحلقة أو طالب…',
    tag: 'التصنيف',
    followup: 'متابعة',
    achievement: 'إنجاز',
    general: 'عام',
    addNote: 'إضافة الملاحظة',
    recent: 'آخر الملاحظات',
    seedNote: 'مراجعة الحفظ مع أحمد في اللقاء القادم.',
    seedTag: 'متابعة',
    sampleNote: 'مثال',
    allStudents: 'طلاب الحلقة',
    studentsDesc: 'قائمة الطلاب في هذه المعاينة.',
    summaryDesc: 'ملخص الحضور والملاحظات لهذا اللقاء.',
    session: 'اللقاء القادم',
    sessionDetail: 'حلقة النور · الأحد، ٤:٠٠ مساءً',
    demo: 'معاينة تفاعلية',
  },
  en: {
    sample: 'Preview space with sample data',
    workspace: 'Teacher workspace',
    attendance: 'Attendance',
    notes: 'Notes',
    students: 'Students',
    summary: 'Summary',
    greeting: 'Peace be upon you, Ahmed',
    intro: 'Everything you need to follow your circle, in one place.',
    today: 'Circle workspace',
    group: 'Al Noor circle',
    date: 'Session date',
    roster: 'Attendance register',
    rosterDesc: 'Record attendance for this session.',
    search: 'Search for a student',
    student: 'Student',
    status: 'Status',
    present: 'Present',
    absent: 'Absent',
    early: 'Early',
    late: 'Late',
    markAll: 'Mark all present',
    excused: 'Excused',
    save: 'Save attendance',
    saved: 'Attendance saved in this preview',
    noResults: 'No students found.',
    overview: 'Session at a glance',
    presentCount: 'Present',
    absentCount: 'Absent',
    notesCount: 'Notes',
    notebook: 'Notes notebook',
    notebookDesc: 'Small details worth following up.',
    noteLabel: 'New note',
    notePlaceholder: 'Write a note about the circle or a student…',
    tag: 'Tag',
    followup: 'Follow up',
    achievement: 'Achievement',
    general: 'General',
    addNote: 'Add note',
    recent: 'Recent notes',
    seedNote: 'Review memorisation with Ahmed at the next session.',
    seedTag: 'Follow up',
    sampleNote: 'Example',
    allStudents: 'Circle students',
    studentsDesc: 'Students in this preview.',
    summaryDesc: 'Attendance and notes for this session.',
    session: 'Next session',
    sessionDetail: 'Al Noor circle · Sunday, 4:00 PM',
    demo: 'Interactive preview',
  },
}

export function DeskDraft({ language }: DraftProps) {
  const t = copy[language]
  const [tab, setTab] = useState<Tab>('attendance')
  const [students, setStudents] = useState(() =>
    draftStudents.map((student) => ({ ...student, status: student.status })),
  )
  const [search, setSearch] = useState('')
  const [date, setDate] = useState('2026-11-13')
  const [saved, setSaved] = useState(false)
  const [note, setNote] = useState('')
  const [tag, setTag] = useState<'followup' | 'achievement' | 'general'>('followup')
  const [notes, setNotes] = useState<
    { text: string; tag: 'followup' | 'achievement' | 'general' }[]
  >([])
  const tabs: Tab[] = ['attendance', 'notes', 'students', 'summary']
  const filtered = students.filter((student) =>
    `${student.ar} ${student.en}`.toLowerCase().includes(search.toLowerCase()),
  )
  const present = students.filter((student) =>
    ['present', 'early', 'late'].includes(student.status),
  ).length
  const absent = students.filter((student) => student.status === 'absent').length

  function changeStatus(id: number, status: Status) {
    setStudents((current) =>
      current.map((student) => (student.id === id ? { ...student, status } : student)),
    )
    setSaved(false)
  }

  function addNote() {
    if (!note.trim()) return
    setNotes((current) => [{ text: note.trim(), tag }, ...current])
    setNote('')
  }

  const metrics = (
    <div className="wb-metrics">
      <div>
        <strong>{present}</strong>
        <span>{t.presentCount}</span>
      </div>
      <div>
        <strong>{absent}</strong>
        <span>{t.absentCount}</span>
      </div>
      <div>
        <strong>{notes.length + 1}</strong>
        <span>{t.notesCount}</span>
      </div>
    </div>
  )

  const notesPanel = (
    <section className="wb-notes" aria-labelledby="wb-notes-title">
      <div className="wb-section-heading">
        <div>
          <h2 id="wb-notes-title">{t.notebook}</h2>
          <p>{t.notebookDesc}</p>
        </div>
        <span className="wb-icon-box">
          <WartaqIcon name="notes" size={20} />
        </span>
      </div>
      <label className="wb-label" htmlFor="wb-note">
        {t.noteLabel}
      </label>
      <textarea
        id="wb-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t.notePlaceholder}
        rows={3}
      />
      <div className="wb-note-actions">
        <label>
          <span className="wb-sr-only">{t.tag}</span>
          <select
            value={tag}
            onChange={(event) => {
              const value = event.target.value
              if (value === 'followup' || value === 'achievement' || value === 'general')
                setTag(value)
            }}
          >
            <option value="followup">{t.followup}</option>
            <option value="achievement">{t.achievement}</option>
            <option value="general">{t.general}</option>
          </select>
        </label>
        <button className="wb-secondary" type="button" onClick={addNote} disabled={!note.trim()}>
          {t.addNote}
        </button>
      </div>
      <h3>{t.recent}</h3>
      <div className="wb-note-list">
        {notes.map((item, index) => (
          <article key={`${index}-${item.text}`}>
            <span>{t[item.tag]}</span>
            <p dir="auto">{item.text}</p>
          </article>
        ))}
        <article>
          <span>
            {t.seedTag} · {t.sampleNote}
          </span>
          <p>{t.seedNote}</p>
        </article>
      </div>
    </section>
  )

  return (
    <div className="wartaq-b" dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language}>
      <aside className="wb-rail">
        <div className="wb-brand">
          <WartaqLogo />
          <span className="wb-brand-subtitle">{t.workspace}</span>
        </div>
        <nav aria-label={t.workspace}>
          {tabs.map((item) => (
            <button
              type="button"
              key={item}
              className={tab === item ? 'is-active' : ''}
              aria-current={tab === item ? 'page' : undefined}
              onClick={() => setTab(item)}
            >
              <WartaqIcon name={item} size={20} />
              <span>{t[item]}</span>
            </button>
          ))}
        </nav>
        <div className="wb-rail-foot">
          <span className="wb-avatar">أ</span>
          <div>
            <strong>{language === 'ar' ? 'أ. أحمد' : 'Ahmed'}</strong>
            <small>{t.demo}</small>
          </div>
        </div>
      </aside>
      <main className="wb-main">
        <div className="wb-topline">
          <span>
            {t.today} <span aria-hidden="true">/</span> {t[tab]}
          </span>
          <span className="wb-sample">
            <span />
            {t.sample}
          </span>
        </div>
        <header className="wb-welcome">
          <div>
            <p>{t.group}</p>
            <h1>{t.greeting}</h1>
            <span>{t.intro}</span>
          </div>
          <div className="wb-date">
            <label htmlFor="wb-date">{t.date}</label>
            <input
              id="wb-date"
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value)
                setSaved(false)
              }}
            />
          </div>
        </header>
        <div className="wb-content">
          <div className="wb-primary">
            {tab === 'attendance' && (
              <section className="wb-register">
                <div className="wb-section-heading">
                  <div>
                    <h2>{t.roster}</h2>
                    <p>{t.rosterDesc}</p>
                  </div>
                  <span className="wb-count">
                    {students.length} {t.students}
                  </span>
                </div>
                <button
                  className="wb-mark-all"
                  type="button"
                  onClick={() => {
                    setStudents((current) =>
                      current.map((student) => ({ ...student, status: 'present' })),
                    )
                    setSaved(false)
                  }}
                >
                  {t.markAll}
                </button>
                <div className="wb-search">
                  <WartaqIcon name="search" size={19} />
                  <input
                    type="search"
                    aria-label={t.search}
                    placeholder={t.search}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <div className="wb-table-head">
                  <span>{t.student}</span>
                  <span>{t.status}</span>
                </div>
                <div className="wb-rows">
                  {filtered.map((student) => (
                    <div className="wb-row" key={student.id}>
                      <div className="wb-person">
                        <span className="wb-person-avatar">{student[language].slice(0, 1)}</span>
                        <bdi>{student[language]}</bdi>
                      </div>
                      <label>
                        <span className="wb-sr-only">
                          {t.status} — {student[language]}
                        </span>
                        <select
                          value={student.status}
                          onChange={(event) => {
                            const value = event.target.value
                            if (
                              value === 'present' ||
                              value === 'early' ||
                              value === 'late' ||
                              value === 'absent' ||
                              value === 'excused'
                            )
                              changeStatus(student.id, value)
                          }}
                        >
                          {draftStatuses.map((status) => (
                            <option key={status} value={status}>
                              {t[status]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ))}
                  {filtered.length === 0 && <p className="wb-empty">{t.noResults}</p>}
                </div>
                <div className="wb-save">
                  <button className="wb-button" type="button" onClick={() => setSaved(true)}>
                    <WartaqIcon name="check" size={18} />
                    {t.save}
                  </button>
                  <span role="status">{saved ? t.saved : ''}</span>
                </div>
              </section>
            )}
            {tab === 'notes' && notesPanel}
            {tab === 'students' && (
              <section className="wb-register">
                <div className="wb-section-heading">
                  <div>
                    <h2>{t.allStudents}</h2>
                    <p>{t.studentsDesc}</p>
                  </div>
                  <span className="wb-count">{students.length}</span>
                </div>
                <div className="wb-rows">
                  {students.map((student) => (
                    <div className="wb-row" key={student.id}>
                      <div className="wb-person">
                        <span className="wb-person-avatar">{student[language].slice(0, 1)}</span>
                        <bdi>{student[language]}</bdi>
                      </div>
                      <span className="wb-status">{t[student.status]}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {tab === 'summary' && (
              <section className="wb-register">
                <div className="wb-section-heading">
                  <div>
                    <h2>{t.overview}</h2>
                    <p>{t.summaryDesc}</p>
                  </div>
                </div>
                {metrics}
                <div className="wb-summary-line">
                  <span>{t.group}</span>
                  <strong>{date}</strong>
                </div>
              </section>
            )}
            <div className="wb-next">
              <img className="wb-next-arch" src={brandAsset('arch.svg')} alt="" />
              <div className="wb-next-icon">
                <WartaqIcon name="book" size={24} />
              </div>
              <div>
                <small>{t.session}</small>
                <strong>{t.sessionDetail}</strong>
              </div>
            </div>
          </div>
          <aside className="wb-side">
            <section className="wb-overview">
              <h2>{t.overview}</h2>
              {metrics}
            </section>
            {tab !== 'notes' && notesPanel}
          </aside>
        </div>
      </main>
    </div>
  )
}
