import { useEffect, useState } from 'react'
import { neonAdminBoardSchema, type Course, type Enrollment } from '../shared/neon'
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
  refresh,
}: {
  userId: string
  courses: Course[]
  enrollments: Enrollment[]
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
              <table className="role-table course-list-table w-full table-fixed">
                <thead>
                  <tr>
                    <th className="w-1/3">{ar ? 'الدورة' : 'Course'}</th>
                    <th className="w-1/4">{ar ? 'الحالة' : 'Status'}</th>
                    <th>{ar ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map((item) => (
                    <tr key={item.id}>
                      <td dir="auto">{item.name}</td>
                      <td>{item.open ? (ar ? 'مفتوحة' : 'Open') : ar ? 'مغلقة' : 'Closed'}</td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              void submit('/api/admin/courses/status', {
                                id: item.id,
                                open: !item.open,
                              })
                            }
                          >
                            {item.open ? (ar ? 'إغلاق' : 'Close') : ar ? 'إعادة فتح' : 'Reopen'}
                          </button>
                          <button
                            className="secondary"
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
                            {ar ? 'السجل' : 'History'}
                          </button>
                          <button className="secondary" onClick={() => go('edit', item.id)}>
                            {ar ? 'تعديل' : 'Edit'}
                          </button>
                          <button className="secondary" onClick={() => go('students', item.id)}>
                            {ar ? 'إدارة الطلاب' : 'Manage students'}
                          </button>
                          <button className="secondary" onClick={() => go('grades', item.id)}>
                            {ar ? 'الدرجات' : 'Grades'}
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
          <button className="secondary" onClick={() => go('', '')}>
            {ar ? 'العودة للدورات' : 'Back to courses'}
          </button>
          <h1 className="title">
            {course.name} —{' '}
            {query.courseView === 'students'
              ? ar
                ? 'إدارة الطلاب'
                : 'Manage students'
              : ar
                ? 'الدرجات'
                : 'Grades'}
          </h1>
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
                <table className="role-table course-students-table">
                  <thead>
                    <tr>
                      <th>{ar ? 'الاسم الأول' : 'First name'}</th>
                      <th>{ar ? 'اسم العائلة' : 'Last name'}</th>
                      <th>{ar ? 'مستوى القائمة' : 'Roster level'}</th>
                      <th>{ar ? 'مستوى الدورة' : 'Course level'}</th>
                      <th>{ar ? 'مسجل' : 'Enrolled'}</th>
                      <th>{ar ? 'الإجراءات' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matching.map((student) => {
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
                          <td dir="auto">{student.firstName}</td>
                          <td dir="auto">{student.lastName || '—'}</td>
                          <td dir="auto">{student.group || '—'}</td>
                          <td>
                            <input
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
                          <td>
                            <input
                              type="checkbox"
                              role="switch"
                              aria-label={`${ar ? 'مسجل' : 'Enrolled'}: ${student.firstName} ${student.lastName}`}
                              checked={entry?.active ?? false}
                              disabled={busy}
                              onChange={(event) => saveMembership(event.target.checked)}
                            />
                          </td>
                          <td>
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
          {query.courseView === 'grades' && (
            <div
              className="role-table-scroll"
              role="region"
              aria-label={ar ? 'درجات الدورة' : 'Course grades'}
              tabIndex={0}
            >
              <table className="role-table">
                <thead>
                  <tr>
                    <th>{ar ? 'الاسم الأول' : 'First name'}</th>
                    <th>{ar ? 'اسم العائلة' : 'Last name'}</th>
                    <th>{ar ? 'عملي' : 'Practical'}</th>
                    <th>{ar ? 'نظري' : 'Theory'}</th>
                    <th>{ar ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {courseEntries.map((entry) => {
                    const student = board?.students.find(
                      (item) => item.studentId === entry.studentId,
                    )
                    return (
                      student && (
                        <GradeRow
                          key={`${entry.id}:${entry.practical}:${entry.theory}`}
                          entry={entry}
                          student={student}
                          busy={busy}
                          ar={ar}
                          save={submit}
                        />
                      )
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function GradeRow({
  entry,
  student,
  busy,
  ar,
  save,
}: {
  entry: Enrollment
  student: Board['students'][number]
  busy: boolean
  ar: boolean
  save: (path: string, body: unknown) => Promise<boolean>
}) {
  const [practical, setPractical] = useState(entry.practical?.toString() ?? '')
  const [theory, setTheory] = useState(entry.theory?.toString() ?? '')
  const formId = `grades-${entry.id}`
  return (
    <tr>
      <td dir="auto">{student.firstName}</td>
      <td dir="auto">{student.lastName || '—'}</td>
      <td>
        <input
          form={formId}
          aria-label={`${ar ? 'عملي' : 'Practical'}: ${student.firstName} ${student.lastName}`}
          type="number"
          min="0"
          max="100"
          step="any"
          value={practical}
          onChange={(event) => setPractical(event.target.value)}
        />
      </td>
      <td>
        <input
          form={formId}
          aria-label={`${ar ? 'نظري' : 'Theory'}: ${student.firstName} ${student.lastName}`}
          type="number"
          min="0"
          max="100"
          step="any"
          value={theory}
          onChange={(event) => setTheory(event.target.value)}
        />
      </td>
      <td>
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault()
            void save('/api/admin/enrollments/grades', {
              id: entry.id,
              practical: practical === '' ? null : Number(practical),
              theory: theory === '' ? null : Number(theory),
            })
          }}
        >
          <button className="secondary" disabled={busy}>
            {ar ? 'حفظ الدرجات' : 'Save grades'}
          </button>
        </form>
      </td>
    </tr>
  )
}
