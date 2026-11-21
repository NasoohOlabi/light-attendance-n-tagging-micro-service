import { useEffect, useRef, useState } from 'react'
import { UserRound } from 'lucide-react'
import { useLanguage } from './useLanguage'
import { setQuery } from './queryState'
import { ProfileMenu, type Profile } from './ProfileMenu'
import { WorkspaceNavigation } from './WorkspaceNavigation'
import { WartaqLogo } from './brand/components'
import { InvitationProfileForm } from './InvitationProfile'

async function prepareImage(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024)
    throw new Error('invalid')
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height))
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('invalid')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const image = canvas.toDataURL('image/jpeg', 0.8)
    if (image.length > 120_000) throw new Error('invalid')
    return image
  } finally {
    bitmap.close()
  }
}

export function ProfileSettings({
  profile,
  signOut,
  role,
}: {
  profile: Profile
  signOut: () => void
  role: 'administrator' | 'teacher' | 'student'
}) {
  const { language, t } = useLanguage()
  const ar = language === 'ar'
  const [name, setName] = useState(profile.name)
  const [image, setImage] = useState(profile.image)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const imageGeneration = useRef(0)
  useEffect(
    () => () => {
      imageGeneration.current++
    },
    [],
  )
  const form = (
    <section className="profile-settings panel">
      <button
        type="button"
        className="secondary"
        onClick={() => setQuery({ view: 'notebook' }, true)}
      >
        {ar ? 'العودة' : 'Back'}
      </button>
      <h1>{ar ? 'إعدادات الملف الشخصي' : 'Profile settings'}</h1>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy || preparing) return
          setBusy(true)
          setError('')
          setSaved(false)
          try {
            await profile.update(name.trim(), image === profile.image ? undefined : image)
            setSaved(true)
          } catch {
            setError(
              ar
                ? 'تعذر حفظ الملف الشخصي. حاول مرة أخرى.'
                : 'Could not save your profile. Please try again.',
            )
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="profile-photo-row">
          <div className="profile-photo">
            {image && image !== failedImage ? (
              <img src={image} alt="" onError={() => setFailedImage(image)} />
            ) : (
              <UserRound size={36} aria-hidden="true" />
            )}
          </div>
          <div>
            <label className="secondary profile-upload">
              {ar ? 'اختيار صورة' : 'Choose photo'}
              <input
                disabled={busy}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={async (event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (!file) return
                  const generation = ++imageGeneration.current
                  setError('')
                  setSaved(false)
                  setPreparing(true)
                  try {
                    const result = await prepareImage(file)
                    if (imageGeneration.current === generation) setImage(result)
                  } catch {
                    if (imageGeneration.current === generation)
                      setError(
                        ar
                          ? 'اختر صورة PNG أو JPEG أو WebP بحجم لا يتجاوز ٨ ميغابايت.'
                          : 'Choose a PNG, JPEG or WebP image up to 8 MB.',
                      )
                  } finally {
                    if (imageGeneration.current === generation) setPreparing(false)
                  }
                }}
              />
            </label>
            {(image || preparing) && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  imageGeneration.current++
                  setPreparing(false)
                  setImage(null)
                  setSaved(false)
                }}
              >
                {ar ? 'إزالة الصورة' : 'Remove photo'}
              </button>
            )}
          </div>
        </div>
        <label>
          {t('Name')}
          <input
            disabled={busy}
            required
            maxLength={120}
            autoComplete="name"
            dir="auto"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setSaved(false)
            }}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        {saved && <p role="status">{ar ? 'تم حفظ الملف الشخصي.' : 'Profile saved.'}</p>}
        <button type="submit" className="primary" disabled={busy || preparing || !name.trim()}>
          {busy || preparing ? t('Please wait…') : t('Save changes')}
        </button>
      </form>
      {profile.invitation && profile.updateInvitation && (
        <InvitationProfileForm
          invitation={profile.invitation}
          role={role}
          update={profile.updateInvitation}
        />
      )}
    </section>
  )
  if (role === 'student')
    return (
      <main id="main-content" className="role-page" tabIndex={-1}>
        <header className="role-header">
          <WartaqLogo />
          <ProfileMenu profile={profile} leave={signOut} />
        </header>
        {form}
      </main>
    )
  return (
    <div className="workspace">
      <WorkspaceNavigation
        administrator={role === 'administrator'}
        profile={profile}
        leave={signOut}
      />
      <main id="main-content" tabIndex={-1} className="workspace-main">
        {form}
      </main>
    </div>
  )
}
