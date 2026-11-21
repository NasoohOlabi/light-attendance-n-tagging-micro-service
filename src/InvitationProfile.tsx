import { useState } from 'react'
import { useLanguage } from './useLanguage'
import type { Profile } from './ProfileMenu'
import type { InvitationProfile } from './neon'
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
  const phone = invitation.verifiedPhone
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
      {phone && (
        <label>
          {ar ? 'رقم الهاتف' : 'Phone'}
          <input readOnly dir="ltr" autoComplete="username" value={phone} />
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
            phone,
            currentPassword,
            ...(newPassword ? { newPassword } : {}),
          })
          setCurrentPassword('')
          setNewPassword('')
          setSaved(true)
        } catch {
          setError(
            ar
              ? 'تعذر حفظ البيانات.'
              : 'Could not save your details. Check your password and details and try again.',
          )
        } finally {
          setBusy(false)
        }
      }}
    >
      <h2>{ar ? 'البيانات الشخصية' : 'Personal details'}</h2>
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
