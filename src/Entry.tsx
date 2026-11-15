import { lazy, Suspense } from 'react'
import { z } from 'zod'
import { App } from './App'
import { sanitizedSearch } from './queryState'

const DraftGallery = lazy(() =>
  import('./design-drafts/Gallery').then(({ DraftGallery }) => ({ default: DraftGallery })),
)

const entryQuery = new URLSearchParams(window.location.search)
const design = z.enum(['a', 'b']).safeParse(entryQuery.get('design')).data
const search = sanitizedSearch(window.location.search)
if (design) search.set('design', design)
const hash = new URLSearchParams(window.location.hash.slice(1)).has('access')
  ? ''
  : window.location.hash
window.history.replaceState(
  null,
  '',
  window.location.pathname + (search.size ? `?${search}` : '') + hash,
)
try {
  sessionStorage.removeItem('halaqa-access-v1')
} catch {
  /* Storage is optional. */
}
window.addEventListener('hashchange', () => {
  if (new URLSearchParams(window.location.hash.slice(1)).has('access'))
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
})

export function ApplicationEntry() {
  if (!design) return <App />
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
