import { LanguageSwitch } from './i18n'
import { useLanguage } from './useLanguage'
import { useEffect, useRef, useState } from 'react'
import type { NeonAccount } from '../shared/neon'
import { z } from 'zod'
import { AccessDeniedEvent, authClient, getAccount, NeonRequestError, request } from './neon'
import { InvitationProfileForm } from './InvitationProfile'
import { WorkspaceLoading } from './WorkspaceLoading'
import type { Profile } from './ProfileMenu'
import { WartaqLogo } from './brand/components'

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
  ) => React.ReactNode
}) {
  const { t, errorMessage, language } = useLanguage()
  const session = authClient.useSession()
  const userId = session.data?.user.id
  const [account, setAccount] = useState<
    | { kind: 'ready'; userId: string; value: NeonAccount }
    | { kind: 'denied' | 'error'; userId: string; message: string }
    | null
  >(null)
  const [logout, setLogout] = useState<'idle' | 'pending' | 'failed'>('idle')
  const [accountAttempt, setAccountAttempt] = useState(0)
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
          if (!cancelled) setAccount({ kind: 'ready', userId, value })
        })
        .catch((cause: unknown) => {
          window.clearTimeout(timer)
          if (!cancelled)
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
    setLogout('pending')
    try {
      const result = await authClient.signOut({
        fetchOptions: { signal: AbortSignal.timeout(15000) },
      })
      if (result.error) {
        setLogout('failed')
        return
      }
      onSignOut()
    } catch {
      setLogout('failed')
    }
  }
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
  if (userId) {
    if (account?.userId === userId && account.kind !== 'ready')
      return (
        <main id="main-content" tabIndex={-1} className="workspace-auth panel space-y-3">
          <AuthHeader />
          <p role="alert">{errorMessage(account.message)}</p>
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
        setAccount(null)
        await authClient.signOut()
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
          <button className="secondary" onClick={signOut}>
            {t('Sign out')}
          </button>
        </main>
      )
    return children(userId, account.value, signOut, {
      invitation,
      updateInvitation: invitation ? updateInvitation : undefined,
      name: session.data?.user.name ?? '',
      image: session.data?.user.image ?? null,
      update: async (name, image) => {
        const result = await authClient.updateUser({
          name,
          ...(image === undefined ? {} : { image }),
        })
        if (result.error) throw new Error('Could not save profile')
        await session.refetch()
      },
    })
  }
  return (
    <main id="main-content" tabIndex={-1} className="workspace-auth">
      <AuthHeader />
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
                  language === 'ar'
                    ? 'اسم المستخدم أو كلمة المرور غير صحيحة.'
                    : 'Invalid username or password.',
                )
              } else {
                await session.refetch()
              }
              return
            }
            const result =
              mode === 'sign-in'
                ? await authClient.signIn.email({ email, password })
                : await authClient.signUp.email({ name, email, password })
            if (result.error)
              setError(
                mode === 'sign-in'
                  ? 'Invalid email or password. Check your details and try again.'
                  : 'Unable to create the account. Check your details and try again.',
              )
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
        <h1 className="title">{mode === 'sign-up' ? t('Create an account') : t('Sign in')}</h1>
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
      {samples}
    </main>
  )
}
