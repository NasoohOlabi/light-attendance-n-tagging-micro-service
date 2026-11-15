import { LanguageSwitch, useLanguage } from './i18n'
import { useEffect, useState } from 'react'
import type { NeonAccount } from '../shared/neon'
import { z } from 'zod'
import { authClient, getAccount, NeonRequestError } from './neon'
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
  initialResetToken,
  onSignOut,
  onResetComplete,
}: {
  initialResetToken?: string
  onSignOut: () => void
  onResetComplete: () => void
  samples: React.ReactNode
  children: (userId: string, teacher: NeonAccount, signOut: () => void) => React.ReactNode
}) {
  if (!authClient) return null
  return (
    <ConfiguredAuth
      samples={samples}
      initialResetToken={initialResetToken}
      onSignOut={onSignOut}
      onResetComplete={onResetComplete}
    >
      {children}
    </ConfiguredAuth>
  )
}

function ConfiguredAuth({
  children,
  samples,
  initialResetToken,
  onSignOut,
  onResetComplete,
}: {
  initialResetToken?: string
  onSignOut: () => void
  onResetComplete: () => void
  samples: React.ReactNode
  children: (userId: string, teacher: NeonAccount, signOut: () => void) => React.ReactNode
}) {
  const { t, errorMessage } = useLanguage()
  // The parent only renders this component when the client exists.
  const client = authClient!
  const session = client.useSession()
  const userId = session.data?.user.id
  const [teacher, setTeacher] = useState<{ userId: string; value: NeonAccount } | null>(null)
  const [approval, setApproval] = useState<{ userId: string; message: string } | null>(null)
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'forgot' | 'reset'>(() =>
    initialResetToken ? 'reset' : 'sign-in',
  )
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [leaves, setLeaves] = useState(0)
  const [stalled, setStalled] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!session.isPending) return
    const timer = window.setTimeout(() => setStalled(true), 10000)
    return () => window.clearTimeout(timer)
  }, [session.isPending, attempt])
  useEffect(() => {
    if (!session.isPending) setStalled(false)
  }, [session.isPending])
  useEffect(() => {
    let cancelled = false
    if (userId)
      getAccount(userId)
        .then((value) => {
          if (!cancelled) setTeacher({ userId, value })
        })
        .catch((cause: unknown) => {
          if (!cancelled)
            setApproval({
              userId,
              message:
                cause instanceof NeonRequestError
                  ? cause.message
                  : 'Could not load your account. Please try again.',
            })
        })
    return () => {
      cancelled = true
    }
  }, [userId])
  useEffect(() => {
    const denied = (event: Event) => {
      if (userId && event instanceof CustomEvent) {
        setTeacher(null)
        setApproval({
          userId,
          message: new NeonRequestError(event.detail === 401 ? 401 : 403).message,
        })
      }
    }
    window.addEventListener('neon-access-denied', denied)
    return () => window.removeEventListener('neon-access-denied', denied)
  }, [userId])
  const signOut = () => {
    setTeacher(null)
    setApproval(null)
    void client.signOut()
    onSignOut()
  }
  if (userId) {
    if (approval?.userId === userId)
      return (
        <main id="main-content" tabIndex={-1} className="workspace-auth panel space-y-3">
          <AuthHeader />
          <p role="alert">{errorMessage(approval.message)}</p>
          <button className="secondary" onClick={signOut}>
            {t('Sign out')}
          </button>
        </main>
      )
    if (!teacher || teacher.userId !== userId)
      return (
        <main id="main-content" tabIndex={-1} className="workspace-auth">
          <AuthHeader />
          <WaitingBookmark
            leaves={leaves}
            setLeaves={setLeaves}
            message={t('Loading your notebook…')}
          />
          <button className="secondary" onClick={signOut}>
            {t('Sign out')}
          </button>
          {samples}
        </main>
      )
    if (!teacher.value.canRead)
      return (
        <main id="main-content" tabIndex={-1} className="workspace-auth panel space-y-3">
          <AuthHeader />
          <p>
            {t(
              'Your account has write-only access. The notebook requires read access; contact your manager.',
            )}
          </p>
          <button className="secondary" onClick={signOut}>
            {t('Sign out')}
          </button>
        </main>
      )
    return children(userId, teacher.value, signOut)
  }
  return (
    <main id="main-content" tabIndex={-1} className="workspace-auth">
      <AuthHeader />
      <h1 className="text-4xl font-semibold tracking-tight">
        {t('Your halaqa, one shared notebook.')}
      </h1>
      <p className="text-lg leading-relaxed text-slate-600">
        {t('Record attendance. Leave a note. Keep the next teacher in the loop.')}
      </p>
      {(session.isPending || session.error) && (
        <WaitingBookmark
          leaves={leaves}
          setLeaves={setLeaves}
          message={
            session.error || stalled
              ? t('Could not check your session. Try again or explore a sample.')
              : t('Loading your session…')
          }
          retry={
            session.error || stalled
              ? () => {
                  setStalled(false)
                  setAttempt((value) => value + 1)
                  void session.refetch()
                }
              : undefined
          }
        />
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
            if (mode === 'forgot') {
              setError('Password reset is unavailable. Contact your manager.')
            } else if (mode === 'reset') {
              const token = initialResetToken
              if (!token) throw new Error()
              const result = await client.resetPassword({ newPassword: password, token })
              if (result.error) setError('Unable to reset your password. Request a new link.')
              else {
                window.history.replaceState(null, '', window.location.pathname + '?page=app')
                onResetComplete()
                setMode('sign-in')
                setError('Password updated. Please sign in.')
              }
            } else {
              const result =
                mode === 'sign-in'
                  ? await client.signIn.email({ email, password })
                  : await client.signUp.email({ name, email, password })
              if (result.error)
                setError(
                  mode === 'sign-in'
                    ? 'Invalid email or password. Check your details and try again.'
                    : 'Unable to create the account. Check your details and try again.',
                )
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
        <h2 className="title">
          {mode === 'sign-up'
            ? t('Create an account')
            : mode === 'forgot' || mode === 'reset'
              ? t('Reset password')
              : t('Sign in')}
        </h2>
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
        {mode !== 'reset' && (
          <label>
            {t('Email')}
            <input
              required
              type="email"
              dir="ltr"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="email"
              enterKeyHint={mode === 'forgot' ? 'go' : 'next'}
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        )}
        {mode !== 'forgot' && (
          <label>
            {t('Password')}
            <input
              required
              type="password"
              dir="ltr"
              enterKeyHint="go"
              autoComplete={
                mode === 'sign-up' || mode === 'reset' ? 'new-password' : 'current-password'
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {error && <p role="alert">{errorMessage(error)}</p>}
        <button className="primary" disabled={busy || session.isPending || Boolean(session.error)}>
          {busy
            ? t('Please wait…')
            : mode === 'sign-up'
              ? t('Create account')
              : mode === 'forgot'
                ? t('Send reset email')
                : mode === 'reset'
                  ? t('Update password')
                  : t('Sign in')}
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
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setMode('forgot')
              setError('')
            }}
          >
            {t('Forgot password?')}
          </button>
        </div>
        {mode === 'sign-up' && (
          <p className="muted">
            {t('Your manager must approve your account before you can open the notebook.')}
          </p>
        )}
      </form>
      {samples}
    </main>
  )
}

function WaitingBookmark({
  leaves,
  setLeaves,
  message,
  retry,
}: {
  leaves: number
  setLeaves: React.Dispatch<React.SetStateAction<number>>
  message: string
  retry?: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className="auth-restoring">
      <button
        type="button"
        className="auth-bookmark"
        aria-label={t('Grow the bookmark')}
        onClick={() => setLeaves((count) => (count + 1) % 4)}
      >
        <svg aria-hidden="true" viewBox="0 0 48 58" fill="none">
          <path d="M24 47V22" stroke="currentColor" strokeWidth="2" />
          <path d="M24 29C13 29 12 22 13 19C20 19 24 23 24 29Z" fill="currentColor" />
          {leaves > 0 && (
            <path d="M24 37C35 37 36 30 35 27C28 27 24 31 24 37Z" fill="currentColor" />
          )}
          {leaves > 1 && (
            <path d="M24 22C17 18 18 12 24 8C30 12 31 18 24 22Z" fill="currentColor" />
          )}
          {leaves > 2 && <circle cx="24" cy="6" r="2" fill="currentColor" />}
        </svg>
      </button>
      <div>
        <p role={retry ? 'alert' : 'status'}>{message}</p>
        <small>{t('Tap the bookmark to grow it')}</small>
        {retry && (
          <button type="button" className="secondary" onClick={retry}>
            {t('Try again')}
          </button>
        )}
      </div>
    </div>
  )
}
