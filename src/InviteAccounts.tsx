import { useRef, useState } from 'react'
import { z } from 'zod'
import { request } from './neon'
import { invitationRequestSchema, invitationResponseSchema } from '../shared/invitations'

const personSchema = invitationRequestSchema.shape.people.element
type Person = z.infer<typeof personSchema>
type Invitation = z.infer<typeof invitationResponseSchema>['invitations'][number]

export function InviteAccounts({
  userId,
  ar,
  done,
}: {
  userId: string
  ar: boolean
  done: () => void
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [role, setRole] = useState<Person['role']>('teacher')
  const [paste, setPaste] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  const [error, setError] = useState('')
  const [state, setState] = useState<'editing' | 'sending' | 'uncertain' | 'done'>('editing')
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [copied, setCopied] = useState<number | null>(null)
  const sending = useRef(false)
  const requestId = useRef(crypto.randomUUID())
  const url = `${window.location.origin}/?page=app&login=username`
  function addPerson() {
    const result = personSchema.safeParse({ firstName, lastName, role })
    if (!result.success || people.length >= 50) {
      setError(
        ar
          ? 'أدخل الاسم الأول واسم العائلة (حتى 49 حرفاً لكل منهما). الحد الأقصى 50 شخصاً في الدفعة.'
          : 'Enter first and last names (up to 49 characters each); each batch can contain at most 50 people.',
      )
      return
    }
    setPeople([...people, result.data])
    setFirstName('')
    setLastName('')
    setError('')
  }
  function importRows() {
    const rows = paste.split(/\r?\n/).filter((line) => line.trim())
    const parsed = rows.map((line) => {
      const cells = line.split('\t').map((cell) => cell.trim())
      return cells.length === 2
        ? personSchema.safeParse({ firstName: cells[0], lastName: cells[1], role: 'teacher' })
        : null
    })
    if (!rows.length || people.length + rows.length > 50 || parsed.some((item) => !item?.success)) {
      setError(
        ar
          ? 'الصق عمودين: الاسم الأول واسم العائلة، صف لكل شخص، دون عناوين.'
          : 'Paste two columns: first name and last name, one person per row, without headers (up to 50 people).',
      )
      return
    }
    setPeople([...people, ...parsed.flatMap((item) => (item?.success ? [item.data] : []))])
    setPaste('')
    setError('')
  }
  async function submit(batch: Person[]) {
    if (sending.current || !batch.length) return
    sending.current = true
    setState('sending')
    setError('')
    try {
      const payload = invitationRequestSchema.parse({ requestId: requestId.current, people: batch })
      const result = invitationResponseSchema.parse(
        await request('/api/admin/accounts/invite', userId, payload),
      )
      if (result.invitations.length !== batch.length) throw new Error('Incomplete response')
      setInvitations(result.invitations)
      setState('done')
    } catch {
      setState('uncertain')
    } finally {
      sending.current = false
    }
  }
  function message(item: Invitation) {
    if (ar)
      return `مرحباً ${item.firstName} ${item.lastName}،\nهذا رابط الدخول إلى حسابك في وارتق:\n${url}\nاسم المستخدم: ${item.username}\nكلمة المرور المؤقتة: ${item.temporaryPassword}\nعند أول دخول، أدخل رقم هاتفك وتاريخ ميلادك واختر كلمة مرور خاصة بك. يمكنك أيضاً تغيير اسم المستخدم.`
    return `Hello ${item.firstName} ${item.lastName},\nHere is your Wartaq sign-in link:\n${url}\nUsername: ${item.username}\nTemporary password: ${item.temporaryPassword}\nOn your first sign-in, enter your phone number and date of birth and choose a personal password. You can also change your username.`
  }
  return (
    <div className="role-editor invite-accounts">
      <h3>{ar ? 'إنشاء حسابات' : 'Create accounts'}</h3>
      {state === 'editing' && (
        <>
          <div className="role-fields">
            <label>
              {ar ? 'الاسم الأول' : 'First name'}
              <input
                dir="auto"
                maxLength={49}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </label>
            <label>
              {ar ? 'اسم العائلة' : 'Last name'}
              <input
                dir="auto"
                maxLength={49}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </label>
            <label>
              {ar ? 'الدور' : 'Role'}
              <select
                value={role}
                onChange={(e) =>
                  setRole(z.enum(['teacher', 'administrator', 'student']).parse(e.target.value))
                }
              >
                <option value="teacher">{ar ? 'معلم' : 'Teacher'}</option>
                <option value="student">{ar ? 'طالب' : 'Student'}</option>
                <option value="administrator">{ar ? 'مسؤول' : 'Administrator'}</option>
              </select>
            </label>
            {people.length ? (
              <button type="button" className="secondary" onClick={addPerson}>
                {ar ? 'إضافة إلى المعاينة' : 'Add to preview'}
              </button>
            ) : (
              <button
                type="button"
                className="primary"
                disabled={!firstName.trim() || !lastName.trim()}
                onClick={() => {
                  const person = personSchema.safeParse({ firstName, lastName, role })
                  if (!person.success) return
                  setPeople([person.data])
                  void submit([person.data])
                }}
              >
                {ar ? 'إنشاء حساب' : 'Create account'}
              </button>
            )}
          </div>
          <label>
            {ar ? 'لصق من جدول بيانات' : 'Paste from spreadsheet'}
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={4}
              dir="auto"
            />
          </label>
          <p>
            {ar
              ? 'الصق عمودي الاسم الأول واسم العائلة دون عناوين. الدور الافتراضي معلم.'
              : 'Paste first-name and last-name columns without headers. Imported people default to Teacher.'}
          </p>
          <button type="button" className="secondary" onClick={importRows}>
            {ar ? 'معاينة الصفوف' : 'Preview rows'}
          </button>
          {error && <p role="alert">{error}</p>}
          {people.length > 0 && (
            <>
              <h4>{ar ? 'المعاينة' : 'Preview'}</h4>
              <ul>
                {people.map((person, index) => (
                  <li key={index}>
                    <span dir="auto">
                      {person.firstName} {person.lastName}
                    </span>{' '}
                    —{' '}
                    {person.role === 'student'
                      ? ar
                        ? 'طالب'
                        : 'Student'
                      : person.role === 'teacher'
                        ? ar
                          ? 'معلم'
                          : 'Teacher'
                        : ar
                          ? 'مسؤول'
                          : 'Administrator'}{' '}
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setPeople(people.filter((_, i) => i !== index))}
                    >
                      {ar ? 'إزالة' : 'Remove'}
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="primary" onClick={() => void submit(people)}>
                {ar ? 'إنشاء الحسابات' : 'Create accounts'}
              </button>
            </>
          )}
        </>
      )}
      {state === 'sending' && (
        <p role="status">{ar ? 'جارٍ إنشاء الحسابات…' : 'Creating accounts…'}</p>
      )}
      {state === 'uncertain' && (
        <>
          <p role="alert">
            {ar
              ? 'تعذر تأكيد النتيجة. قد تكون الحسابات قد أُنشئت. عد إلى الحسابات وتحقق منها قبل المحاولة مجدداً؛ أعد تعيين كلمات المرور عند الحاجة.'
              : 'The result could not be confirmed. Accounts may have been created. Return to Accounts and check before trying again; reset passwords if needed.'}
          </p>
          <button type="button" className="secondary" onClick={() => void submit(people)}>
            {ar ? 'إعادة المحاولة بأمان' : 'Retry safely'}
          </button>
        </>
      )}
      {state === 'done' && (
        <>
          <p>
            {ar
              ? 'انسخ كل رسالة وأرسلها إلى صاحبها بشكل خاص. ستختفي كلمات المرور عند مغادرة هذه الصفحة.'
              : 'Copy each message and send it privately to its recipient. Passwords disappear when you leave this page.'}
          </p>
          {invitations.map((item, index) => (
            <div key={item.username} className="invite-message">
              <label>
                {item.firstName} {item.lastName}
                <textarea
                  readOnly
                  rows={10}
                  dir="auto"
                  value={message(item)}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(message(item))
                    .then(() => setCopied(index))
                    .catch(() => setCopied(null))
                }
              >
                {copied === index
                  ? ar
                    ? 'تم النسخ'
                    : 'Copied'
                  : ar
                    ? 'نسخ الرسالة'
                    : 'Copy message'}
              </button>
            </div>
          ))}
        </>
      )}
      {state !== 'sending' && (
        <div className="role-actions">
          <button type="button" className="secondary" onClick={done}>
            {ar ? 'العودة إلى الحسابات' : 'Back to accounts'}
          </button>
        </div>
      )}
    </div>
  )
}
