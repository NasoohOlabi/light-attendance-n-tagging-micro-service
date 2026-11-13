import { lazy, Suspense } from 'react'
import { z } from 'zod'
import { App } from './App'
import { loadSession } from './session'
import { setQuery } from './queryState'

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
  .enum(['#features', '#how-it-works', '#questions', '#enrollment'])
  .safeParse(window.location.hash).data
const privateEntry = new URLSearchParams(window.location.hash.slice(1)).has('access')
const initialSession = design ? null : loadSession()
if (privateEntry && initialSession?.access && !initialResetToken) setQuery({ page: 'app' })
if (homeAnchor && !design && !initialResetToken)
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
