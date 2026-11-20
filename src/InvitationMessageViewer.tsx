import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { invitationResponseSchema } from '../shared/invitations'
import { CopyableInvitation } from './InviteAccounts'
import { request } from './neon'
import { useLanguage } from './useLanguage'
import { setQuery } from './queryState'

type ViewerState =
  | { kind: 'ready' | 'loading' | 'unavailable' }
  | { kind: 'done'; invitations: ReturnType<typeof invitationResponseSchema.parse>['invitations'] }

export function InvitationMessageViewer({
  userId,
  requestId,
}: {
  userId: string
  requestId: string
}) {
  const { language } = useLanguage()
  const ar = language === 'ar'
  const [state, setState] = useState<ViewerState>(
    requestId ? { kind: 'ready' } : { kind: 'unavailable' },
  )
  const generation = useRef(0)
  const sending = useRef(false)

  useEffect(() => {
    const invalidate = () => {
      generation.current++
    }
    const clear = () => {
      invalidate()
      flushSync(() => {
        setState((previous) => (previous.kind === 'ready' ? previous : { kind: 'unavailable' }))
      })
    }
    window.addEventListener('pagehide', clear)
    return () => {
      invalidate()
      window.removeEventListener('pagehide', clear)
    }
  }, [])

  async function reveal() {
    if (sending.current) return
    sending.current = true
    const current = generation.current
    setState({ kind: 'loading' })
    try {
      const result = invitationResponseSchema.parse(
        await request('/api/admin/accounts/invite-message', userId, { requestId }),
      )
      if (generation.current !== current) return
      setState({ kind: 'done', invitations: result.invitations })
    } catch {
      if (generation.current === current) setState({ kind: 'unavailable' })
    } finally {
      sending.current = false
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="workspace-auth panel space-y-3">
      <h1>{ar ? 'رسالة الدعوة الخاصة' : 'Private invitation message'}</h1>
      {state.kind === 'ready' && (
        <button className="primary" onClick={() => void reveal()}>
          {ar ? 'إظهار الدعوة' : 'Reveal invitation'}
        </button>
      )}
      {state.kind === 'loading' && <p role="status">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
      {state.kind === 'unavailable' && (
        <p role="alert">
          {ar
            ? 'الرسالة غير متاحة أو انتهت صلاحيتها. تحقق من الحسابات وأعد تعيين كلمة المرور عند الحاجة.'
            : 'The message is unavailable or expired. Check accounts and reset the password if needed.'}
        </p>
      )}
      {state.kind === 'done' && (
        <>
          <p>
            {ar
              ? 'أرسل كل رسالة إلى صاحب الحساب بشكل خاص. ستختفي الرسائل عند مغادرة الصفحة.'
              : 'Send each message privately to its recipient. The messages disappear when you leave this page.'}
          </p>
          {state.invitations.map((invitation) => (
            <CopyableInvitation key={invitation.username} invitation={invitation} ar={ar} />
          ))}
        </>
      )}
      <button
        className="secondary"
        onClick={() =>
          setQuery({ view: 'settings', settingsSection: '', account: '', inviteMessage: '' }, true)
        }
      >
        {ar ? 'العودة إلى الحسابات' : 'Back to accounts'}
      </button>
    </main>
  )
}
