import { useEffect, useState } from 'react'
import type { NeonTeacher } from '../shared/neon'
import { z } from 'zod'
import { authClient, getTeacher, NeonRequestError } from './neon'

export function NeonAuth({
  children,
  samples,
}: {
  samples: React.ReactNode
  children: (userId: string, teacher: NeonTeacher, signOut: () => void) => React.ReactNode
}) {
  if (!authClient) return null
  return <ConfiguredAuth samples={samples}>{children}</ConfiguredAuth>
}

function ConfiguredAuth({
  children,
  samples,
}: {
  samples: React.ReactNode
  children: (userId: string, teacher: NeonTeacher, signOut: () => void) => React.ReactNode
}) {
  // The parent only renders this component when the client exists.
  const client = authClient!
  const session = client.useSession()
  const userId = session.data?.user.id
  const [teacher, setTeacher] = useState<{ userId: string; value: NeonTeacher } | null>(null)
  const [approval, setApproval] = useState<{ userId: string; message: string } | null>(null)
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'forgot' | 'reset'>(() =>
    new URLSearchParams(window.location.search).has('token') ? 'reset' : 'sign-in',
  )
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let cancelled = false
    if (userId)
      getTeacher(userId)
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
                  : 'Could not load your teacher account. Please try again.',
            })
        })
    return () => {
      cancelled = true
    }
  }, [userId])
  const signOut = () => {
    setTeacher(null)
    setApproval(null)
    void client.signOut()
  }
  if (session.isPending) return <p>Loading your session…</p>
  if (userId) {
    if (approval?.userId === userId)
      return (
        <div className="panel space-y-3">
          <p role="alert">{approval.message}</p>
          <button className="secondary" onClick={signOut}>
            Sign out
          </button>
        </div>
      )
    if (!teacher || teacher.userId !== userId) return <p>Loading your notebook…</p>
    if (!teacher.value.canRead)
      return (
        <div className="panel space-y-3">
          <p>
            Your account has write-only access. The notebook requires read access; contact your
            manager.
          </p>
          <button className="secondary" onClick={signOut}>
            Sign out
          </button>
        </div>
      )
    return children(userId, teacher.value, signOut)
  }
  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-6 px-6">
      <h1 className="text-4xl font-semibold tracking-tight">Your halaqa, one shared notebook.</h1>
      <p className="text-lg leading-relaxed text-slate-600">
        Record attendance. Leave a note. Keep the next teacher in the loop.
      </p>
      <form
        className="panel space-y-3"
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError('')
          try {
            if (mode === 'forgot') {
              const result = await client.requestPasswordReset({
                email,
                redirectTo: window.location.origin + window.location.pathname,
              })
              setError(
                result.error
                  ? 'Unable to request a reset. Please try again.'
                  : 'If the account exists, a password reset email has been sent.',
              )
            } else if (mode === 'reset') {
              const token = new URLSearchParams(window.location.search).get('token')
              if (!token) throw new Error()
              const result = await client.resetPassword({ newPassword: password, token })
              if (result.error) setError('Unable to reset your password. Request a new link.')
              else {
                window.history.replaceState(null, '', window.location.pathname)
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
            ? 'Create an account'
            : mode === 'forgot' || mode === 'reset'
              ? 'Reset password'
              : 'Sign in'}
        </h2>
        {mode === 'sign-up' && (
          <label>
            Name
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        {mode !== 'reset' && (
          <label>
            Email
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        )}
        {mode !== 'forgot' && (
          <label>
            Password
            <input
              required
              type="password"
              autoComplete={
                mode === 'sign-up' || mode === 'reset' ? 'new-password' : 'current-password'
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {error && <p role="alert">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy
            ? 'Please wait…'
            : mode === 'sign-up'
              ? 'Create account'
              : mode === 'forgot'
                ? 'Send reset email'
                : mode === 'reset'
                  ? 'Update password'
                  : 'Sign in'}
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
            {mode === 'sign-up' ? 'Sign in' : 'Create account'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setMode('forgot')
              setError('')
            }}
          >
            Forgot password?
          </button>
        </div>
        {mode === 'sign-up' && (
          <p className="muted">
            Your manager must approve your account before you can open the notebook.
          </p>
        )}
      </form>
      {samples}
    </main>
  )
}
