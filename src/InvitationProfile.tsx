import { useState } from 'react'
import { useLanguage } from './useLanguage'
import type { Profile } from './ProfileMenu'
import { NeonRequestError, type InvitationProfile } from './neon'
import { phoneNumber } from './phoneFormat'

export function InvitationSetupForm({
  invitation,
  complete,
  signOut,
}: {
  invitation: InvitationProfile
  complete: (newPassword: string) => Promise<void>
  signOut: () => void
}) {
  const { language } = useLanguage()
  const ar = language === 'ar'
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const identifier = invitation.verifiedPhone ?? invitation.username
  return (
    <form
      className="panel space-y-3"
      onSubmit={async (event) => {
        event.preventDefault()
        if (busy) return
        setBusy(true)
        setFailed(false)
        try {
          await complete(newPassword)
          setNewPassword('')
        } catch {
          setFailed(true)
        } finally {
          setBusy(false)
        }
      }}
    >
      <h2>{ar ? 'اختر كلمة مرور جديدة' : 'Choose a new password'}</h2>
      {identifier && (
        <label>
          {invitation.verifiedPhone
            ? ar
              ? 'رقم الهاتف'
              : 'Phone'
            : ar
              ? 'اسم المستخدم'
              : 'Username'}
          <input readOnly dir="ltr" autoComplete="username" value={identifier} />
        </label>
      )}
      <label>
        {ar ? 'كلمة المرور الجديدة' : 'New password'}
        <input
          required
          minLength={8}
          maxLength={128}
          type="password"
          autoComplete="new-password"
          dir="ltr"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
      </label>
      {failed && (
        <p role="alert">
          {ar
            ? 'تعذر حفظ كلمة المرور. اختر كلمة مرور مختلفة عن كلمة المرور المؤقتة وحاول مجدداً.'
            : 'Could not save your password. Choose a password different from your temporary password and try again.'}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button className="primary" disabled={busy}>
          {busy ? (ar ? 'يرجى الانتظار…' : 'Please wait…') : ar ? 'حفظ البيانات' : 'Save details'}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={signOut}>
          {ar ? 'تسجيل الخروج' : 'Sign out'}
        </button>
      </div>
    </form>
  )
}

export function InvitationProfileForm({
  invitation,
  update,
}: {
  invitation: InvitationProfile
  update: NonNullable<Profile['updateInvitation']>
}) {
  const { language } = useLanguage()
  const ar = language === 'ar'
  const [username, setUsername] = useState(invitation.username)
  const [phone, setPhone] = useState(invitation.phone ?? invitation.verifiedPhone ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault()
        if (busy) return
        const digits = phone.replace(/\D/g, '')
        if (!phoneNumber(phone).href || digits.length < 7 || digits.length > 15) {
          setError(ar ? 'أدخل رقم هاتف صحيحاً.' : 'Enter a valid phone number.')
          return
        }
        setBusy(true)
        setError('')
        setSaved(false)
        try {
          await update({
            username,
            phone,
            currentPassword,
            ...(newPassword ? { newPassword } : {}),
          })
          setCurrentPassword('')
          setNewPassword('')
          setSaved(true)
        } catch (cause) {
          if (cause instanceof NeonRequestError && cause.status === 409) {
            setError(ar ? 'اسم المستخدم مستخدم بالفعل.' : 'That username is already in use.')
          } else
            setError(
              ar
                ? 'تعذر حفظ البيانات. تحقق من كلمة المرور والبيانات وحاول مجدداً.'
                : 'Could not save your details. Check your password and details and try again.',
            )
        } finally {
          setBusy(false)
        }
      }}
    >
      <h2>{ar ? 'البيانات الشخصية' : 'Personal details'}</h2>
      {username !== null && !invitation.verifiedPhone && (
        <label>
          {ar ? 'اسم المستخدم' : 'Username'}
          <input
            required
            minLength={3}
            maxLength={32}
            pattern="[a-z0-9._\-]+"
            autoComplete="username"
            dir="ltr"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
      )}
      <label>
        {ar ? 'رقم الهاتف' : 'Phone'}
        <input
          required
          minLength={3}
          maxLength={40}
          type="tel"
          autoComplete="tel"
          dir="ltr"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </label>
      <label>
        {ar ? 'كلمة المرور الحالية' : 'Current password'}
        <input
          required
          type="password"
          autoComplete="current-password"
          dir="ltr"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </label>
      <label>
        {ar ? 'كلمة المرور الجديدة' : 'New password'}
        <input
          minLength={8}
          maxLength={128}
          type="password"
          autoComplete="new-password"
          dir="ltr"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
      </label>
      <p>
        {ar
          ? 'اترك كلمة المرور الجديدة فارغة للاحتفاظ بكلمة المرور الحالية.'
          : 'Leave the new password blank to keep your current password.'}
      </p>
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">{ar ? 'تم حفظ البيانات.' : 'Details saved.'}</p>}
      <button className="primary" disabled={busy}>
        {busy ? (ar ? 'يرجى الانتظار…' : 'Please wait…') : ar ? 'حفظ البيانات' : 'Save details'}
      </button>
    </form>
  )
}
