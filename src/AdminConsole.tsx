import { LevelInput } from './level'
import { formatLevel } from './levelFormat'
import { PhoneNumber } from './PhoneNumber'
import { TableHeader, TableToolbar, useDataTable } from './DataTable'
import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import {
  accountProfileLabel,
  neonAdminBoardSchema,
  neonAdminDisableSchema,
  neonAdminGrantSchema,
  neonAdminPasswordResetSchema,
  neonAdminStudentSchema,
} from '../shared/neon'
import { useLanguage } from './i18n'
import type { Profile } from './ProfileMenu'
import { WorkspaceNavigation } from './WorkspaceNavigation'
import { getNotebook, request } from './neon'
import { setQuery, useQueryState } from './queryState'
import './roles.css'

type Board = z.infer<typeof neonAdminBoardSchema>
type Account = Board['accounts'][number]
type Student = Board['students'][number]
const maximumBirthYear = new Date().getFullYear()
export function AdminConsole({
  userId,
  signOut,
  profile,
  openNotebook,
  initialCreateStudent = false,
  courseId = '',
}: {
  userId: string
  signOut: () => void
  profile: Profile
  openNotebook: () => void
  initialCreateStudent?: boolean
  courseId?: string
}) {
  const { language, t, errorMessage } = useLanguage()
  const ar = language === 'ar'
  const query = useQueryState()
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Student | null>(null)
  const [creating, setCreating] = useState(initialCreateStudent)
  const [revision, setRevision] = useState(0)
  const [courseName, setCourseName] = useState('')
  const [enrollmentId] = useState(() => crypto.randomUUID())
  useEffect(() => {
    if (!courseId) return
    let cancelled = false
    getNotebook(userId)
      .then((snapshot) => {
        if (!cancelled)
          setCourseName(snapshot.courses.find((course) => course.id === courseId)?.name ?? '')
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Load failed')
      })
    return () => {
      cancelled = true
    }
  }, [courseId, userId])
  const [section, setSection] = useState<'accounts' | 'students'>(
    initialCreateStudent ? 'students' : 'accounts',
  )
  useEffect(() => {
    let cancelled = false
    request('/api/admin', userId)
      .then((value) => {
        if (!cancelled) {
          setBoard(neonAdminBoardSchema.parse(value))
          setError('')
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setBoard(null)
          setError(
            cause instanceof Error
              ? cause.message
              : 'The notebook request failed. Please try again.',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [userId, revision])
  const showStudentTable = !courseId && !creating
  const studentTable = useDataTable('admin-students', board?.students ?? [], [
    { id: 'first', label: ar ? 'الاسم الأول' : 'First name', value: (s) => s.firstName },
    { id: 'last', label: ar ? 'اسم العائلة' : 'Last name', value: (s) => s.lastName },
    { id: 'level', label: ar ? 'المستوى' : 'Level', value: (s) => formatLevel(s.group) },
    { id: 'phone', label: ar ? 'واتساب' : 'WhatsApp', value: (s) => s.whatsapp },
    { id: 'location', label: ar ? 'المنطقة' : 'Location', value: (s) => s.location },
    { id: 'year', label: ar ? 'سنة الميلاد' : 'Birth year', value: (s) => s.birthYear },
    {
      id: 'teacher',
      label: ar ? 'المعلم' : 'Teacher',
      value: (s) =>
        board?.teachers.find((teacher) => teacher.teacherId === s.teacherId)?.name ??
        (ar ? 'غير معين' : 'Unassigned'),
    },
    {
      id: 'active',
      choices: ar ? ['نشط', 'غير نشط'] : ['Active', 'Inactive'],
      label: ar ? 'الحالة' : 'Active',
      value: (s) => (s.active ? (ar ? 'نشط' : 'Active') : ar ? 'غير نشط' : 'Inactive'),
    },
  ])
  async function save(path: string, body: unknown) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      setBoard(neonAdminBoardSchema.parse(await request(path, userId, body)))
      setMessage(ar ? 'تم الحفظ.' : 'Saved.')
      return true
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The notebook request failed. Please try again.',
      )
      return false
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="workspace">
      <WorkspaceNavigation administrator assigned profile={profile} leave={signOut} />
      <main id="main-content" className="workspace-main role-page" tabIndex={-1}>
        <div className="role-heading">
          <div>
            <span>{ar ? 'مسؤول' : 'Administrator'}</span>
            <h1>
              {initialCreateStudent ? (ar ? 'الطلاب' : 'Students') : ar ? 'الإعدادات' : 'Settings'}
            </h1>
          </div>
          <div className="role-actions">
            <button
              className="icon-button"
              aria-label={t('Refresh')}
              title={t('Refresh')}
              onClick={() => setRevision((n) => n + 1)}
            >
              <RefreshCw size={20} strokeWidth={1.6} aria-hidden="true" focusable="false" />
            </button>
            <button className="primary" onClick={openNotebook}>
              {ar ? 'فتح الدفتر' : 'Open notebook'}
            </button>
          </div>
        </div>
        {!initialCreateStudent && (
          <button
            className="secondary mb-4"
            onClick={() =>
              setQuery({ view: 'history', tab: '', q: '', group: '', student: '' }, true)
            }
          >
            {t('History & corrections')}
          </button>
        )}
        {error && <p role="alert">{errorMessage(error)}</p>}
        {message && <p role="status">{message}</p>}
        {!board && !error && <p role="status">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
        {board && (
          <>
            {!initialCreateStudent && (
              <nav className="role-tabs" aria-label={ar ? 'أقسام الإعدادات' : 'Settings sections'}>
                <button
                  className="secondary"
                  aria-pressed={section === 'accounts'}
                  onClick={() => setSection('accounts')}
                >
                  {ar ? 'الحسابات' : 'Accounts'}
                </button>
                <button
                  className="secondary"
                  aria-pressed={section === 'students'}
                  onClick={() => {
                    setQuery({ account: '' })
                    setSection('students')
                  }}
                >
                  {ar ? 'الطلاب' : 'Students'}
                </button>
              </nav>
            )}
            {section === 'accounts' && !initialCreateStudent && (
              <section className="panel role-section">
                <h2 className="title">{ar ? 'الحسابات' : 'Accounts'}</h2>
                {query.account ? (
                  <>
                    <button className="secondary" onClick={() => setQuery({ account: '' }, true)}>
                      {ar ? 'العودة إلى الحسابات' : 'Back to accounts'}
                    </button>
                    {(() => {
                      const account = board.accounts.find(
                        (item) => item.authUserId === query.account,
                      )
                      if (!account) return <p>{ar ? 'الحساب غير متاح' : 'Account unavailable'}</p>
                      if (account.authUserId === userId)
                        return (
                          <div className="role-account">
                            <strong dir="auto">{accountProfileLabel(account)}</strong>
                            <p dir="ltr">{account.email}</p>
                          </div>
                        )
                      return (
                        <AccountForm
                          key={account.authUserId}
                          account={account}
                          students={board.students}
                          busy={busy}
                          save={save}
                          ar={ar}
                          expanded
                        />
                      )
                    })()}
                  </>
                ) : (
                  <>
                    {board.accounts.filter((account) => account.authUserId !== userId).length ===
                      0 && <p>{ar ? 'لا توجد حسابات أخرى.' : 'No other accounts.'}</p>}
                    {board.accounts
                      .filter((account) => account.authUserId !== userId)
                      .map((account) => (
                        <AccountForm
                          key={`${account.authUserId}:${account.role}:${account.active}`}
                          account={account}
                          students={board.students}
                          busy={busy}
                          save={save}
                          ar={ar}
                        />
                      ))}
                  </>
                )}
              </section>
            )}
            {section === 'students' && (
              <section className="panel role-section">
                <TableToolbar
                  model={showStudentTable ? studentTable : undefined}
                  className="mt-8 mb-4"
                >
                  <h2 className="title">{ar ? 'الطلاب' : 'Students'}</h2>
                </TableToolbar>
                {!courseId && (
                  <button
                    className="secondary mb-4"
                    onClick={() => {
                      setEditing(null)
                      setCreating(true)
                    }}
                  >
                    {ar ? 'إضافة طالب' : 'Add student'}
                  </button>
                )}
                {(creating || editing) && (
                  <StudentForm
                    key={editing?.studentId ?? 'new'}
                    student={editing}
                    teachers={board.teachers}
                    busy={busy || (!!courseId && !courseName)}
                    ar={ar}
                    courseName={courseId ? courseName : ''}
                    save={async (value, level) => {
                      const path = courseId ? '/api/admin/students/enroll' : '/api/admin/students'
                      const body = courseId
                        ? { student: value, enrollment: { id: enrollmentId, courseId, level } }
                        : value
                      if (await save(path, body)) {
                        if (courseId) {
                          setQuery({ view: 'courses', courseView: 'students' }, true)
                          return
                        }
                        setEditing(null)
                        setCreating(false)
                      }
                    }}
                    cancel={() => {
                      if (courseId) {
                        setQuery({ view: 'courses', courseView: 'students' }, true)
                        return
                      }
                      setEditing(null)
                      setCreating(false)
                    }}
                  />
                )}
                {showStudentTable && (
                  <div
                    className="role-table-scroll"
                    role="region"
                    aria-label={ar ? 'قائمة الطلاب' : 'Student list'}
                    tabIndex={0}
                  >
                    <table className="mobile-record-table role-table role-students-table">
                      <TableHeader model={studentTable} actions />
                      <tbody>
                        {studentTable.rows.map((student) => (
                          <tr key={student.studentId}>
                            <td dir="auto" data-label={ar ? 'الاسم الأول' : 'First name'}>
                              {student.firstName}
                            </td>
                            <td dir="auto" data-label={ar ? 'اسم العائلة' : 'Last name'}>
                              {student.lastName || '—'}
                            </td>
                            <td data-label={ar ? 'المستوى' : 'Level'}>
                              <bdi>{formatLevel(student.group)}</bdi>
                            </td>
                            <td dir="ltr" data-label={ar ? 'واتساب' : 'WhatsApp'}>
                              {student.whatsapp ? <PhoneNumber value={student.whatsapp} /> : '—'}
                            </td>
                            <td dir="auto" data-label={ar ? 'المنطقة' : 'Location'}>
                              {student.location || '—'}
                            </td>
                            <td data-label={ar ? 'سنة الميلاد' : 'Birth year'}>
                              {student.birthYear ?? '—'}
                            </td>
                            <td dir="auto" data-label={ar ? 'المعلم' : 'Teacher'}>
                              {board.teachers.find(
                                (teacher) => teacher.teacherId === student.teacherId,
                              )?.name ?? (ar ? 'غير معين' : 'Unassigned')}
                            </td>
                            <td data-label={ar ? 'الحالة' : 'Active'}>
                              {student.active
                                ? ar
                                  ? 'نشط'
                                  : 'Active'
                                : ar
                                  ? 'غير نشط'
                                  : 'Inactive'}
                            </td>
                            <td data-label={ar ? 'الإجراءات' : 'Actions'}>
                              <button
                                className="secondary"
                                onClick={() => {
                                  setCreating(false)
                                  setEditing(student)
                                }}
                              >
                                {ar ? 'تعديل' : 'Edit'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
function AccountForm({
  account,
  students,
  busy,
  save,
  ar,
  expanded = false,
}: {
  account: Account
  expanded?: boolean
  students: Student[]
  busy: boolean
  save: (path: string, body: unknown) => Promise<boolean>
  ar: boolean
}) {
  const [role, setRole] = useState<'administrator' | 'teacher' | 'student'>(
    account.role ?? 'teacher',
  )
  const [name, setName] = useState(account.name)
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [studentId, setStudentId] = useState(account.studentId ?? '')
  const [mode, setMode] = useState<'read_write' | 'read_only' | 'write_only' | ''>('')
  const [expires, setExpires] = useState(() => {
    if (!account.expiresAt) return ''
    const date = new Date(account.expiresAt)
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  })
  return (
    <details className="role-account" open={expanded || undefined}>
      <summary>
        <span>
          <strong dir="auto">{account.name}</strong>
          <span dir="ltr">{account.email}</span>
          <span>
            {account.role === 'administrator'
              ? ar
                ? 'مسؤول'
                : 'Administrator'
              : account.role === 'teacher'
                ? ar
                  ? 'معلم'
                  : 'Teacher'
                : account.role === 'student'
                  ? ar
                    ? 'طالب'
                    : 'Student'
                  : ar
                    ? 'بانتظار الموافقة'
                    : 'Pending approval'}
            {' · '}
            {account.active ? (ar ? 'نشط' : 'Active') : ar ? 'غير نشط' : 'Inactive'}
          </span>
        </span>
        <span className="role-manage">{ar ? 'إدارة' : 'Manage'}</span>
      </summary>
      <form
        className="role-editor"
        onSubmit={(event) => {
          event.preventDefault()
          const expiresAt = expires ? new Date(expires).toISOString() : null
          const input =
            role === 'administrator'
              ? { role, authUserId: account.authUserId, name }
              : role === 'teacher'
                ? { role, authUserId: account.authUserId, name, mode, expiresAt }
                : { role, authUserId: account.authUserId, studentId, expiresAt }
          const parsed = neonAdminGrantSchema.safeParse(input)
          if (parsed.success) void save('/api/admin/accounts/grant', parsed.data)
        }}
      >
        <div className="role-fields">
          <label>
            {ar ? 'الدور' : 'Role'}
            <select
              value={role}
              onChange={(event) => {
                const v = z.enum(['administrator', 'teacher', 'student']).parse(event.target.value)
                setRole(v)
              }}
            >
              <option value="administrator">{ar ? 'مسؤول' : 'Administrator'}</option>
              <option value="teacher">{ar ? 'معلم' : 'Teacher'}</option>
              <option value="student">{ar ? 'طالب' : 'Student'}</option>
            </select>
          </label>
          {role === 'student' ? (
            <label>
              {ar ? 'الطالب' : 'Student'}
              <select required value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">{ar ? 'اختر طالباً' : 'Choose a student'}</option>
                {students.map((student) => (
                  <option key={student.studentId} value={student.studentId}>
                    {student.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              {ar ? 'الاسم' : 'Name'}
              <input
                required
                maxLength={100}
                dir="auto"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          {role === 'teacher' && (
            <label>
              {ar ? 'الصلاحية' : 'Access'}
              <select
                value={mode}
                required
                onChange={(e) =>
                  setMode(
                    z.enum(['', 'read_write', 'read_only', 'write_only']).parse(e.target.value),
                  )
                }
              >
                <option value="">{ar ? 'اختر الصلاحية' : 'Choose access'}</option>
                <option value="read_write">{ar ? 'قراءة وكتابة' : 'Read and write'}</option>
                <option value="read_only">{ar ? 'قراءة فقط' : 'Read only'}</option>
                <option value="write_only">{ar ? 'كتابة فقط' : 'Write only'}</option>
              </select>
            </label>
          )}
          {role !== 'administrator' && (
            <label>
              {ar ? 'انتهاء الصلاحية (اختياري)' : 'Expires (optional)'}
              <input
                type="datetime-local"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            </label>
          )}
        </div>
        <div className="role-fields">
          <label>
            {ar ? 'كلمة المرور الجديدة' : 'New password'}
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            {ar ? 'تأكيد كلمة المرور' : 'Confirm password'}
            <input
              type="password"
              autoComplete="new-password"
              maxLength={128}
              value={passwordConfirmation}
              onChange={(e) => setPasswordConfirmation(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={async () => {
              const parsed = neonAdminPasswordResetSchema.safeParse({
                authUserId: account.authUserId,
                password,
                passwordConfirmation,
              })
              if (!parsed.success) {
                setPasswordError(
                  ar
                    ? 'يجب تطابق كلمتي المرور وأن تتكون من 8 إلى 128 حرفاً.'
                    : 'Passwords must match and contain 8 to 128 characters.',
                )
                return
              }
              setPasswordError('')
              if (await save('/api/admin/accounts/reset-password', parsed.data)) {
                setPassword('')
                setPasswordConfirmation('')
              }
            }}
          >
            {ar ? 'إعادة تعيين كلمة المرور' : 'Reset password'}
          </button>
          {passwordError && <p role="alert">{passwordError}</p>}
        </div>
        <div className="role-actions">
          <button className="primary" disabled={busy}>
            {ar ? 'حفظ الدور' : 'Save role'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy || !account.active}
            onClick={() =>
              void save(
                '/api/admin/accounts/disable',
                neonAdminDisableSchema.parse({ authUserId: account.authUserId }),
              )
            }
          >
            {ar ? 'تعطيل الوصول' : 'Disable access'}
          </button>
        </div>
      </form>
    </details>
  )
}
function StudentForm({
  student,
  teachers,
  busy,
  ar,
  save,
  cancel,
  courseName,
}: {
  student: Student | null
  teachers: Board['teachers']
  busy: boolean
  ar: boolean
  save: (value: z.infer<typeof neonAdminStudentSchema>, level: string) => void
  cancel: () => void
  courseName: string
}) {
  const [studentId] = useState(() => student?.studentId ?? crypto.randomUUID())
  const [firstName, setFirstName] = useState(student?.firstName ?? '')
  const [lastName, setLastName] = useState(student?.lastName ?? '')
  const [nameError, setNameError] = useState<'required' | 'length' | ''>('')
  const [group, setGroup] = useState(student?.group ?? '')
  const [whatsapp, setWhatsapp] = useState(student?.whatsapp ?? '')
  const [location, setLocation] = useState(student?.location ?? '')
  const [birthYear, setBirthYear] = useState(student?.birthYear?.toString() ?? '')
  const [courseLevel, setCourseLevel] = useState<string | null>(null)
  const [teacherId, setTeacherId] = useState(student?.teacherId ?? '')
  const [active, setActive] = useState(student?.active ?? true)
  return (
    <form
      className="role-editor"
      onSubmit={(e) => {
        e.preventDefault()
        if (!firstName.trim()) {
          setNameError('required')
          return
        }
        if ([firstName.trim(), lastName.trim()].filter(Boolean).join(' ').length > 200) {
          setNameError('length')
          return
        }
        setNameError('')
        const value = neonAdminStudentSchema.safeParse({
          studentId,
          firstName,
          lastName,
          group,
          whatsapp: whatsapp || null,
          location: location || null,
          birthYear: birthYear ? Number(birthYear) : null,
          teacherId: teacherId || null,
          active,
        })
        if (value.success) save(value.data, courseLevel ?? group)
      }}
    >
      {courseName && (
        <p>
          {ar ? 'الدورة' : 'Course'}: <strong dir="auto">{courseName}</strong>
        </p>
      )}
      <div className="role-fields">
        {courseName && (
          <label>
            {ar ? 'مستوى الدورة' : 'Course level'}
            <LevelInput
              maxLength={200}
              dir="auto"
              value={courseLevel ?? group}
              onChange={(event) => setCourseLevel(event.target.value)}
            />
          </label>
        )}
        <label>
          {ar ? 'الاسم الأول' : 'First name'}
          <input
            required
            maxLength={200}
            dir="auto"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </label>
        <label>
          {ar ? 'اسم العائلة' : 'Last name'}
          <input
            maxLength={200}
            dir="auto"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </label>
        <label>
          {ar ? 'المستوى' : 'Level'}
          <LevelInput
            maxLength={100}
            dir="auto"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          />
        </label>
        <label>
          {ar ? 'رقم واتساب' : 'WhatsApp number'}
          <input
            type="tel"
            dir="ltr"
            maxLength={40}
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
          />
        </label>
        <label>
          {ar ? 'المنطقة' : 'Location'}
          <input
            maxLength={200}
            dir="auto"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>
        <label>
          {ar ? 'سنة الميلاد' : 'Birth year'}
          <input
            type="number"
            min={1900}
            max={maximumBirthYear}
            step={1}
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
          />
        </label>
        <label>
          {ar ? 'المعلم' : 'Teacher'}
          <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">{ar ? 'غير معين' : 'Unassigned'}</option>
            {teachers
              .filter((teacher) => teacher.active || teacher.teacherId === student?.teacherId)
              .map((teacher) => (
                <option key={teacher.teacherId} value={teacher.teacherId}>
                  {teacher.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />{' '}
          {ar ? 'نشط' : 'Active'}
        </label>
      </div>
      {nameError && (
        <p role="alert">
          {nameError === 'required'
            ? ar
              ? 'الاسم الأول مطلوب.'
              : 'First name is required.'
            : ar
              ? 'يجب ألا يزيد الاسم الكامل عن 200 حرف.'
              : 'The full name must contain at most 200 characters.'}
        </p>
      )}
      <div className="role-actions">
        <button className="primary" disabled={busy}>
          {ar ? 'حفظ الطالب' : 'Save student'}
        </button>
        <button className="secondary" type="button" onClick={cancel}>
          {ar ? 'إلغاء' : 'Cancel'}
        </button>
      </div>
    </form>
  )
}
