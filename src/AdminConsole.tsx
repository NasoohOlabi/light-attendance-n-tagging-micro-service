import { LogOut, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import {
  neonAdminBoardSchema,
  neonAdminDisableSchema,
  neonAdminGrantSchema,
  neonAdminStudentSchema,
} from '../shared/neon'
import { LanguageSwitch, useLanguage } from './i18n'
import { WartaqLogo } from './brand/components'
import { request } from './neon'
import './roles.css'

type Board = z.infer<typeof neonAdminBoardSchema>
type Account = Board['accounts'][number]
type Student = Board['students'][number]
export function AdminConsole({
  userId,
  signOut,
  openNotebook,
}: {
  userId: string
  signOut: () => void
  openNotebook: () => void
}) {
  const { language, t, errorMessage } = useLanguage()
  const ar = language === 'ar'
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Student | null>(null)
  const [creating, setCreating] = useState(false)
  const [revision, setRevision] = useState(0)
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
    <main id="main-content" className="role-page" tabIndex={-1}>
      <header className="role-header">
        <WartaqLogo />
        <LanguageSwitch />
        <button
          className="icon-button"
          aria-label={t('Sign out')}
          title={t('Sign out')}
          onClick={signOut}
        >
          <LogOut
            className="icon-directional"
            size={20}
            strokeWidth={1.6}
            aria-hidden="true"
            focusable="false"
          />
        </button>
      </header>
      <div className="role-heading">
        <div>
          <span>{ar ? 'مسؤول' : 'Administrator'}</span>
          <h1>{ar ? 'إدارة الحسابات والطلاب' : 'Accounts and students'}</h1>
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
      {error && <p role="alert">{errorMessage(error)}</p>}
      {message && <p role="status">{message}</p>}
      {!board && !error && <p role="status">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
      {board && (
        <>
          <section className="panel role-section">
            <h2 className="title">{ar ? 'الحسابات' : 'Accounts'}</h2>
            {board.accounts.map((account) => (
              <AccountForm
                key={`${account.authUserId}:${account.role}:${account.active}`}
                account={account}
                students={board.students}
                self={account.authUserId === userId}
                busy={busy}
                save={save}
                ar={ar}
              />
            ))}
          </section>
          <section className="panel role-section">
            <div className="role-heading">
              <h2 className="title">{ar ? 'الطلاب' : 'Students'}</h2>
              <button
                className="secondary"
                onClick={() => {
                  setEditing(null)
                  setCreating(true)
                }}
              >
                {ar ? 'إضافة طالب' : 'Add student'}
              </button>
            </div>
            {(creating || editing) && (
              <StudentForm
                key={editing?.studentId ?? 'new'}
                student={editing}
                teachers={board.teachers.filter((teacher) =>
                  board.accounts.some(
                    (account) =>
                      account.teacherId === teacher.teacherId &&
                      account.role === 'teacher' &&
                      account.active,
                  ),
                )}
                busy={busy}
                ar={ar}
                save={async (value) => {
                  if (await save('/api/admin/students', neonAdminStudentSchema.parse(value))) {
                    setEditing(null)
                    setCreating(false)
                  }
                }}
                cancel={() => {
                  setEditing(null)
                  setCreating(false)
                }}
              />
            )}
            {board.students.map((student) => (
              <div className="role-row" key={student.studentId}>
                <span dir="auto">
                  {student.name} · {student.group} ·{' '}
                  {student.active ? (ar ? 'نشط' : 'Active') : ar ? 'غير نشط' : 'Inactive'}
                </span>
                <button
                  className="secondary"
                  onClick={() => {
                    setCreating(false)
                    setEditing(student)
                  }}
                >
                  {ar ? 'تعديل' : 'Edit'}
                </button>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  )
}
function AccountForm({
  account,
  students,
  self,
  busy,
  save,
  ar,
}: {
  account: Account
  students: Student[]
  self: boolean
  busy: boolean
  save: (path: string, body: unknown) => Promise<boolean>
  ar: boolean
}) {
  const [role, setRole] = useState<'administrator' | 'teacher' | 'student'>(
    account.role ?? 'teacher',
  )
  const [name, setName] = useState(account.name)
  const [studentId, setStudentId] = useState(account.studentId ?? '')
  const [mode, setMode] = useState<'read_write' | 'read_only' | 'write_only' | ''>('')
  const [expires, setExpires] = useState(() => {
    if (!account.expiresAt) return ''
    const date = new Date(account.expiresAt)
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  })
  return (
    <form
      className="role-account"
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
      <div>
        <strong dir="auto">{account.name}</strong>
        <div dir="ltr">{account.email}</div>
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
                  : 'Pending approval'}{' '}
          · {account.active ? (ar ? 'نشط' : 'Active') : ar ? 'غير نشط' : 'Inactive'}
        </span>
      </div>
      <div className="role-fields">
        <label>
          {ar ? 'الدور' : 'Role'}
          <select
            value={role}
            disabled={self}
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
                  {student.name} · {student.group}
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
                setMode(z.enum(['', 'read_write', 'read_only', 'write_only']).parse(e.target.value))
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
      <div className="role-actions">
        <button className="primary" disabled={busy || self}>
          {ar ? 'حفظ الدور' : 'Save role'}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || self || !account.active}
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
  )
}
function StudentForm({
  student,
  teachers,
  busy,
  ar,
  save,
  cancel,
}: {
  student: Student | null
  teachers: Board['teachers']
  busy: boolean
  ar: boolean
  save: (value: z.infer<typeof neonAdminStudentSchema>) => void
  cancel: () => void
}) {
  const [studentId] = useState(() => student?.studentId ?? crypto.randomUUID())
  const [name, setName] = useState(student?.name ?? '')
  const [group, setGroup] = useState(student?.group ?? '')
  const [teacherId, setTeacherId] = useState(student?.teacherId ?? '')
  const [active, setActive] = useState(student?.active ?? true)
  return (
    <form
      className="role-editor"
      onSubmit={(e) => {
        e.preventDefault()
        const value = neonAdminStudentSchema.safeParse({
          studentId,
          name,
          group,
          teacherId,
          active,
        })
        if (value.success) save(value.data)
      }}
    >
      <div className="role-fields">
        <label>
          {ar ? 'اسم الطالب' : 'Student name'}
          <input
            required
            maxLength={200}
            dir="auto"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          {ar ? 'المجموعة' : 'Group'}
          <input
            maxLength={100}
            dir="auto"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          />
        </label>
        <label>
          {ar ? 'المعلم' : 'Teacher'}
          <select required value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">{ar ? 'اختر معلماً' : 'Choose a teacher'}</option>
            {teachers
              .filter((teacher) => teacher.active || teacher.teacherId === teacherId)
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
