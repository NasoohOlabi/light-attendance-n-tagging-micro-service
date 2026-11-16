import { useState } from 'react'
import type { Course, Enrollment } from '../shared/neon'
import type { Student } from '../shared/ledger'
import { request } from './neon'
import { useLanguage } from './i18n'

export function Courses({
  userId,
  courses,
  enrollments,
  students,
  refresh,
}: {
  userId: string
  courses: Course[]
  enrollments: Enrollment[]
  students: Student[]
  refresh: () => Promise<void>
}) {
  const { language } = useLanguage()
  const ar = language === 'ar'
  const [courseId, setCourseId] = useState('')
  const [newCourseId, setNewCourseId] = useState(() => crypto.randomUUID())
  const [newEnrollmentId, setNewEnrollmentId] = useState(() => crypto.randomUUID())
  const [name, setName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [level, setLevel] = useState('')
  const [practical, setPractical] = useState('')
  const [theory, setTheory] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const existing = enrollments.find(
    (entry) => entry.courseId === courseId && entry.studentId === studentId,
  )
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
  return (
    <section className="panel space-y-5">
      <h2 className="title">{ar ? 'الدورات والتسجيل' : 'Courses and enrollments'}</h2>
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">{ar ? 'تم الحفظ' : 'Saved'}</p>}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          const id = courseId || newCourseId
          void submit('/api/admin/courses', { id, name }).then((ok) => {
            if (ok) setCourseId(id)
          })
        }}
      >
        <label>
          {ar ? 'الدورة' : 'Course'}
          <select
            value={courseId}
            onChange={(event) => {
              const id = event.target.value
              setCourseId(id)
              if (!id) setNewCourseId(crypto.randomUUID())
              setNewEnrollmentId(crypto.randomUUID())
              setName(courses.find((course) => course.id === id)?.name ?? '')
              setStudentId('')
            }}
          >
            <option value="">{ar ? 'دورة جديدة' : 'New course'}</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </label>
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
      {courseId && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void submit('/api/admin/enrollments', {
              id: existing?.id ?? newEnrollmentId,
              courseId,
              studentId,
              level,
              practical: practical === '' ? null : Number(practical),
              theory: theory === '' ? null : Number(theory),
            })
          }}
        >
          <label>
            {ar ? 'الطالب' : 'Student'}
            <select
              required
              value={studentId}
              onChange={(event) => {
                const id = event.target.value
                const entry = enrollments.find(
                  (item) => item.courseId === courseId && item.studentId === id,
                )
                setStudentId(id)
                setNewEnrollmentId(crypto.randomUUID())
                setLevel(entry?.level ?? '')
                setPractical(entry?.practical?.toString() ?? '')
                setTheory(entry?.theory?.toString() ?? '')
              }}
            >
              <option value="">{ar ? 'اختر الطالب' : 'Choose student'}</option>
              {students.map((student) => (
                <option key={student.studentId} value={student.studentId}>
                  {student.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {ar ? 'المستوى' : 'Level'}
            <input
              maxLength={200}
              value={level}
              onChange={(event) => setLevel(event.target.value)}
            />
          </label>
          <label>
            {ar ? 'عملي' : 'Practical'}
            <input
              type="number"
              min="0"
              max="100"
              step="any"
              value={practical}
              onChange={(event) => setPractical(event.target.value)}
            />
          </label>
          <label>
            {ar ? 'نظري' : 'Theory'}
            <input
              type="number"
              min="0"
              max="100"
              step="any"
              value={theory}
              onChange={(event) => setTheory(event.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {ar ? 'حفظ التسجيل' : 'Save enrollment'}
          </button>
        </form>
      )}
      {courseId && (
        <div className="overflow-x-auto">
          <table className="w-full text-start">
            <thead>
              <tr>
                <th>{ar ? 'الطالب' : 'Student'}</th>
                <th>{ar ? 'المستوى' : 'Level'}</th>
                <th>{ar ? 'عملي' : 'Practical'}</th>
                <th>{ar ? 'نظري' : 'Theory'}</th>
              </tr>
            </thead>
            <tbody>
              {enrollments
                .filter((entry) => entry.courseId === courseId)
                .map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      {students.find((student) => student.studentId === entry.studentId)?.name}
                    </td>
                    <td>{entry.level}</td>
                    <td>{entry.practical ?? '—'}</td>
                    <td>{entry.theory ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
