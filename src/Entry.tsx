import { lazy, Suspense } from 'react'
import { z } from 'zod'
import { App } from './App'
import { loadSession } from './session'

const DraftGallery = lazy(() =>
  import('./design-drafts/Gallery').then(({ DraftGallery }) => ({ default: DraftGallery })),
)

export function ApplicationEntry() {
  const design = z
    .enum(['a', 'b'])
    .safeParse(new URLSearchParams(window.location.search).get('design')).data
  if (!design) return <App initialSession={loadSession()} />
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
