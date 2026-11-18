import { useRef, useState } from 'react'
import type { z } from 'zod'
import { request } from './neon'
import { invitationRequestSchema, invitationResponseSchema } from '../shared/invitations'

const personSchema = invitationRequestSchema.shape.people.element
type Person = z.infer<typeof personSchema>
type Invitation = z.infer<typeof invitationResponseSchema>['invitations'][number]
type InviteState =
  | { kind: 'editing' }
  | { kind: 'sending' }
  | { kind: 'uncertain'; person: Person }
  | { kind: 'done'; invitation: Invitation }

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
  const [state, setState] = useState<InviteState>({ kind: 'editing' })
  const [copied, setCopied] = useState(false)
  const sending = useRef(false)
  const requestId = useRef(crypto.randomUUID())
  const url = `${window.location.origin}/?page=app&login=username`
  async function submit(person: Person) {
    if (sending.current) return
    sending.current = true
    setState({ kind: 'sending' })
    try {
      const payload = invitationRequestSchema.parse({
        requestId: requestId.current,
        people: [person],
      })
      const result = invitationResponseSchema.parse(
        await request('/api/admin/accounts/invite', userId, payload),
      )
      const [invitation] = result.invitations
      if (!invitation || result.invitations.length !== 1) throw new Error('Unexpected response')
      setState({ kind: 'done', invitation })
    } catch {
      setState({ kind: 'uncertain', person })
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
    <div className="role-editor">
      <h3>{ar ? 'إنشاء حسابات' : 'Create accounts'}</h3>
      {state.kind === 'editing' && (
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
              onChange={(e) => setRole(personSchema.shape.role.parse(e.target.value))}
            >
              <option value="teacher">{ar ? 'معلم' : 'Teacher'}</option>
              <option value="student">{ar ? 'طالب' : 'Student'}</option>
              <option value="administrator">{ar ? 'مسؤول' : 'Administrator'}</option>
            </select>
          </label>
          <button
            type="button"
            className="primary"
            disabled={!firstName.trim() || !lastName.trim()}
            onClick={() => {
              const person = personSchema.safeParse({ firstName, lastName, role })
              if (person.success) void submit(person.data)
            }}
          >
            {ar ? 'إنشاء حساب' : 'Create account'}
          </button>
        </div>
      )}
      {state.kind === 'sending' && (
        <p role="status">{ar ? 'جارٍ إنشاء الحساب…' : 'Creating account…'}</p>
      )}
      {state.kind === 'uncertain' && (
        <>
          <p role="alert">
            {ar
              ? 'تعذر تأكيد النتيجة. ربما أُنشئ الحساب. عد إلى الحسابات وتحقق منه قبل المحاولة مجدداً، وأعد تعيين كلمة المرور عند الحاجة.'
              : 'The result could not be confirmed. The account may have been created. Return to Accounts and check before trying again. Reset the password if needed.'}
          </p>
          <button type="button" className="secondary" onClick={() => void submit(state.person)}>
            {ar ? 'إعادة المحاولة بأمان' : 'Retry safely'}
          </button>
        </>
      )}
      {state.kind === 'done' && (
        <>
          <p>
            {ar
              ? 'انسخ الرسالة وأرسلها إلى صاحبها بشكل خاص. ستختفي كلمة المرور عند مغادرة هذه الصفحة.'
              : 'Copy the message and send it privately to its recipient. The password disappears when you leave this page.'}
          </p>
          <div className="invite-message">
            <label>
              {state.invitation.firstName} {state.invitation.lastName}
              <textarea
                readOnly
                rows={10}
                dir="auto"
                value={message(state.invitation)}
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                void navigator.clipboard
                  ?.writeText(message(state.invitation))
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false))
              }
            >
              {copied ? (ar ? 'تم النسخ' : 'Copied') : ar ? 'نسخ الرسالة' : 'Copy message'}
            </button>
          </div>
        </>
      )}
      {state.kind !== 'sending' && (
        <div className="role-actions">
          <button type="button" className="secondary" onClick={done}>
            {ar ? 'العودة إلى الحسابات' : 'Back to accounts'}
          </button>
        </div>
      )}
    </div>
  )
}
