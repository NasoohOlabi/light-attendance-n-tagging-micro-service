import { useEffect, useId, useRef, useState } from 'react'
import { UserRound } from 'lucide-react'
import { ThemeSelect, useLanguage } from './i18n'
import { setQuery } from './queryState'

export type Profile = { name: string; image: string | null }

export function ProfileMenu({
  profile,
  administrator = false,
  leave,
  sample = false,
  disabled = false,
}: {
  profile?: Profile
  administrator?: boolean
  leave: () => void
  sample?: boolean
  disabled?: boolean
}) {
  const { language, setLanguage, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const panelId = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  return (
    <div
      className="profile-menu"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="profile-trigger"
        aria-label={
          language === 'ar'
            ? '\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0634\u062e\u0635\u064a'
            : 'Profile'
        }
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        {profile?.image && profile.image !== failedImage ? (
          <img src={profile.image} alt="" onError={() => setFailedImage(profile.image)} />
        ) : (
          <UserRound size={21} aria-hidden="true" />
        )}
      </button>
      {open && (
        <div className="profile-panel" id={panelId}>
          {profile?.name && <strong dir="auto">{profile.name}</strong>}
          <ThemeSelect />
          <button type="button" onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}>
            {language === 'en' ? '\u0627\u0644\u0639\u0631\u0628\u064a\u0629' : 'English'}
          </button>
          {administrator && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setQuery({ view: 'settings' }, true)
              }}
            >
              {language === 'ar'
                ? '\u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a'
                : 'Settings'}
            </button>
          )}
          <button type="button" disabled={disabled} onClick={leave}>
            {sample ? t('Close session') : t('Sign out')}
          </button>
        </div>
      )}
    </div>
  )
}
