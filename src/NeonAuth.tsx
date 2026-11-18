import { LanguageSwitch } from './i18n'
import { useLanguage } from './useLanguage'
import { useEffect, useRef, useState } from 'react'
import type { NeonAccount } from '../shared/neon'
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
import { InvitationProfileForm } from './InvitationProfile'
import { WorkspaceLoading } from './WorkspaceLoading'
import type { Profile } from './ProfileMenu'
import { WartaqLogo } from './brand/components'
import { AccountChoices } from './AccountChoices'
import { offlineAccess, clearOfflineAccess } from './offlineAccess'
import { OfflineAttendance } from './OfflineAttendance'

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
  samples,
  onSignOut,
}: {
  onSignOut: () => void
  samples: React.ReactNode
  children: (
    userId: string,
    teacher: NeonAccount,
    signOut: () => void,
    profile: Profile,
    sessionExpires: number,
  ) => React.ReactNode
}) {
  const { t, errorMessage, language } = useLanguage()
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
    if (cached && cached.userId !== userId) {
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
    setMode('sign-in')
    setUsernameSignIn(true)
    setError('')
    setPassword('')
    setUsername('')
    setEmail('')
    setPasswordChanged(false)
    setAddingAccount(true)
    setChoosingAccount(false)
  }
  useEffect(() => {
    let leaving = false
    const refreshWorkspace = () => {
      if (leaving) return
      leaving = true
      clearOfflineAccess()
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
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [usernameSignIn, setUsernameSignIn] = useState(
    () => new URLSearchParams(window.location.search).get('login') === 'username',
  )
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [passwordChanged, setPasswordChanged] = useState(false)
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
          if (cause instanceof NeonRequestError && (cause.status === 401 || cause.status === 403)) {
            clearOfflineAccess()
            setOfflineSession(null)
          }
          setAccount({
            userId,
            kind:
              cause instanceof NeonRequestError && (cause.status === 401 || cause.status === 403)
                ? 'denied'
                : 'error',
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
        clearOfflineAccess()
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
        requireLease
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
            {language === 'ar'
              ? '\u0641\u062a\u062d \u0627\u0644\u062d\u0636\u0648\u0631 \u062f\u0648\u0646 \u0627\u062a\u0635\u0627\u0644'
              : 'Open offline attendance'}
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
              {language === 'ar'
                ? '\u0641\u062a\u062d \u0627\u0644\u062d\u0636\u0648\u0631 \u062f\u0648\u0646 \u0627\u062a\u0635\u0627\u0644'
                : 'Open offline attendance'}
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
    const updateInvitation: NonNullable<Profile['updateInvitation']> = async (details) => {
      await request('/api/me/invitation-profile', userId, details, false)
      if (details.newPassword) {
        // Password rotation already revoked this session. Never sign out a newer identity.
        const fresh = await authClient.getSession()
        if (fresh.data?.user.id) {
          resetWorkspace()
          return
        }
        let addedAccount = false
        try {
          addedAccount = sessionStorage.getItem('halaqa-added-account') === userId
          sessionStorage.removeItem('halaqa-added-account')
        } catch {
          /* Continue with the normal sign-in form. */
        }
        if (invitation?.requiresSetup && addedAccount) {
          try {
            const response = await fetch('/api/auth/sign-in/username', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: details.username, password: details.newPassword }),
            })
            if (response.ok) {
              resetWorkspace()
              return
            }
          } catch {
            /* Continue with the normal sign-in form. */
          }
        }
        setAccount(null)
        announceSessionChange()
        setUsername(details.username)
        setPassword('')
        setUsernameSignIn(true)
        setPasswordChanged(true)
        await session.refetch()
      } else {
        setAccountAttempt((value) => value + 1)
      }
    }
    if (invitation?.requiresSetup)
      return (
        <main id="main-content" tabIndex={-1} className="workspace-auth">
          <AuthHeader />
          <InvitationProfileForm
            invitation={invitation}
            update={updateInvitation}
            setup
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
    return children(
      userId,
      account.value,
      signOut,
      {
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
      },
      new Date(session.data?.session.expiresAt ?? 0).getTime(),
    )
  }
  return (
    <main id="main-content" tabIndex={-1} className="workspace-auth">
      <AuthHeader />
      {!addingAccount && <AccountChoices add={addAccount} />}
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
        className="panel space-y-3"
        onSubmit={async (event) => {
          event.preventDefault()
          if (session.isPending || session.error || busy) return
          setBusy(true)
          setError('')
          try {
            if (mode === 'sign-in' && usernameSignIn) {
              const response = await fetch('/api/auth/sign-in/username', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
              })
              if (!response.ok) {
                setError(
                  response.status === 409 ? deviceLimitMessage : 'Invalid username or password.',
                )
                return
              }
            } else {
              const result =
                mode === 'sign-in'
                  ? await authClient.signIn.email({ email, password })
                  : await authClient.signUp.email({ name, email, password })
              if (result.error) {
                setError(
                  result.error.status === 409
                    ? deviceLimitMessage
                    : mode === 'sign-in'
                      ? 'Invalid email or password. Check your details and try again.'
                      : 'Unable to create the account. Check your details and try again.',
                )
                return
              }
            }
            if (addingAccount) {
              try {
                const fresh = await authClient.getSession()
                if (fresh.data?.user.id)
                  sessionStorage.setItem('halaqa-added-account', fresh.data.user.id)
              } catch {
                /* Onboarding falls back to a password prompt if this tab cannot store state. */
              }
              resetWorkspace()
            } else {
              announceSessionChange()
              await session.refetch()
            }
          } catch (cause) {
            const failure = z.object({ error: z.object({ status: z.number() }) }).safeParse(cause)
            setError(
              mode === 'sign-in' && failure.success && failure.data.error.status === 401
                ? 'Invalid email or password. Check your details and try again.'
                : 'The authentication service is unavailable. Please try again.',
            )
          } finally {
            setBusy(false)
          }
        }}
      >
        <h1 className="title">
          {addingAccount
            ? t('Sign in to another account')
            : mode === 'sign-up'
              ? t('Create an account')
              : t('Sign in')}
        </h1>
        {mode === 'sign-up' && (
          <label>
            {t('Name')}
            <input
              required
              autoComplete="name"
              enterKeyHint="next"
              dir="auto"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        {mode === 'sign-in' && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setUsernameSignIn(!usernameSignIn)
              setError('')
            }}
          >
            {usernameSignIn
              ? language === 'ar'
                ? 'تسجيل الدخول بالبريد الإلكتروني'
                : 'Sign in with email'
              : language === 'ar'
                ? 'تسجيل الدخول باسم المستخدم'
                : 'Sign in with username'}
          </button>
        )}
        {mode === 'sign-in' && usernameSignIn ? (
          <label>
            {language === 'ar' ? 'اسم المستخدم' : 'Username'}
            <input
              required
              autoComplete="username"
              autoCapitalize="none"
              dir="ltr"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
        ) : (
          <label>
            {t('Email')}
            <input
              required
              type="email"
              dir="ltr"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="email"
              enterKeyHint="next"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        )}
        <label>
          {t('Password')}
          <input
            required
            type="password"
            dir="ltr"
            enterKeyHint="go"
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {passwordChanged && (
          <p role="status">
            {language === 'ar'
              ? 'تم حفظ بياناتك. سجّل الدخول بكلمة مرورك الجديدة.'
              : 'Details saved. Sign in with your new password.'}
          </p>
        )}
        {error && <p role="alert">{errorMessage(error)}</p>}
        <button className="primary" disabled={busy || session.isPending || Boolean(session.error)}>
          {busy ? t('Please wait…') : mode === 'sign-up' ? t('Create account') : t('Sign in')}
        </button>
        {!addingAccount && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up')
                setError('')
              }}
            >
              {mode === 'sign-up' ? t('Sign in') : t('Create account')}
            </button>
          </div>
        )}
        {mode === 'sign-in' && (
          <p className="muted">
            {language === 'ar'
              ? 'تواصل مع المسؤول لإعادة تعيين كلمة المرور.'
              : 'Contact your administrator to reset your password.'}
          </p>
        )}
        {mode === 'sign-up' && (
          <p className="muted">
            {t('Your manager must approve your account before you can use the app.')}
          </p>
        )}
      </form>
      {!addingAccount && samples}
    </main>
  )
}
