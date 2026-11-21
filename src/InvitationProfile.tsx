import { useState } from 'react'
import type { NeonAccount } from '../shared/neon'
import { useLanguage } from './useLanguage'
import type { Profile } from './ProfileMenu'
import type { InvitationProfile } from './neon'
import { phoneNumber } from './phoneFormat'

export function InvitationProfileForm({
  invitation,
  role,
  update,
  setup = false,
  signOut,
}: {
  invitation: InvitationProfile
  role: NeonAccount['role']
  update: NonNullable<Profile['updateInvitation']>
  setup?: boolean
  signOut?: () => void
}) {
  const { language } = useLanguage()
  const ar = language === 'ar'
  const needsBirthDate = role !== 'teacher'
  const [phone, setPhone] = useState(invitation.phone ?? invitation.verifiedPhone ?? '')
  const [latestBirthDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [birthDate, setBirthDate] = useState(invitation.birthDate ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className={setup ? 'panel space-y-3' : 'space-y-3'}
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
            ...(needsBirthDate ? { birthDate } : {}),
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
      <h2>
        {setup
          ? ar
            ? 'أكمل بياناتك'
            : 'Complete your details'
          : ar
            ? 'البيانات الشخصية'
            : 'Personal details'}
      </h2>
      {setup && (
        <p>
          {ar
            ? 'أدخل كلمة المرور المؤقتة واختر كلمة مرورك الشخصية لاستخدامها في مرات الدخول القادمة.'
            : 'Enter your temporary password and choose a personal password for future sign-ins.'}
        </p>
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
      {needsBirthDate && (
        <label>
          {ar ? 'تاريخ الميلاد' : 'Date of birth'}
          <input
            required
            type="date"
            max={latestBirthDate}
            autoComplete="bday"
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
          />
        </label>
      )}
      <label>
        {setup
          ? ar
            ? 'كلمة المرور المؤقتة'
            : 'Temporary password'
          : ar
            ? 'كلمة المرور الحالية'
            : 'Current password'}
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
          required={setup}
          minLength={8}
          maxLength={128}
          type="password"
          autoComplete="new-password"
          dir="ltr"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
      </label>
      {!setup && (
        <p>
          {ar
            ? 'اترك كلمة المرور الجديدة فارغة للاحتفاظ بكلمة المرور الحالية. تغييرها يتطلب تسجيل الدخول مجدداً.'
            : 'Leave the new password blank to keep your current password. Changing it requires signing in again.'}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">{ar ? 'تم حفظ البيانات.' : 'Details saved.'}</p>}
      <button className="primary" disabled={busy}>
        {busy ? (ar ? 'يرجى الانتظار…' : 'Please wait…') : ar ? 'حفظ البيانات' : 'Save details'}
      </button>
      {signOut && (
        <button type="button" className="secondary" onClick={signOut}>
          {ar ? 'تسجيل الخروج' : 'Sign out'}
        </button>
      )}
    </form>
  )
}
