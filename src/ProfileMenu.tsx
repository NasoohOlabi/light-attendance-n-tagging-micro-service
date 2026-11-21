import { useEffect, useId, useRef, useState } from 'react'
import { Globe, History, ListChecks, LogOut, Settings, UserRound } from 'lucide-react'
import type { z } from 'zod'
import type { invitationProfileInputSchema } from '../shared/invitations'
import { ThemeChoices } from './i18n'
import { useLanguage } from './useLanguage'
import { setQuery } from './queryState'
import type { InvitationProfile } from './neon'
import { AccountChoices } from './AccountChoices'

export type Profile = {
  name: string
  accounts?: { currentUserId: string; add: () => void }
  image: string | null
  update: (name: string, image?: string | null) => Promise<void>
  invitation?: InvitationProfile
  openChanges?: () => void
  updateInvitation?: (details: z.input<typeof invitationProfileInputSchema>) => Promise<void>
}

export function ProfileMenu({
  profile,
  administrator = false,
  leave,
  sample = false,
  sampleHistory = false,
  disabled = false,
}: {
  profile?: Profile
  administrator?: boolean
  leave: () => void
  sample?: boolean
  sampleHistory?: boolean
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
          {profile?.accounts && <AccountChoices {...profile.accounts} disabled={disabled} />}
          {profile && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setQuery({ view: 'profile' }, true)
              }}
            >
              <UserRound size={18} aria-hidden="true" />{' '}
              {language === 'ar' ? 'إعدادات الملف الشخصي' : 'Profile settings'}
            </button>
          )}
          {profile?.openChanges && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setOpen(false)
                profile.openChanges?.()
              }}
            >
              <ListChecks size={18} aria-hidden="true" />{' '}
              {language === 'ar' ? 'تغييراتي' : 'My changes'}
            </button>
          )}
          <div className="preference-group">
            <span>{language === 'ar' ? 'المظهر' : 'Theme'}</span>
            <ThemeChoices />
          </div>
          <div className="preference-group">
            <span>
              <Globe size={16} aria-hidden="true" /> {language === 'ar' ? 'اللغة' : 'Language'}
            </span>
            <div className="preference-choices languages">
              <button
                type="button"
                lang="en"
                aria-pressed={language === 'en'}
                onClick={() => setLanguage('en')}
              >
                English
              </button>
              <button
                type="button"
                lang="ar"
                aria-pressed={language === 'ar'}
                onClick={() => setLanguage('ar')}
              >
                العربية
              </button>
            </div>
          </div>
          {administrator && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setQuery({ view: 'settings', student: '', settingsSection: '' }, true)
              }}
            >
              <Settings size={18} aria-hidden="true" />{' '}
              {language === 'ar' ? 'الإعدادات' : 'Settings'}
            </button>
          )}
          {sampleHistory && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setQuery({ view: 'history', tab: '' }, true)
              }}
            >
              <History size={18} aria-hidden="true" /> {t('History & corrections')}
            </button>
          )}
          <button type="button" disabled={disabled} onClick={leave}>
            <LogOut size={18} aria-hidden="true" /> {sample ? t('Close session') : t('Sign out')}
          </button>
        </div>
      )}
    </div>
  )
}
