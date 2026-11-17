import { LevelInput } from './level'
import { formatLevel } from './levelFormat'
import { TableControls, TableHeader, useDataTable } from './DataTable'
import { useEffect, useState } from 'react'
import { ClipboardList, History, Lock, LockOpen, Pencil, Save, UsersRound } from 'lucide-react'
import { neonAdminBoardSchema, type Course, type Enrollment } from '../shared/neon'
import { projectEvents, type LedgerEvent } from '../shared/ledger'
import { request } from './neon'
import { useLanguage } from './i18n'
import { setQuery, useQueryState } from './queryState'
import { rankStudents } from './studentSearch'

type Board = ReturnType<typeof neonAdminBoardSchema.parse>

type Draft = { id: string; level: string }

export function Courses({
  userId,
  courses,
  enrollments,
  events,
  refresh,
}: {
  userId: string
  courses: Course[]
  enrollments: Enrollment[]
  events: LedgerEvent[]
  refresh: () => Promise<void>
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
      {!query.courseView && <h1 className="title">{ar ? 'الدورات' : 'Courses'}</h1>}
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
                <TableHeader model={courseTable} actions />
                <tbody role="rowgroup">
                  {courseTable.rows.map((item) => (
                    <tr key={item.id} role="row">
                      <td dir="auto" role="cell">
                        {item.name}
                      </td>
                      <td role="cell">
                        {item.open ? (ar ? 'مفتوحة' : 'Open') : ar ? 'مغلقة' : 'Closed'}
                      </td>
                      <td role="cell">
                        <div className="flex gap-2">
                          <button
                            className="icon-button"
                            aria-label={
                              item.open ? (ar ? 'إغلاق' : 'Close') : ar ? 'إعادة فتح' : 'Reopen'
                            }
                            title={
                              item.open ? (ar ? 'إغلاق' : 'Close') : ar ? 'إعادة فتح' : 'Reopen'
                            }
                            disabled={busy}
                            onClick={() =>
                              void submit('/api/admin/courses/status', {
                                id: item.id,
                                open: !item.open,
                              })
                            }
                          >
                            {item.open ? (
                              <Lock aria-hidden="true" />
                            ) : (
                              <LockOpen aria-hidden="true" />
                            )}
                          </button>
                          <button
                            className="icon-button"
                            aria-label={ar ? 'السجل' : 'History'}
                            title={ar ? 'السجل' : 'History'}
                            onClick={() =>
                              setQuery(
                                {
                                  view: 'notebook',
                                  tab: 'history',
                                  course: item.id,
                                  courseView: '',
                                  q: '',
                                },
                                true,
                              )
                            }
                          >
                            <History aria-hidden="true" />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={ar ? 'تعديل' : 'Edit'}
                            title={ar ? 'تعديل' : 'Edit'}
                            onClick={() => go('edit', item.id)}
                          >
                            <Pencil aria-hidden="true" />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={ar ? 'إدارة الطلاب' : 'Manage students'}
                            title={ar ? 'إدارة الطلاب' : 'Manage students'}
                            onClick={() => go('students', item.id)}
                          >
                            <UsersRound aria-hidden="true" />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={ar ? 'الدرجات' : 'Grades'}
                            title={ar ? 'الدرجات' : 'Grades'}
                            onClick={() => go('grades', item.id)}
                          >
                            <ClipboardList aria-hidden="true" />
                          </button>
                        </div>
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
                          <td dir="auto" data-label={ar ? 'مستوى القائمة' : 'Roster level'}>
                            {formatLevel(student.group) || '—'}
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
                              {ar ? 'حفظ المستوى' : 'Save level'}
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
              students={board.students}
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
  students,
  events,
  busy,
  ar,
  save,
}: {
  course: Course
  entries: Enrollment[]
  students: Board['students']
  events: LedgerEvent[]
  busy: boolean
  ar: boolean
  save: (path: string, body: unknown) => Promise<boolean>
}) {
  const [drafts, setDrafts] = useState<
    Record<string, { practical: string; theory: string; notes: string }>
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
          draft.notes !== entry.notes)) ||
      entry.practical === null ||
      entry.theory === null ||
      ratio === null
    )
      return 'pending'
    return entry.practical >= course.practicalMinimum &&
      entry.theory >= course.theoryMinimum &&
      ratio >= course.attendanceMinimum
      ? 'pass'
      : 'fail'
  }
  const attendanceRatio = (entry: Enrollment) => {
    const rows = attendance.filter(({ value }) => value.enrollmentId === entry.id)
    return rows.length
      ? (rows.filter(({ value }) => value.status === 'present').length / rows.length) * 100
      : null
  }
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
        value: (entry) => resultLabel(gradeResult(entry, attendanceRatio(entry))),
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
        <TableControls model={gradeTable} />
      </div>
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
        className="role-table-scroll"
        role="region"
        aria-label={ar ? 'درجات الدورة' : 'Course grades'}
        tabIndex={0}
      >
        <table className="mobile-record-table role-table min-w-[68rem] [&_th]:whitespace-nowrap [&_input]:w-24">
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
              const formId = `grades-${entry.id}`
              return (
                <tr key={entry.id}>
                  <td dir="auto" data-label={ar ? 'الاسم الأول' : 'First name'}>
                    {student.firstName}
                  </td>
                  <td dir="auto" data-label={ar ? 'اسم العائلة' : 'Last name'}>
                    {student.lastName || '—'}
                  </td>
                  <td dir="auto" data-label={ar ? 'مستوى الدورة' : 'Course level'}>
                    {formatLevel(entry.level) || '—'}
                  </td>
                  <td data-label={ar ? 'الحضور' : 'Attendance'}>
                    {ratio === null ? (ar ? 'غير متاح' : 'Unavailable') : `${ratio.toFixed(1)}%`}
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
                  <td data-label={ar ? 'ملاحظات' : 'Notes'}>
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
                  <td data-label={ar ? 'النتيجة' : 'Result'}>{resultLabel(result)}</td>
                  <td data-label={ar ? 'الإجراءات' : 'Actions'}>
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
                        className="icon-button"
                        disabled={busy}
                        aria-label={ar ? 'حفظ الدرجات' : 'Save grades'}
                        title={ar ? 'حفظ الدرجات' : 'Save grades'}
                      >
                        <Save size={20} aria-hidden="true" />
                      </button>
                    </form>
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
