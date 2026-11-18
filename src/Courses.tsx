import { RowActions } from './RowActions'
import { LevelInput } from './level'
import { formatLevel } from './levelFormat'
import { TableControls, TableHeader, useDataTable } from './DataTable'
import { useEffect, useRef, useState } from 'react'
import { Download, Save } from 'lucide-react'
import {
  accountProfileLabel,
  neonAdminBoardSchema,
  type Course,
  type Enrollment,
} from '../shared/neon'
import { projectEvents, type LedgerEvent } from '../shared/ledger'
import { courseAttendance, savedGradeResult } from '../shared/courseGrading'
import { downloadCourseWorkbook } from './courseExport'
import { request } from './neon'
import { useLanguage } from './i18n'
import { setQuery, useQueryState } from './queryState'
import { rankStudents } from './studentSearch'

type Board = ReturnType<typeof neonAdminBoardSchema.parse>

type Draft = { id: string; level: string; teacherId: string }

export function Courses({
  userId,
  courses,
  enrollments,
  exportEnrollments,
  events,
  refresh,
  defaultCourse,
  chooseDefault,
}: {
  userId: string
  courses: Course[]
  enrollments: Enrollment[]
  exportEnrollments: Enrollment[]
  events: LedgerEvent[]
  refresh: () => Promise<void>
  defaultCourse: string
  chooseDefault: (course: string) => void
}) {
  const { language } = useLanguage()
  const ar = language === 'ar'
  const query = useQueryState()
  const course = courses.find((item) => item.id === query.course)
  const [board, setBoard] = useState<Board | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [newCourseId, setNewCourseId] = useState(() => crypto.randomUUID())
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let cancelled = false
    request('/api/admin', userId)
      .then((value) => {
        if (!cancelled) setBoard(neonAdminBoardSchema.parse(value))
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Load failed')
      })
    return () => {
      cancelled = true
    }
  }, [userId])
  useEffect(() => {
    setName(course?.name ?? '')
  }, [course?.id, course?.name, query.courseView])
  async function submit(path: string, body: unknown) {
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      await request(path, userId, body)
      if (path === '/api/admin/courses/status') {
        setBoard(neonAdminBoardSchema.parse(await request('/api/admin', userId)))
      }
      await refresh()
      setSaved(true)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed')
      return false
    } finally {
      setBusy(false)
    }
  }
  const go = (courseView: string, courseId = query.course) =>
    setQuery({ courseView, course: courseId, q: '' }, true)
  const courseEntries = enrollments.filter((item) => item.courseId === query.course)
  const rankedIds = board
    ? rankStudents(
        board.students.map((student) => ({ ...student, kind: 'student' })),
        query.q,
      ).map((student) => student.studentId)
    : []
  const matching = rankedIds.flatMap(
    (id) => board?.students.filter((student) => student.studentId === id) ?? [],
  )
  const courseTable = useDataTable('courses', courses, [
    { id: 'name', label: ar ? 'الدورة' : 'Course', value: (item) => item.name },
    {
      id: 'status',
      choices: ar ? ['مفتوحة', 'مغلقة'] : ['Open', 'Closed'],
      label: ar ? 'الحالة' : 'Status',
      value: (item) => (item.open ? (ar ? 'مفتوحة' : 'Open') : ar ? 'مغلقة' : 'Closed'),
    },
  ])
  const membershipTable = useDataTable('course-students', matching, [
    { id: 'first', label: ar ? 'الاسم الأول' : 'First name', value: (s) => s.firstName },
    { id: 'last', label: ar ? 'اسم العائلة' : 'Last name', value: (s) => s.lastName },
    {
      id: 'roster-level',
      label: ar ? 'مستوى القائمة' : 'Roster level',
      value: (s) => formatLevel(s.group),
    },
    {
      id: 'course-level',
      label: ar ? 'مستوى الدورة' : 'Course level',
      value: (s) =>
        formatLevel(
          drafts[`${course?.id}:${s.studentId}`]?.level ??
            courseEntries.find((entry) => entry.studentId === s.studentId)?.level ??
            s.group,
        ),
    },
    {
      id: 'teacher',
      label: ar ? '\u0627\u0644\u0645\u0639\u0644\u0645' : 'Teacher',
      value: (s) => {
        const teacherId =
          drafts[`${course?.id}:${s.studentId}`]?.teacherId ??
          courseEntries.find((entry) => entry.studentId === s.studentId)?.teacherId
        return board?.teachers.find((teacher) => teacher.teacherId === teacherId)?.name ?? ''
      },
    },
    {
      id: 'enrolled',
      choices: ar ? ['نعم', 'لا'] : ['Yes', 'No'],
      label: ar ? 'مسجل' : 'Enrolled',
      value: (s) =>
        courseEntries.find((entry) => entry.studentId === s.studentId)?.active
          ? ar
            ? 'نعم'
            : 'Yes'
          : ar
            ? 'لا'
            : 'No',
    },
    {
      id: 'handbook',
      choices: ar ? ['نعم', 'لا'] : ['Yes', 'No'],
      label: ar ? 'استلم الكتاب' : 'Handbook received',
      value: (s) =>
        courseEntries.find((entry) => entry.studentId === s.studentId)?.handbookReceived
          ? ar
            ? 'نعم'
            : 'Yes'
          : ar
            ? 'لا'
            : 'No',
    },
  ])
  return (
    <section className="panel space-y-5">
      {!query.courseView && (
        <header className="flex items-center justify-between gap-2">
          <h1 className="title">{ar ? 'الدورات' : 'Courses'}</h1>
          {courses.length > 0 && (
            <div className="flex shrink-0 items-center gap-2">
              <TableControls model={courseTable} />
            </div>
          )}
        </header>
      )}
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">{ar ? 'تم الحفظ' : 'Saved'}</p>}
      {!query.courseView && (
        <>
          <button
            className="primary"
            onClick={() => {
              setNewCourseId(crypto.randomUUID())
              go('create', '')
            }}
          >
            {ar ? 'إنشاء دورة' : 'Create course'}
          </button>
          {!courses.length && <p>{ar ? 'لا توجد دورات بعد.' : 'No courses yet.'}</p>}
          {courses.length > 0 && (
            <div
              className="role-table-scroll"
              role="region"
              aria-label={ar ? 'قائمة الدورات' : 'Course list'}
              tabIndex={0}
            >
              <table className="role-table course-list-table w-full table-fixed" role="table">
                <TableHeader model={courseTable} actions showControls={false} />
                <tbody role="rowgroup">
                  {courseTable.rows.map((item) => (
                    <tr key={item.id} role="row">
                      <td role="cell">
                        <bdi>{item.name}</bdi>
                        {item.id === defaultCourse && (
                          <span className="course-current">
                            {ar ? 'الدورة الحالية' : 'Current course'}
                          </span>
                        )}
                      </td>
                      <td role="cell">
                        {item.open ? (ar ? 'مفتوحة' : 'Open') : ar ? 'مغلقة' : 'Closed'}
                      </td>
                      <td role="cell">
                        <RowActions
                          name={item.name}
                          ar={ar}
                          actions={[
                            ...(item.id === defaultCourse
                              ? []
                              : [
                                  {
                                    label: ar ? 'تعيين كدورة حالية' : 'Make current',
                                    disabled: !item.open,
                                    onClick: () => chooseDefault(item.id),
                                  },
                                ]),
                            {
                              label: ar ? 'إدارة الطلاب' : 'Manage students',
                              onClick: () => go('students', item.id),
                            },
                            {
                              label: ar ? 'الدرجات' : 'Grades',
                              onClick: () => go('grades', item.id),
                            },
                            {
                              label: ar ? 'السجل' : 'History',
                              onClick: () =>
                                setQuery(
                                  {
                                    view: 'history',
                                    tab: '',
                                    course: item.id,
                                    courseView: '',
                                    q: '',
                                    group: '',
                                    student: '',
                                  },
                                  true,
                                ),
                            },
                            { label: ar ? 'تعديل' : 'Edit', onClick: () => go('edit', item.id) },
                            {
                              label: item.open
                                ? ar
                                  ? 'إغلاق الدورة'
                                  : 'Close course'
                                : ar
                                  ? 'إعادة فتح الدورة'
                                  : 'Reopen course',
                              disabled: busy,
                              onClick: () =>
                                void submit('/api/admin/courses/status', {
                                  id: item.id,
                                  open: !item.open,
                                }),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {(query.courseView === 'create' || (query.courseView === 'edit' && course)) && (
        <>
          <button className="secondary" onClick={() => go('', '')}>
            {ar ? 'العودة للدورات' : 'Back to courses'}
          </button>
          <h1 className="title">
            {query.courseView === 'create'
              ? ar
                ? 'إنشاء دورة'
                : 'Create course'
              : ar
                ? 'تعديل الدورة'
                : 'Edit course'}
          </h1>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              void submit('/api/admin/courses', { id: course?.id ?? newCourseId, name }).then(
                (ok) => {
                  if (ok) go('', '')
                },
              )
            }}
          >
            <label>
              {ar ? 'اسم الدورة' : 'Course name'}
              <input
                required
                maxLength={200}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              {ar ? 'حفظ الدورة' : 'Save course'}
            </button>
          </form>
        </>
      )}
      {course && (query.courseView === 'students' || query.courseView === 'grades') && (
        <>
          {query.courseView === 'students' && (
            <>
              <button className="secondary" onClick={() => go('', '')}>
                {ar ? 'العودة للدورات' : 'Back to courses'}
              </button>
              <h1 className="title">
                {course.name} — {ar ? 'إدارة الطلاب' : 'Manage students'}
              </h1>
            </>
          )}
          {query.courseView === 'grades' && !board && (
            <h1 className="title">
              {course.name} — {ar ? 'الدرجات' : 'Grades'}
            </h1>
          )}
          {query.courseView === 'students' && (
            <>
              <button
                className="primary"
                onClick={() => setQuery({ view: 'add-student', courseView: 'students' }, true)}
              >
                {ar ? 'إضافة طالب جديد إلى هذه الدورة' : 'Add new student to this course'}
              </button>
              <label>
                {ar ? 'البحث عن طالب' : 'Find a student'}
                <input
                  type="search"
                  value={query.q}
                  onChange={(event) => setQuery({ q: event.target.value })}
                  dir="auto"
                />
              </label>
              <div
                className="role-table-scroll"
                role="region"
                aria-label={ar ? 'طلاب الدورة' : 'Course students'}
                tabIndex={0}
              >
                <table className="mobile-record-table role-table course-students-table">
                  <TableHeader model={membershipTable} actions />
                  <tbody>
                    {membershipTable.rows.map((student) => {
                      const entry = courseEntries.find(
                        (item) => item.studentId === student.studentId,
                      )
                      const draftKey = `${course.id}:${student.studentId}`
                      const draft = drafts[draftKey] ?? {
                        id: entry?.id ?? '',
                        level: entry ? entry.level : student.group,
                        teacherId: entry?.teacherId ?? '',
                      }
                      const saveMembership = (active: boolean) => {
                        const id = draft.id || crypto.randomUUID()
                        setDrafts((current) => ({
                          ...current,
                          [draftKey]: { ...draft, id },
                        }))
                        void submit('/api/admin/enrollments/membership', {
                          id,
                          courseId: course.id,
                          studentId: student.studentId,
                          level: draft.level,
                          teacherId: draft.teacherId || null,
                          active,
                        })
                      }
                      return (
                        <tr key={student.studentId}>
                          <td dir="auto" data-label={ar ? 'الاسم الأول' : 'First name'}>
                            {student.firstName}
                          </td>
                          <td dir="auto" data-label={ar ? 'اسم العائلة' : 'Last name'}>
                            {student.lastName || '—'}
                          </td>
                          <td data-label={ar ? 'مستوى القائمة' : 'Roster level'}>
                            <bdi>{formatLevel(student.group) || '—'}</bdi>
                          </td>
                          <td data-label={ar ? 'مستوى الدورة' : 'Course level'}>
                            <LevelInput
                              aria-label={`${ar ? 'مستوى الدورة' : 'Course level'}: ${student.firstName} ${student.lastName}`}
                              maxLength={200}
                              dir="auto"
                              value={draft.level}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [draftKey]: { ...draft, level: event.target.value },
                                }))
                              }
                            />
                          </td>
                          <td data-label={ar ? '\u0627\u0644\u0645\u0639\u0644\u0645' : 'Teacher'}>
                            <select
                              aria-label={`${ar ? '\u0627\u0644\u0645\u0639\u0644\u0645' : 'Teacher'}: ${student.firstName} ${student.lastName}`}
                              value={draft.teacherId}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [draftKey]: { ...draft, teacherId: event.target.value },
                                }))
                              }
                            >
                              <option value="">
                                {ar ? '\u0628\u0644\u0627 \u0645\u0639\u0644\u0645' : 'No teacher'}
                              </option>
                              {board?.teachers.map((teacher) => (
                                <option key={teacher.teacherId} value={teacher.teacherId}>
                                  {teacher.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td data-label={ar ? 'مسجل' : 'Enrolled'}>
                            <input
                              type="checkbox"
                              role="switch"
                              aria-label={`${ar ? 'مسجل' : 'Enrolled'}: ${student.firstName} ${student.lastName}`}
                              checked={entry?.active ?? false}
                              disabled={busy}
                              onChange={(event) => saveMembership(event.target.checked)}
                            />
                          </td>
                          <td data-label={ar ? 'استلم الكتاب' : 'Handbook received'}>
                            <input
                              type="checkbox"
                              className="h-11 w-11"
                              aria-label={`${ar ? 'استلم الكتاب' : 'Handbook received'}: ${student.firstName} ${student.lastName}`}
                              checked={entry?.handbookReceived ?? false}
                              disabled={busy || !entry}
                              onChange={(event) =>
                                entry &&
                                void submit('/api/admin/enrollments/handbook', {
                                  id: entry.id,
                                  handbookReceived: event.target.checked,
                                })
                              }
                            />
                          </td>
                          <td data-label={ar ? 'الإجراءات' : 'Actions'}>
                            <button
                              className="secondary"
                              disabled={busy || !entry}
                              onClick={() => saveMembership(entry?.active ?? false)}
                            >
                              {ar ? 'حفظ المستوى والمعلم' : 'Save level and teacher'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {query.courseView === 'grades' && board && (
            <GradePage
              key={course.id}
              course={course}
              entries={courseEntries}
              exportEntries={exportEnrollments.filter((item) => item.courseId === course.id)}
              students={board.students}
              accounts={board.accounts}
              events={events}
              busy={busy}
              ar={ar}
              save={submit}
            />
          )}
        </>
      )}
    </section>
  )
}

function GradePage({
  course,
  entries,
  exportEntries,
  students,
  accounts,
  events,
  busy,
  ar,
  save,
}: {
  course: Course
  entries: Enrollment[]
  exportEntries: Enrollment[]
  students: Board['students']
  accounts: Board['accounts']
  events: LedgerEvent[]
  busy: boolean
  ar: boolean
  save: (path: string, body: unknown) => Promise<boolean>
}) {
  const [drafts, setDrafts] = useState<
    Record<string, { practical: string; theory: string; notes: string }>
  >({})
  const [decisionEntry, setDecisionEntry] = useState<string | null>(null)
  const [decisionError, setDecisionError] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (decisionEntry) dialogRef.current?.showModal()
  }, [decisionEntry])
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(false)
  const [decisions, setDecisions] = useState<
    Record<string, { requestId: string; result: 'pass' | 'fail' | 'calculated'; note: string }>
  >({})
  const [settings, setSettings] = useState({
    attendanceMinimum: String(course.attendanceMinimum),
    practicalMinimum: String(course.practicalMinimum),
    theoryMinimum: String(course.theoryMinimum),
  })
  const settingsDirty =
    Number(settings.attendanceMinimum) !== course.attendanceMinimum ||
    Number(settings.practicalMinimum) !== course.practicalMinimum ||
    Number(settings.theoryMinimum) !== course.theoryMinimum ||
    Object.values(settings).some((value) => value === '')
  const gradeDirty = entries.some((entry) => {
    const draft = drafts[entry.id]
    return (
      draft &&
      (draft.practical !== (entry.practical?.toString() ?? '') ||
        draft.theory !== (entry.theory?.toString() ?? '') ||
        draft.notes !== entry.notes)
    )
  })
  const attendance = projectEvents(events).attendance
  const gradeResult = (entry: Enrollment, ratio: number | null) => {
    const draft = drafts[entry.id]
    if (
      settingsDirty ||
      (draft &&
        (draft.practical !== (entry.practical?.toString() ?? '') ||
          draft.theory !== (entry.theory?.toString() ?? '') ||
          draft.notes !== entry.notes))
    )
      return 'pending'
    return savedGradeResult(course, entry, ratio)
  }
  const attendanceRatio = (entry: Enrollment) => courseAttendance(attendance, entry).ratio
  const resultLabel = (result: string) =>
    result === 'pending'
      ? ar
        ? 'قيد الانتظار'
        : 'Pending'
      : result === 'pass'
        ? ar
          ? 'ناجح'
          : 'Pass'
        : ar
          ? 'راسب'
          : 'Fail'
  const gradeTable = useDataTable(
    'grades',
    entries,
    [
      {
        id: 'first',
        label: ar ? 'الاسم الأول' : 'First name',
        value: (entry) => students.find((s) => s.studentId === entry.studentId)?.firstName,
      },
      {
        id: 'last',
        label: ar ? 'اسم العائلة' : 'Last name',
        value: (entry) => students.find((s) => s.studentId === entry.studentId)?.lastName,
      },
      {
        id: 'level',
        label: ar ? 'مستوى الدورة' : 'Course level',
        value: (entry) => formatLevel(entry.level),
      },
      {
        id: 'attendance',
        label: ar ? 'الحضور' : 'Attendance',
        value: attendanceRatio,
        filterText: (entry) => {
          const ratio = attendanceRatio(entry)
          return ratio === null ? (ar ? 'غير متاح' : 'Unavailable') : `${ratio.toFixed(1)}%`
        },
      },
      ...(['theory', 'practical'] as const).map((key) => ({
        id: key,
        label: key === 'practical' ? (ar ? 'عملي' : 'Practical') : ar ? 'نظري' : 'Theory',
        value: (entry: Enrollment) => {
          const value = drafts[entry.id]?.[key] ?? entry[key]
          return value == null || value === '' ? null : Number(value)
        },
      })),
      {
        id: 'notes',
        label: ar ? 'ملاحظات' : 'Notes',
        value: (entry) => drafts[entry.id]?.notes ?? entry.notes,
      },
      {
        id: 'result',
        choices: ar ? ['قيد الانتظار', 'ناجح', 'راسب'] : ['Pending', 'Pass', 'Fail'],
        label: ar ? 'النتيجة' : 'Result',
        value: (entry) => {
          const last = entry.gradeDecisions.at(-1)
          const result =
            last && last.result !== 'calculated'
              ? last.result
              : gradeResult(entry, attendanceRatio(entry))
          const average =
            entry.practical === null || entry.theory === null
              ? -1
              : (entry.practical + entry.theory) / 2
          // Include the missing-score sentinel (-1) in each separate status band.
          return (result === 'pass' ? 204 : result === 'fail' ? 102 : 0) + average
        },
      },
    ],
    false,
  )
  return (
    <>
      <div className="grade-title-bar">
        <h1 className="title">
          {course.name} — {ar ? 'الدرجات' : 'Grades'}
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="secondary flex items-center gap-2"
            aria-label={ar ? 'تصدير Excel' : 'Export Excel'}
            title={ar ? 'تصدير Excel' : 'Export Excel'}
            disabled={busy || exporting || settingsDirty || !!gradeDirty}
            onClick={() => {
              setExporting(true)
              setExportError(false)
              void downloadCourseWorkbook({
                course,
                entries: exportEntries,
                students,
                attendance,
                ar,
              })
                .catch(() => setExportError(true))
                .finally(() => setExporting(false))
            }}
          >
            <Download size={20} aria-hidden="true" />
            <span className="hidden sm:inline">{ar ? 'تصدير Excel' : 'Export Excel'}</span>
          </button>
          <TableControls model={gradeTable} />
        </div>
      </div>
      {exportError && <p role="alert">{ar ? 'تعذر تصدير الملف' : 'Could not export file'}</p>}
      <form
        className="flex flex-wrap items-end justify-end gap-3"
        dir="ltr"
        onSubmit={(event) => {
          event.preventDefault()
          void save('/api/admin/courses/settings', {
            id: course.id,
            attendanceMinimum: Number(settings.attendanceMinimum),
            practicalMinimum: Number(settings.practicalMinimum),
            theoryMinimum: Number(settings.theoryMinimum),
          })
        }}
      >
        {(
          [
            ['attendanceMinimum', ar ? 'الحد الأدنى للحضور %' : 'Minimum attendance %'],
            ['practicalMinimum', ar ? 'درجة النجاح العملي' : 'Practical passing grade'],
            ['theoryMinimum', ar ? 'درجة النجاح النظري' : 'Theory passing grade'],
          ] as const
        ).map(([key, label]) => (
          <label className="w-full max-w-48" key={key} dir={ar ? 'rtl' : 'ltr'}>
            {label}
            <input
              type="number"
              disabled={busy}
              min="0"
              max="100"
              step="any"
              required
              value={settings[key]}
              onChange={(event) =>
                setSettings((current) => ({ ...current, [key]: event.target.value }))
              }
            />
          </label>
        ))}
        <button className="secondary" disabled={busy || !settingsDirty}>
          {ar ? 'حفظ الحدود' : 'Save thresholds'}
        </button>
      </form>
      <p>
        {ar
          ? 'الحضور = الحاضر / (الحاضر + الغائب + المعذور). الأيام غير المسجلة مستبعدة.'
          : 'Attendance = Present / (Present + Absent + Excused). Unmarked days are excluded.'}
      </p>
      <div
        className="role-table-scroll grade-table-scroll"
        role="region"
        aria-label={ar ? 'درجات الدورة' : 'Course grades'}
        tabIndex={0}
      >
        <table className="mobile-record-table role-table min-w-[68rem] [&_th]:whitespace-nowrap [&_input]:w-24 [&_td]:align-top">
          <TableHeader model={gradeTable} actions showControls={false} />
          <tbody>
            {gradeTable.rows.map((entry) => {
              const student = students.find((item) => item.studentId === entry.studentId)
              if (!student) return null
              const draft = drafts[entry.id] ?? {
                practical: entry.practical?.toString() ?? '',
                theory: entry.theory?.toString() ?? '',
                notes: entry.notes,
              }
              const ratio = attendanceRatio(entry)
              const result = gradeResult(entry, ratio)
              const lastDecision = entry.gradeDecisions.at(-1)
              const effective =
                lastDecision && lastDecision.result !== 'calculated' ? lastDecision.result : result
              const decisionDraft = decisions[entry.id] ?? {
                requestId: crypto.randomUUID(),
                result: 'pass' as const,
                note: '',
              }
              const formId = `grades-${entry.id}`
              return (
                <tr key={entry.id} className={`grade-row-${effective}`}>
                  <td dir="auto" data-label={ar ? 'الاسم الأول' : 'First name'}>
                    {student.firstName}
                  </td>
                  <td dir="auto" data-label={ar ? 'اسم العائلة' : 'Last name'}>
                    {student.lastName || '—'}
                  </td>
                  <td data-label={ar ? 'مستوى الدورة' : 'Course level'}>
                    <bdi>{formatLevel(entry.level) || '—'}</bdi>
                  </td>
                  <td data-label={ar ? 'الحضور' : 'Attendance'}>
                    <span
                      className={
                        !settingsDirty && ratio !== null
                          ? ratio >= course.attendanceMinimum
                            ? 'grade-pass'
                            : 'grade-fail'
                          : undefined
                      }
                    >
                      {ratio === null ? (ar ? 'غير متاح' : 'Unavailable') : `${ratio.toFixed(1)}%`}
                    </span>
                  </td>
                  {(['theory', 'practical'] as const).map((key) => (
                    <td
                      key={key}
                      data-label={
                        key === 'practical' ? (ar ? 'عملي' : 'Practical') : ar ? 'نظري' : 'Theory'
                      }
                    >
                      <input
                        form={formId}
                        className={
                          !settingsDirty &&
                          entry[key] !== null &&
                          draft[key] === entry[key].toString()
                            ? entry[key] >=
                              (key === 'practical' ? course.practicalMinimum : course.theoryMinimum)
                              ? 'grade-pass'
                              : 'grade-fail'
                            : undefined
                        }
                        aria-label={`${key === 'practical' ? (ar ? 'عملي' : 'Practical') : ar ? 'نظري' : 'Theory'}: ${student.firstName} ${student.lastName}`}
                        type="number"
                        disabled={busy}
                        min="0"
                        max="100"
                        step="any"
                        value={draft[key]}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [entry.id]: { ...draft, [key]: event.target.value },
                          }))
                        }
                      />
                    </td>
                  ))}
                  <td className="grade-notes" data-label={ar ? 'ملاحظات' : 'Notes'}>
                    <textarea
                      form={formId}
                      className="resize-y min-[1025px]:min-w-48"
                      aria-label={`${ar ? 'ملاحظات' : 'Notes'}: ${student.firstName} ${student.lastName}`}
                      disabled={busy}
                      value={draft.notes}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [entry.id]: { ...draft, notes: event.target.value },
                        }))
                      }
                    />
                  </td>
                  <td data-label={ar ? 'النتيجة' : 'Result'}>
                    <div>
                      {lastDecision && lastDecision.result !== 'calculated' && (
                        <>{ar ? 'المحسوبة' : 'Calculated'}: </>
                      )}
                      <span className={result === 'pending' ? undefined : `grade-${result}`}>
                        {resultLabel(result)}
                      </span>
                    </div>
                    {lastDecision && lastDecision.result !== 'calculated' && (
                      <div>
                        {ar ? 'النهائية' : 'Effective'}:{' '}
                        <span className={`grade-${effective}`}>{resultLabel(effective)}</span>
                      </div>
                    )}
                  </td>
                  <td className="grade-actions" data-label={ar ? 'الإجراءات' : 'Actions'}>
                    <form
                      id={formId}
                      onSubmit={(event) => {
                        event.preventDefault()
                        void save('/api/admin/enrollments/grades', {
                          id: entry.id,
                          practical: draft.practical === '' ? null : Number(draft.practical),
                          theory: draft.theory === '' ? null : Number(draft.theory),
                          notes: draft.notes,
                        }).then((ok) => {
                          if (ok)
                            setDrafts((current) => {
                              const next = { ...current }
                              delete next[entry.id]
                              return next
                            })
                        })
                      }}
                    >
                      <button
                        className="icon-button gap-2"
                        disabled={busy}
                        aria-label={ar ? 'حفظ الدرجات' : 'Save grades'}
                        title={ar ? 'حفظ الدرجات' : 'Save grades'}
                      >
                        <Save size={20} className="shrink-0" aria-hidden="true" />
                        <span>{ar ? 'حفظ الدرجات' : 'Save grades'}</span>
                      </button>
                    </form>
                    <RowActions
                      name={`${student.firstName} ${student.lastName}`}
                      ar={ar}
                      actions={[
                        {
                          label: ar ? 'تعديل النتيجة' : 'Override result',
                          disabled: busy,
                          onClick: () => {
                            setDecisionError(false)
                            setDecisionEntry(entry.id)
                          },
                        },
                      ]}
                    />
                    {decisionEntry === entry.id && (
                      <dialog
                        ref={dialogRef}
                        className="grade-dialog"
                        aria-labelledby={`decision-title-${entry.id}`}
                        onClose={() => setDecisionEntry(null)}
                        onCancel={(event) => {
                          if (busy) event.preventDefault()
                        }}
                      >
                        <h2 id={`decision-title-${entry.id}`}>
                          {ar ? 'تعديل النتيجة' : 'Override result'}: {student.firstName}{' '}
                          {student.lastName}
                        </h2>
                        <form
                          onSubmit={(event) => {
                            event.preventDefault()
                            setDecisions((current) => ({ ...current, [entry.id]: decisionDraft }))
                            void save('/api/admin/enrollments/decision', {
                              id: entry.id,
                              ...decisionDraft,
                            }).then((ok) => {
                              if (!ok) {
                                setDecisionError(true)
                                return
                              }
                              dialogRef.current?.close()
                              setDecisions((current) => {
                                const next = { ...current }
                                delete next[entry.id]
                                return next
                              })
                            })
                          }}
                        >
                          <label>
                            {ar ? 'القرار' : 'Decision'}
                            <select
                              value={decisionDraft.result}
                              disabled={busy}
                              onChange={(event) => {
                                const result = event.target.value
                                if (
                                  result === 'pass' ||
                                  result === 'fail' ||
                                  result === 'calculated'
                                )
                                  setDecisions((current) => ({
                                    ...current,
                                    [entry.id]: { ...decisionDraft, result },
                                  }))
                              }}
                            >
                              <option value="pass">{ar ? 'ناجح' : 'Pass'}</option>
                              <option value="fail">{ar ? 'راسب' : 'Fail'}</option>
                              <option value="calculated">
                                {ar ? 'استعادة النتيجة المحسوبة' : 'Restore calculated result'}
                              </option>
                            </select>
                          </label>
                          <label>
                            {ar ? 'سبب القرار (مطلوب)' : 'Decision note (required)'}
                            <textarea
                              required
                              maxLength={2000}
                              disabled={busy}
                              value={decisionDraft.note}
                              onChange={(event) =>
                                setDecisions((current) => ({
                                  ...current,
                                  [entry.id]: { ...decisionDraft, note: event.target.value },
                                }))
                              }
                            />
                          </label>
                          {decisionError && (
                            <p role="alert">
                              {ar
                                ? 'تعذر حفظ القرار. حاول مرة أخرى.'
                                : 'Could not save decision. Try again.'}
                            </p>
                          )}
                          <button
                            className="secondary"
                            disabled={busy || !decisionDraft.note.trim()}
                          >
                            {ar ? 'حفظ القرار' : 'Save decision'}
                          </button>
                        </form>
                        {entry.gradeDecisions.length > 0 && (
                          <details className="decision-history">
                            <summary>
                              {ar ? 'سجل القرارات' : 'Decision history'} (
                              {entry.gradeDecisions.length})
                            </summary>
                            <ul>
                              {[...entry.gradeDecisions].reverse().map((item) => {
                                const actor = accounts.find(
                                  (account) => account.authUserId === item.actor,
                                )
                                return (
                                  <li key={item.requestId}>
                                    <div className="decision-history-heading">
                                      <strong
                                        className={
                                          item.result === 'calculated'
                                            ? undefined
                                            : `grade-${item.result}`
                                        }
                                      >
                                        {item.result === 'calculated'
                                          ? ar
                                            ? 'المحسوبة'
                                            : 'Calculated'
                                          : resultLabel(item.result)}
                                      </strong>
                                      <time dateTime={item.at}>
                                        {new Intl.DateTimeFormat(ar ? 'ar' : 'en', {
                                          dateStyle: 'medium',
                                          timeStyle: 'short',
                                        }).format(new Date(item.at))}
                                      </time>
                                    </div>
                                    <p dir="auto">{item.note}</p>
                                    {actor ? (
                                      <a
                                        className="decision-history-actor"
                                        dir="auto"
                                        href={`?${new URLSearchParams({ page: 'app', view: 'settings', account: actor.authUserId })}`}
                                      >
                                        {accountProfileLabel(actor)}
                                      </a>
                                    ) : (
                                      <span>
                                        {ar
                                          ? 'اسم المسؤول غير متاح'
                                          : 'Administrator name unavailable'}
                                      </span>
                                    )}
                                  </li>
                                )
                              })}
                            </ul>
                          </details>
                        )}
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          onClick={() => dialogRef.current?.close()}
                        >
                          {ar ? 'إلغاء' : 'Cancel'}
                        </button>
                      </dialog>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!course.open && <p role="status">{ar ? 'الدورة مغلقة' : 'Course closed'}</p>}
      {course.open && (
        <button
          className="primary"
          disabled={
            busy ||
            settingsDirty ||
            !!gradeDirty ||
            entries.some(
              (entry) => entry.active && (entry.practical === null || entry.theory === null),
            )
          }
          onClick={() => void save('/api/admin/courses/status', { id: course.id, open: false })}
        >
          {ar ? 'إغلاق الدورة' : 'Close course'}
        </button>
      )}
    </>
  )
}
