import { lazy, Suspense } from 'react'
import { z } from 'zod'
import { App } from './App'
import { loadSession } from './session'

const DraftGallery = lazy(() =>
  import('./design-drafts/Gallery').then(({ DraftGallery }) => ({ default: DraftGallery })),
)

// Read once before session loading removes private URL capabilities. StrictMode
// can render twice; it must not consume a password-reset token a second time.
const entryQuery = new URLSearchParams(window.location.search)
const design = z.enum(['a', 'b']).safeParse(entryQuery.get('design')).data
const initialResetToken = design
  ? undefined
  : z.string().min(1).max(4096).safeParse(entryQuery.get('token')).data
const homeAnchor = z
  .enum(['#features', '#how-it-works', '#questions'])
  .safeParse(window.location.hash).data
const initialSession = design ? null : loadSession()
if (homeAnchor && !design && !initialSession?.access && !initialResetToken)
  window.history.replaceState(
    null,
    '',
    window.location.pathname + window.location.search + homeAnchor,
  )

export function ApplicationEntry() {
  if (!design && initialSession)
    return <App initialSession={initialSession} initialResetToken={initialResetToken} />
  if (!design) return null
  return (
    <Suspense
      fallback={
        <p role="status" lang="ar" dir="rtl">
          جارٍ تحميل مسودات وارتق…
        </p>
      }
    >
      <DraftGallery initialDesign={design} />
    </Suspense>
  )
}
