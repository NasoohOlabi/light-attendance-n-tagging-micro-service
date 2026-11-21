import { LanguageSwitch } from './i18n'
import { useLanguage } from './useLanguage'
import { useEffect, useRef, useState } from 'react'
import type { NeonAccount } from '../shared/neon'
import type {
  invitationProfileInputSchema,
  invitationSetupInputSchema,
} from '../shared/invitations'
import { z } from 'zod'
import {
  AccessDeniedEvent,
  authClient,
  getAccount,
  NeonRequestError,
  request,
  announceSessionChange,
  resetWorkspace,
  sessionChangeEvent,
  sessionChangeSource,
} from './neon'
import { InvitationSetupForm } from './InvitationProfile'
import { WorkspaceLoading } from './WorkspaceLoading'
import type { Profile } from './ProfileMenu'
import { WartaqLogo } from './brand/components'
import { AccountChoices } from './AccountChoices'
import { offlineAccess, clearOfflineAccess } from './offlineAccess'
import { OfflineAttendance } from './OfflineAttendance'
import './auth.css'

const deviceLimitMessage = 'Five accounts are signed in. Sign out of one to add another.'

function AuthHeader() {
  const { language } = useLanguage()
  return (
    <header className="workspace-auth-header">
      <a
        href={window.location.pathname}
        aria-label={language === 'ar' ? 'الصفحة الرئيسية' : 'Home'}
      >
        <WartaqLogo />
      </a>
      <LanguageSwitch />
    </header>
  )
}

