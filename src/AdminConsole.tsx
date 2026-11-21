import { InviteAccounts } from './InviteAccounts'
import { LevelInput } from './level'
import { formatLevel } from './levelFormat'
import { PhoneNumber } from './PhoneNumber'
import { TableHeader, TableToolbar } from './DataTable'
import { useDataTable } from './useDataTable'
import { Copy, RefreshCw } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { z } from 'zod'
import {
  accountProfileLabel,
  neonAdminBoardSchema,
  neonAdminDisableSchema,
  neonAdminGrantSchema,
  neonAdminGeneratedPasswordResetResponseSchema,
  neonAdminStudentSchema,
} from '../shared/neon'
import { useLanguage } from './useLanguage'
import type { Profile } from './ProfileMenu'
import { WorkspaceNavigation } from './WorkspaceNavigation'
import { SettingsNavigation } from './SettingsNavigation'
import { getNotebook, request } from './neon'
import { setQuery, useQueryState } from './queryState'

type Board = z.infer<typeof neonAdminBoardSchema>
type Account = Board['accounts'][number]
type Student = Board['students'][number]
const maximumBirthYear = new Date().getFullYear()
export function AdminConsole({
  userId,
  signOut,
  profile,
  initialCreateStudent = false,
  courseId = '',
}: {
  userId: string
  signOut: () => void
  profile: Profile
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
  const [inviting, setInviting] = useState(false)
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
          setError(cause instanceof Error ? cause.message : 'The request failed. Please try again.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [userId, revision])
  const editingStudentId = initialCreateStudent || query.account ? '' : query.student
  const linkedStudent = editingStudentId
    ? board?.students.find((student) => student.studentId === editingStudentId)
    : undefined
  const selectedSection =
    initialCreateStudent || editingStudentId
      ? 'students'
      : query.account
        ? 'accounts'
        : query.settingsSection
  if (selectedSection === 'students' && inviting) setInviting(false)
  const activeEditing = editingStudentId ? linkedStudent : editing
  const showStudentTable = !courseId && !creating && !editingStudentId
  const studentTable = useDataTable('admin-students', board?.students ?? [], [
    { id: 'first', label: ar ? 'الاسم الأول' : 'First name', value: (s) => s.firstName },
    { id: 'last', label: ar ? 'اسم العائلة' : 'Last name', value: (s) => s.lastName },
    { id: 'level', label: ar ? 'المستوى' : 'Level', value: (s) => formatLevel(s.group) },
    {
      id: 'phone',
      filterMode: 'literal',
      label: ar ? 'واتساب' : 'WhatsApp',
      value: (s) => s.whatsapp,
    },
    { id: 'location', label: ar ? 'المنطقة' : 'Location', value: (s) => s.location },
    {
      id: 'year',
      filterMode: 'literal',
      label: ar ? 'سنة الميلاد' : 'Birth year',
      value: (s) => s.birthYear,
    },
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
      setError(cause instanceof Error ? cause.message : 'The request failed. Please try again.')
      return false
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="workspace">
      <WorkspaceNavigation administrator profile={profile} leave={signOut} />
      <main id="main-content" className="workspace-main role-page" tabIndex={-1}>
        <div className="role-heading">
          <div>
            {initialCreateStudent && <span>{ar ? 'مسؤول' : 'Administrator'}</span>}
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
          </div>
        </div>
        {!initialCreateStudent && <SettingsNavigation current={selectedSection} />}
        {error && <p role="alert">{errorMessage(error)}</p>}
        {message && <p role="status">{message}</p>}
        {!board && !error && <p role="status">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
        {board && (
          <>
            {selectedSection === 'accounts' && !initialCreateStudent && (
              <section className="panel role-section">
                <h2 className="title">{ar ? 'الحسابات' : 'Accounts'}</h2>
                {inviting ? (
                  <InviteAccounts
                    userId={userId}
                    ar={ar}
                    done={() => {
                      setInviting(false)
                      setRevision((n) => n + 1)
                    }}
                  />
                ) : query.account ? (
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
                            <p dir="ltr">
                              {account.verifiedPhone ||
                                (ar ? 'رقم الهاتف غير متاح' : 'Phone unavailable')}
                            </p>
                          </div>
                        )
                      return (
                        <AccountForm
                          key={account.authUserId}
                          account={account}
                          userId={userId}
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
                    <button className="primary mb-4" onClick={() => setInviting(true)}>
                      {ar ? 'إنشاء حسابات' : 'Create accounts'}
                    </button>
                    {board.accounts.filter((account) => account.authUserId !== userId).length ===
                      0 && <p>{ar ? 'لا توجد حسابات أخرى.' : 'No other accounts.'}</p>}
                    {board.accounts
                      .filter((account) => account.authUserId !== userId)
                      .map((account) => (
                        <AccountForm
                          key={`${account.authUserId}:${account.role}:${account.active}`}
                          account={account}
                          userId={userId}
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
            {selectedSection === 'students' && (
              <section className="panel role-section">
                <TableToolbar
                  model={showStudentTable ? studentTable : undefined}
                  className="mt-8 mb-4"
                >
                  <h2 className="title">{ar ? 'الطلاب' : 'Students'}</h2>
                </TableToolbar>
                {editingStudentId && (
                  <button
                    className="secondary mb-4"
                    onClick={() => setQuery({ view: 'student' }, true)}
                  >
                    {ar
                      ? '\u0627\u0644\u0639\u0648\u062f\u0629 \u0625\u0644\u0649 \u0627\u0644\u0637\u0627\u0644\u0628'
                      : 'Back to student'}
                  </button>
                )}
                {editingStudentId && !linkedStudent && (
                  <p>
                    {ar
                      ? '\u0627\u0644\u0637\u0627\u0644\u0628 \u063a\u064a\u0631 \u0645\u062a\u0627\u062d'
                      : 'Student unavailable'}
                  </p>
                )}
                {!courseId && !editingStudentId && (
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
                {(creating || activeEditing) && (
                  <StudentForm
                    key={activeEditing?.studentId ?? 'new'}
                    student={activeEditing ?? null}
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
                        if (editingStudentId) {
                          setQuery({ view: 'student' }, true)
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
                      if (editingStudentId) {
                        setQuery({ view: 'student' }, true)
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
  userId,
  students,
  busy,
  save,
  ar,
  expanded = false,
}: {
  account: Account
  userId: string
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
  const [verifiedPhone, setVerifiedPhone] = useState(account.verifiedPhone ?? '')
  const [reset, setReset] = useState<
    | { kind: 'idle' | 'pending' | 'failed' }
    | { kind: 'done'; credentials: z.infer<typeof neonAdminGeneratedPasswordResetResponseSchema> }
  >({ kind: 'idle' })
  const resetButton = useRef<HTMLButtonElement>(null)
  const [studentId, setStudentId] = useState(account.studentId ?? '')
  const [expires, setExpires] = useState(() => {
    if (!account.expiresAt) return ''
    const date = new Date(account.expiresAt)
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  })
  const saving = busy || reset.kind === 'pending'
  async function resetPassword() {
    setReset({ kind: 'pending' })
    try {
      const credentials = neonAdminGeneratedPasswordResetResponseSchema.parse(
        await request('/api/admin/accounts/reset-password-generated', userId, {
          authUserId: account.authUserId,
        }),
      )
      setReset({ kind: 'done', credentials })
    } catch {
      setReset({ kind: 'failed' })
    }
  }
  const editor = (
    <details className="role-account" open={expanded || undefined}>
      <summary>
        <span>
          <strong dir="auto">{account.name}</strong>
          <span dir="ltr">
            {account.verifiedPhone || (ar ? 'رقم الهاتف غير متاح' : 'Phone unavailable')}
          </span>
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
          if (saving) return
          const expiresAt = expires ? new Date(expires).toISOString() : null
          const input =
            role === 'administrator'
              ? { role, authUserId: account.authUserId, name }
              : role === 'teacher'
                ? { role, authUserId: account.authUserId, name, expiresAt }
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
        <label>
          {ar ? 'رقم هاتف الدخول' : 'Sign-in phone number'}
          <input
            type="tel"
            dir="ltr"
            value={verifiedPhone}
            onChange={(event) => setVerifiedPhone(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="secondary"
          disabled={saving || !account.active || !verifiedPhone.trim()}
          onClick={() =>
            void save('/api/admin/accounts/verify-phone', {
              authUserId: account.authUserId,
              phone: verifiedPhone,
              phoneConfirmed: true,
            })
          }
        >
          {ar ? 'أكد رقم الهاتف بعد السؤال مباشرة' : 'Confirm phone number after asking directly'}
        </button>
        <div className="role-actions">
          <button className="primary" disabled={saving}>
            {ar ? 'حفظ الدور' : 'Save role'}
          </button>
          <button
            ref={resetButton}
            type="button"
            className="secondary"
            disabled={saving || !account.verifiedPhone}
            onClick={() => void resetPassword()}
          >
            {ar ? 'إعادة تعيين كلمة المرور' : 'Reset password'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={saving || !account.active}
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
        {reset.kind === 'failed' && (
          <p role="alert">
            {ar
              ? 'تعذر تأكيد إعادة التعيين. قد تكون كلمة المرور قد تغيرت. حاول مجدداً.'
              : 'The reset could not be confirmed. The password may have changed. Try again.'}
          </p>
        )}
      </form>
    </details>
  )
  return (
    <>
      {editor}
      {reset.kind === 'done' && (
        <PasswordResetMessage
          ar={ar}
          name={account.name}
          credentials={reset.credentials}
          dismiss={() => {
            setReset({ kind: 'idle' })
            resetButton.current?.focus()
          }}
        />
      )}
    </>
  )
}

function PasswordResetMessage({
  ar,
  name,
  credentials,
  dismiss,
}: {
  ar: boolean
  name: string
  credentials: z.infer<typeof neonAdminGeneratedPasswordResetResponseSchema>
  dismiss: () => void
}) {
  const titleId = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const message = useRef<HTMLTextAreaElement>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'manual'>('idle')
  useEffect(() => dialog.current?.showModal(), [])
  const url = `${window.location.origin}/?page=app`
  const phone =
    credentials.loginMethod === 'phone'
      ? credentials.loginIdentifier
      : ar
        ? 'رقم الهاتف غير متاح'
        : 'Phone unavailable'
  const text = ar
    ? `مرحباً ${name}?\nتمت إعادة تعيين كلمة المرور.\n${url}\nرقم الهاتف: ${phone}\nكلمة المرور المؤقتة: ${credentials.temporaryPassword}`
    : `Hello ${name},\nYour Wartaq password has been reset.\n${url}\nPhone: ${phone}\nTemporary password: ${credentials.temporaryPassword}`
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus('copied')
    } catch {
      message.current?.focus({ preventScroll: true })
      message.current?.select()
      setCopyStatus('manual')
    }
  }
  return (
    <dialog ref={dialog} className="grade-dialog" aria-labelledby={titleId} onClose={dismiss}>
      <div className="grid gap-2">
        <h3 id={titleId} className="text-lg font-semibold">
          {ar ? 'تمت إعادة تعيين كلمة المرور' : 'Password reset'}
        </h3>
        <p className="muted">
          {ar
            ? 'أرسل هذه الرسالة إلى صاحب الحساب بشكل خاص.'
            : 'Send this message privately to the account holder.'}
        </p>
        <label>
          {ar ? 'رسالة إعادة التعيين' : 'Reset message'}
          <textarea
            ref={message}
            className="invite-message"
            readOnly
            rows={7}
            dir={ar ? 'rtl' : 'ltr'}
            value={text}
          />
        </label>
        <p role="status" className="muted">
          {copyStatus === 'copied' && (ar ? 'تم نسخ الرسالة' : 'Message copied')}
          {copyStatus === 'manual' &&
            (ar ? 'الرسالة محددة، انسخها يدوياً.' : 'The message is selected. Copy it manually.')}
        </p>
        <div className="role-actions">
          <button type="button" className="primary inline-flex items-center gap-2" onClick={copy}>
            <Copy size={16} aria-hidden="true" />
            {ar ? 'نسخ الرسالة' : 'Copy message'}
          </button>
          <button type="button" className="secondary" onClick={() => dialog.current?.close()}>
            {ar ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </dialog>
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
        <label className="min-h-11 flex-row items-center self-end">
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
