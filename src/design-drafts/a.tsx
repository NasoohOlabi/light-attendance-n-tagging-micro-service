import { useState } from 'react'
import { WartaqLogo } from '../brand/components'
import { brandAsset } from '../brand/assets'
import { draftStudents, draftStatuses, type DraftProps } from './shared'
import './a.css'

type Stage = 'welcome' | 'notebook' | 'components'

type Tag = 'revision' | 'follow-up'
type Feedback = '' | 'opened' | 'attendance' | 'note' | 'components'

export function CourtyardDraft({ language }: DraftProps) {
  const ar = language === 'ar'
  const t = (arabic: string, english: string) => (ar ? arabic : english)
  const [stage, setStage] = useState<Stage>('welcome')
  const [marks, setMarks] = useState<string[]>(draftStudents.map(() => ''))
  const [message, setMessage] = useState<Feedback>('')
  const [note, setNote] = useState('')
  const [savedNote, setSavedNote] = useState<{ text: string; student: string; tags: Tag[] } | null>(
    null,
  )
  const [studentId, setStudentId] = useState('')
  const [tags, setTags] = useState<Tag[]>([])
  const [date, setDate] = useState('2026-11-13')
  const labels: Record<string, string> = {
    present: t('حاضر', 'Present'),
    early: t('مبكر', 'Early'),
    absent: t('غائب', 'Absent'),
    late: t('متأخر', 'Late'),
    excused: t('معذور', 'Excused'),
  }
  const tagLabel = (tag: Tag) =>
    tag === 'revision' ? t('مراجعة', 'Revision') : t('متابعة', 'Follow-up')
  const noteTags: Tag[] = ['revision', 'follow-up']
  const feedback = {
    opened: t(
      'فتحتَ الدفتر التجريبي. لا يتم تسجيل الدخول أو إرسال البيانات.',
      'Sample notebook opened. No sign-in or data was sent.',
    ),
    attendance: t('حُفظ الحضور في المعاينة فقط.', 'Attendance saved in this preview only.'),
    note: t('حُفظت الملاحظة في المعاينة فقط.', 'Note saved in this preview only.'),
    components: t('هذه عناصر للمعاينة فقط.', 'These elements are for preview only.'),
  }
  const stages: { id: Stage; label: string }[] = [
    { id: 'welcome', label: t('البداية', 'Welcome') },
    { id: 'notebook', label: t('الدفتر', 'Notebook') },
    { id: 'components', label: t('العناصر', 'Components') },
  ]
  const chooseStage = (next: Stage) => {
    setStage(next)
    setMessage('')
  }

  return (
    <div className="wartaq-a" dir={ar ? 'rtl' : 'ltr'}>
      <header className="a-header">
        <button
          className="a-logo"
          onClick={() => chooseStage('welcome')}
          aria-label={t('العودة للبداية', 'Back to welcome')}
        >
          <WartaqLogo />
        </button>
        <nav aria-label={t('أقسام التصميم', 'Design sections')}>
          {stages.map((item) => (
            <button
              key={item.id}
              className={stage === item.id ? 'is-active' : ''}
              aria-current={stage === item.id ? 'page' : undefined}
              onClick={() => chooseStage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <span className="a-preview">{t('معاينة تجريبية', 'Sample preview')}</span>
      </header>

      {stage === 'welcome' && (
        <main className="a-welcome">
          <div className="a-intro">
            <span className="a-kicker">{t('دفتر المعلّم', 'The teacher’s notebook')}</span>
            <h1>{t('لحلقتك مكانٌ يجمعها', 'A place for your halaqa')}</h1>
            <p>
              {t(
                'سجّل الحضور، واترك ملاحظة تنفع المعلّم القادم. كل ما تحتاجه للحلقة في دفتر واحد.',
                'Record attendance and leave a useful note for the next teacher. Keep the essentials together in one notebook.',
              )}
            </p>
            <form
              className="a-signin"
              onSubmit={(event) => {
                event.preventDefault()
                chooseStage('notebook')
                setMessage('opened')
              }}
            >
              <label>
                {t('البريد الإلكتروني', 'Email address')}
                <input
                  type="email"
                  placeholder="name@example.com"
                  autoComplete="email"
                  dir="ltr"
                  inputMode="email"
                  enterKeyHint="go"
                />
              </label>
              <button className="a-button" type="submit">
                {t('استكشف الدفتر التجريبي', 'Explore the sample notebook')}{' '}
                <span aria-hidden="true">{ar ? '←' : '→'}</span>
              </button>
              <small>
                {t(
                  'هذه معاينة للتصميم، وليست صفحة تسجيل دخول فعلية.',
                  'This is a design preview, not a real sign-in.',
                )}
              </small>
            </form>
          </div>
          <div className="a-entrance" aria-hidden="true">
            <div className="a-arch">
              <img src={brandAsset('hero-illustration.svg')} alt="" />
            </div>
            <div className="a-entrance-caption">
              <span>{t('وَارْتَق', 'WARTAQ')}</span>
              <span>{t('للحلقات وأهلها', 'For the halaqa community')}</span>
            </div>
          </div>
        </main>
      )}

      {stage === 'notebook' && (
        <main className="a-workspace">
          <div className="a-workspace-head">
            <div>
              <span className="a-kicker">{t('دفتر الحلقة', 'Halaqa notebook')}</span>
              <h1>{t('أهلاً بك في دفترك', 'Welcome to your notebook')}</h1>
              <p>
                {t(
                  'مساحة هادئة لما يهم في كل لقاء.',
                  'A quiet place for what matters each session.',
                )}
              </p>
            </div>
            <div className="a-date">
              <label>
                {t('تاريخ الجلسة', 'Session date')}
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
            </div>
          </div>
          <div className="a-notice" role="status">
            {(message && feedback[message]) ||
              t(
                'بيانات تجريبية فقط. تبقى التغييرات في هذه المعاينة ولا تُرسل.',
                'Sample data only. Changes stay in this preview and are not sent.',
              )}
          </div>
          <div className="a-columns">
            <section className="a-attendance">
              <div className="a-section-head">
                <div>
                  <span className="a-kicker">{t('الحضور', 'Attendance')}</span>
                  <h2>{t('من حضر اليوم؟', 'Who is here today?')}</h2>
                  <p>
                    {t(
                      'اختر حالة كل طالب، ثم احفظ الحضور.',
                      'Choose a status for each student, then save attendance.',
                    )}
                  </p>
                </div>
                <span className="a-count">
                  {draftStudents.length} {t('طلاب', 'students')}
                </span>
              </div>
              <button
                className="a-text-button"
                onClick={() => {
                  setMarks(draftStudents.map(() => 'present'))
                  setMessage('')
                }}
              >
                {t('تحديد الجميع حاضرين', 'Mark all present')}
              </button>
              <div className="a-rows">
                {draftStudents.map((student, index) => (
                  <div className="a-row" key={student.id}>
                    <div className="a-student">
                      <span className="a-avatar">{index + 1}</span>
                      <span>
                        <strong>{student[language]}</strong>
                        <small>{t('الحلقة الأولى', 'First halaqa')}</small>
                      </span>
                    </div>
                    <label>
                      <span className="a-sr-only">
                        {t('حضور', 'Attendance for')} {student[language]}
                      </span>
                      <select
                        value={marks[index]}
                        onChange={(event) =>
                          setMarks(
                            marks.map((mark, i) => (i === index ? event.target.value : mark)),
                          )
                        }
                      >
                        <option value="">{t('غير محدد', 'Not marked')}</option>
                        {draftStatuses.map((status) => (
                          <option value={status} key={status}>
                            {labels[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ))}
              </div>
              <div className="a-attendance-foot">
                <span>
                  {marks.filter(Boolean).length} / {draftStudents.length}{' '}
                  {t('تم تحديدهم', 'marked')}
                </span>
                <button
                  className="a-button"
                  disabled={!marks.some(Boolean)}
                  onClick={() => setMessage('attendance')}
                >
                  {t('حفظ الحضور', 'Save attendance')}
                </button>
              </div>
            </section>
            <aside className="a-side">
              <section className="a-note">
                <span className="a-kicker">{t('ملاحظات الحلقة', 'Halaqa notes')}</span>
                <h2>{t('اترك ملاحظة', 'Leave a note')}</h2>
                <p>
                  {t('ما الذي ينبغي أن يعرفه المعلّم القادم؟', 'What should the next teacher know?')}
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (note.trim()) {
                      setSavedNote({ text: note.trim(), student: studentId, tags })
                      setNote('')
                      setStudentId('')
                      setTags([])
                      setMessage('note')
                    }
                  }}
                >
                  <label>
                    {t('الطالب', 'Student')}
                    <select
                      value={studentId}
                      onChange={(event) => setStudentId(event.target.value)}
                    >
                      <option value="">{t('ملاحظة عامة', 'General note')}</option>
                      {draftStudents.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student[language]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('الملاحظة', 'Note')}
                    <textarea
                      required
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder={t('اكتب ملاحظتك هنا...', 'Write your note here...')}
                    />
                  </label>
                  <div className="a-tag-label">{t('الوسوم', 'Tags')}</div>
                  <div className="a-tags">
                    {noteTags.map((tag) => (
                      <button
                        type="button"
                        key={tag}
                        aria-pressed={tags.includes(tag)}
                        onClick={() =>
                          setTags(
                            tags.includes(tag)
                              ? tags.filter((item) => item !== tag)
                              : [...tags, tag],
                          )
                        }
                      >
                        {tagLabel(tag)}
                      </button>
                    ))}
                  </div>
                  <button className="a-button a-button-light" type="submit">
                    {t('حفظ الملاحظة', 'Save note')}
                  </button>
                </form>
              </section>
              <section className="a-summary">
                <span className="a-kicker">{t('نظرة سريعة', 'At a glance')}</span>
                <h2>{t('ملخص الجلسة', 'Session summary')}</h2>
                <div>
                  <span>{t('الحاضرون', 'Present')}</span>
                  <strong>{marks.filter((mark) => mark === 'present').length}</strong>
                </div>
                <div>
                  <span>{t('المحددون', 'Marked')}</span>
                  <strong>
                    {marks.filter(Boolean).length} / {draftStudents.length}
                  </strong>
                </div>
                {savedNote && (
                  <div className="a-saved-note">
                    <div>
                      <strong>
                        {draftStudents.find(
                          (student) => String(student.id) === savedNote.student,
                        )?.[language] || t('ملاحظة عامة', 'General note')}
                      </strong>
                      <span>{savedNote.tags.map(tagLabel).join('، ')}</span>
                    </div>
                    <p dir="auto">{savedNote.text}</p>
                  </div>
                )}
              </section>
            </aside>
          </div>
        </main>
      )}

      {stage === 'components' && (
        <main className="a-components">
          <span className="a-kicker">{t('تفاصيل الدفتر', 'Notebook details')}</span>
          <h1>{t('عناصر بسيطة لخدمة الحلقة', 'Simple elements for the halaqa')}</h1>
          <p>
            {t(
              'نفس الأدوات التي يستخدمها المعلّم في الدفتر، بحالات واضحة ومريحة للقراءة.',
              'The same tools a teacher uses in the notebook, with clear, readable states.',
            )}
          </p>
          <div className="a-component-sample">
            <div>
              <h2>{t('سطر الحضور', 'Attendance row')}</h2>
              <p>{t('الاسم والحالة جنباً إلى جنب.', 'A name and a status, side by side.')}</p>
              <div className="a-row">
                <div className="a-student">
                  <span className="a-avatar">1</span>
                  <strong>{draftStudents[0]?.[language]}</strong>
                </div>
                <select aria-label={t('حالة الحضور', 'Attendance status')} defaultValue="present">
                  {draftStatuses.map((status) => (
                    <option key={status} value={status}>
                      {labels[status]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <h2>{t('ملاحظة ووسوم', 'Note and tags')}</h2>
              <label>
                {t('الملاحظة', 'Note')}
                <textarea placeholder={t('اكتب ملاحظة...', 'Write a note...')} />
              </label>
              <div className="a-tags">
                <span>{t('مراجعة', 'Revision')}</span>
                <span>{t('متابعة', 'Follow-up')}</span>
              </div>
              <button className="a-button" onClick={() => setMessage('components')}>
                {t('حفظ الملاحظة', 'Save note')}
              </button>
              {message && <p role="status">{feedback[message]}</p>}
            </div>
          </div>
          <button className="a-text-button" onClick={() => chooseStage('notebook')}>
            {t('انتقل إلى الدفتر', 'Go to the notebook')} {ar ? '←' : '→'}
          </button>
        </main>
      )}
      <footer className="a-footer">
        <span>{t('وَارْتَق · دفتر الحلقة', 'Wartaq · Halaqa notebook')}</span>
        <span>{t('تصميم تجريبي ببيانات غير حقيقية', 'Design preview with sample data')}</span>
      </footer>
    </div>
  )
}