export function NeonAuth({
  children,
  onSignOut,
}: {
  onSignOut: () => void
  children: (
    userId: string,
    teacher: NeonAccount,
    signOut: () => void,
    profile: Profile,
  ) => React.ReactNode
}) {
  const { t, errorMessage, language } = useLanguage()
  const openOfflineLabel = language === 'ar' ? 'فتح الدفتر دون اتصال' : 'Open offline notebook'
  const session = authClient.useSession()
  const userId = session.data?.user.id
  const [offlineSession, setOfflineSession] = useState(() =>
    !navigator.onLine ? offlineAccess() : null,
  )
  const [account, setAccount] = useState<
    | { kind: 'ready'; userId: string; value: NeonAccount }
    | { kind: 'denied' | 'error'; userId: string; message: string }
    | null
  >(null)
  useEffect(() => {
    if (session.isPending || session.error || !navigator.onLine) return
    const cached = offlineAccess()
    if (cached && userId && cached.userId !== userId) {
      clearOfflineAccess()
      // oxlint-disable-next-line react/set-state-in-effect
      setOfflineSession(null)
    }
  }, [session.isPending, session.error, userId])
  const [logout, setLogout] = useState<'idle' | 'pending' | 'failed'>('idle')
  const [accountAttempt, setAccountAttempt] = useState(0)
  const [addingAccount, setAddingAccount] = useState(false)
  const [choosingAccount, setChoosingAccount] = useState(false)
  const addAccount = () => {
    clearOfflineAccess()
    setError('')
    setPassword('')
    setLoginIdentifier('')
    setAddingAccount(true)
    setChoosingAccount(false)
  }
  useEffect(() => {
    let leaving = false
    const refreshWorkspace = () => {
      if (leaving) return
      leaving = true
      window.location.replace(window.location.pathname + '?page=app')
    }
    const changed = (event: StorageEvent) => {
      if (event.key === sessionChangeEvent) refreshWorkspace()
    }
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload()
    }
    window.addEventListener('pageshow', restored)
    window.addEventListener('storage', changed)
    let channel: BroadcastChannel | undefined
    try {
      channel = new BroadcastChannel(sessionChangeEvent)
      channel.onmessage = (event: MessageEvent<unknown>) => {
        if (event.data !== sessionChangeSource) refreshWorkspace()
      }
    } catch {
      /* BroadcastChannel can be unavailable. */
    }
    return () => {
      window.removeEventListener('storage', changed)
      window.removeEventListener('pageshow', restored)
      channel?.close()
    }
  }, [])
  const [loginIdentifier, setLoginIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [stalled, setStalled] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const retryGeneration = useRef(0)
  useEffect(() => {
    if (!session.isPending && !retrying) return
    const timer = window.setTimeout(() => setStalled(true), 10000)
    return () => window.clearTimeout(timer)
  }, [session.isPending, retrying, attempt])
  if (stalled && !session.isPending && !retrying) setStalled(false)
  useEffect(() => {
    let cancelled = false
    let timer = 0
    if (userId)
      Promise.race([
        getAccount(userId),
        new Promise<never>((_, reject) => {
          timer = window.setTimeout(() => reject(new Error('timeout')), 15000)
        }),
      ])
        .then((value) => {
          window.clearTimeout(timer)
          if (cancelled) return
          if (value.role === 'student' || !value.canRead || !value.canWrite) {
            clearOfflineAccess()
            setOfflineSession(null)
          }
          setAccount({ kind: 'ready', userId, value })
        })
        .catch((cause: unknown) => {
          window.clearTimeout(timer)
          if (cancelled) return
          if (cause instanceof NeonRequestError && cause.status === 403) {
            clearOfflineAccess()
            setOfflineSession(null)
          }
          setAccount({
            userId,
            kind: cause instanceof NeonRequestError && cause.status === 403 ? 'denied' : 'error',
            message:
              cause instanceof NeonRequestError
                ? cause.message
                : 'The request failed. Please try again.',
          })
        })
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [userId, accountAttempt])
  useEffect(() => {
    const denied = (event: Event) => {
      if (event instanceof AccessDeniedEvent && event.userId === userId) {
        if (event.status === 403) clearOfflineAccess()
        setAccount({
          userId,
          kind: 'denied',
          message: new NeonRequestError(event.status).message,
        })
      }
    }
    window.addEventListener(AccessDeniedEvent.eventName, denied)
    return () => window.removeEventListener(AccessDeniedEvent.eventName, denied)
  }, [userId])
  const signOut = async () => {
    clearOfflineAccess()
    setLogout('pending')
    try {
      const result = await authClient.signOut({
        fetchOptions: {
          signal: AbortSignal.timeout(15000),
          headers: { 'X-User-Id': userId ?? '' },
        },
      })
      if (result.error) {
        setLogout('failed')
        return
      }
      clearOfflineAccess()
      announceSessionChange()
      onSignOut()
    } catch {
      setLogout('failed')
    }
  }
  const offline = offlineSession ?? (!navigator.onLine ? offlineAccess() : null)
  if (offline)
    return (
      <OfflineAttendance
        userId={offline.userId}
        actor={offline.actor}
        close={() => {
          setOfflineSession(null)
          if (!navigator.onLine) window.location.href = window.location.pathname
        }}
      />
    )
  if (logout === 'pending') return <WorkspaceLoading message={t('Signing out…')} />
  if (logout === 'failed')
    return (
      <main id="main-content" tabIndex={-1} className="workspace-auth panel space-y-3">
        <p role="alert">{t('Could not confirm sign-out. Please try again.')}</p>
        <button className="secondary" onClick={signOut}>
          {t('Sign out')}
        </button>
      </main>
    )
  if ((session.isPending || retrying) && !stalled)
    return <WorkspaceLoading message={t('Loading your session…')} />
  if (session.error || stalled)
    return (
      <main id="main-content" tabIndex={-1} className="workspace-auth panel space-y-3">
        <AuthHeader />
        <p role="alert">{t('Could not check your session. Please try again.')}</p>
        {(session.error || stalled) && offlineAccess() && (
          <button className="secondary" onClick={() => setOfflineSession(offlineAccess())}>
            {openOfflineLabel}
          </button>
        )}
        <button
          className="secondary"
          onClick={() => {
            const generation = ++retryGeneration.current
            setStalled(false)
            setRetrying(true)
            setAttempt((value) => value + 1)
            void session
              .refetch()
              .catch(() => {})
              .finally(() => {
                if (retryGeneration.current === generation) setRetrying(false)
              })
          }}
        >
          {t('Try again')}
        </button>
      </main>
    )
  if (userId && !addingAccount) {
    if (choosingAccount)
      return (
        <main id="main-content" tabIndex={-1} className="workspace-auth panel space-y-3">
          <AuthHeader />
          <AccountChoices currentUserId={userId} add={addAccount} />
          <button type="button" className="secondary" onClick={() => setChoosingAccount(false)}>
            {t('Cancel')}
          </button>
        </main>
      )
    if (account?.userId === userId && account.kind !== 'ready')
      return (
        <main id="main-content" tabIndex={-1} className="workspace-auth panel space-y-3">
          <AuthHeader />
          <p role="alert">{errorMessage(account.message)}</p>
          {account.kind === 'error' && offlineAccess()?.userId === userId && (
            <button className="secondary" onClick={() => setOfflineSession(offlineAccess())}>
              {openOfflineLabel}
            </button>
          )}
          {account.kind === 'error' && (
            <button
              className="secondary"
              onClick={() => {
                setAccount(null)
                setAccountAttempt((value) => value + 1)
              }}
            >
              {t('Try again')}
            </button>
          )}
          <button className="secondary" onClick={() => setChoosingAccount(true)}>
            {language === 'ar' ? 'تبديل الحساب' : 'Switch account'}
          </button>
          <button className="secondary" onClick={signOut}>
            {t('Sign out')}
          </button>
        </main>
      )
    if (!account || account.userId !== userId || account.kind !== 'ready')
      return <WorkspaceLoading message={t('Checking your access…')} />
    const invitation = account.value.invitationProfile
    const updateInvitation = async (
      details:
        z.input<typeof invitationProfileInputSchema> | z.input<typeof invitationSetupInputSchema>,
    ) => {
      await request('/api/me/invitation-profile', userId, details, false)
      setAccountAttempt((value) => value + 1)
      if (details.newPassword) announceSessionChange()
    }
    if (invitation?.requiresSetup)
      return (
        <main id="main-content" tabIndex={-1} className="workspace-auth">
          <AuthHeader />
          <InvitationSetupForm
            key={userId}
            invitation={invitation}
            complete={(newPassword) => updateInvitation({ newPassword })}
            signOut={signOut}
          />
          <button className="secondary" onClick={() => setChoosingAccount(true)}>
            {language === 'ar' ? 'تبديل الحساب' : 'Switch account'}
          </button>
        </main>
      )
    if (!account.value.canRead)
      return (
        <main id="main-content" tabIndex={-1} className="workspace-auth panel space-y-3">
          <AuthHeader />
          <p>
            {t(
              'Your account has write-only access. Contact your manager for permission to view records.',
            )}
          </p>
          <button className="secondary" onClick={() => setChoosingAccount(true)}>
            {language === 'ar' ? 'تبديل الحساب' : 'Switch account'}
          </button>
          <button className="secondary" onClick={signOut}>
            {t('Sign out')}
          </button>
        </main>
      )
    return children(userId, account.value, signOut, {
      invitation,
      accounts: { currentUserId: userId, add: addAccount },
      updateInvitation: invitation ? updateInvitation : undefined,
      name: session.data?.user.name ?? '',
      image: session.data?.user.image ?? null,
      update: async (name, image) => {
        const result = await authClient.updateUser(
          { name, ...(image === undefined ? {} : { image }) },
          { headers: { 'X-User-Id': userId } },
        )
        if (result.error) throw new Error('Could not save profile')
        await session.refetch()
      },
    })
  }
  return (
    <main id="main-content" tabIndex={-1} className="workspace-auth auth-welcome">
      <AuthHeader />
      {!addingAccount && <AccountChoices add={addAccount} />}
      {!addingAccount && offlineAccess() && (
        <button className="secondary" onClick={() => setOfflineSession(offlineAccess())}>
          {openOfflineLabel}
        </button>
      )}

      {addingAccount && (
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => {
            setAddingAccount(false)
            setError('')
            setPassword('')
          }}
        >
          {t('Cancel')}
        </button>
      )}
      <form
        aria-busy={busy}
        className="panel space-y-3 auth-form"
        onSubmit={async (event) => {
          event.preventDefault()
          if (session.isPending || session.error || busy) return
          setBusy(true)
          setError('')
          try {
            const response = await fetch('/api/auth/sign-in/phone', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone: loginIdentifier, password }),
            })
            if (!response.ok) {
              setError(
                response.status === 409 ? deviceLimitMessage : 'Invalid phone number or password.',
              )
              return
            }
            setPassword('')
            if (addingAccount) {
              resetWorkspace()
            } else {
              announceSessionChange()
              await session.refetch()
            }
          } catch (cause) {
            const failure = z.object({ error: z.object({ status: z.number() }) }).safeParse(cause)
            setError(
              failure.success && failure.data.error.status === 401
                ? 'Invalid phone number or password.'
                : 'The authentication service is unavailable. Please try again.',
            )
          } finally {
            setBusy(false)
          }
        }}
      >
        <h1 className="title">{addingAccount ? t('Sign in to another account') : t('Sign in')}</h1>
        <label>
          {language === 'ar' ? 'رقم الهاتف' : 'Phone number'}
          <input
            required
            type="tel"
            autoComplete="username"
            dir="ltr"
            placeholder="09xx xxx xxx / +963 9xx xxx xxx"
            aria-describedby="phone-hint"
            value={loginIdentifier}
            onChange={(event) => setLoginIdentifier(event.target.value)}
          />
        </label>
        <span id="phone-hint">
          {language === 'ar'
            ? 'يمكن أن يبدأ الرقم السوري بـ 09 أو +9639.'
            : 'Syrian numbers can start with 09 or +9639.'}
        </span>
        <label>
          {t('Password')}
          <input
            required
            type="password"
            dir="ltr"
            enterKeyHint="go"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert">
            {error === 'Invalid phone number or password.'
              ? language === 'ar'
                ? 'رقم الهاتف أو كلمة المرور غير صحيحة.'
                : error
              : errorMessage(error)}
          </p>
        )}
        <button
          className="primary auth-sign-in"
          disabled={busy || session.isPending || Boolean(session.error)}
        >
          {busy ? t('Please wait…') : t('Sign in')}
        </button>
        <p className="muted">
          {language === 'ar'
            ? 'تواصل مع المسؤول لإعادة تعيين كلمة المرور.'
            : 'Contact your administrator to reset your password.'}
        </p>
      </form>
    </main>
  )
}
