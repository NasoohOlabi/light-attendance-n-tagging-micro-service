import { useEffect, useState } from 'react'
import { CourtyardDraft } from './a'
import { DeskDraft } from './b'
import type { DraftLanguage } from './shared'
import '../brand/index.css'
import './gallery.css'

type Design = 'a' | 'b'

export function DraftGallery({ initialDesign }: { initialDesign: Design }) {
  const [design, setDesign] = useState<Design>(initialDesign)
  const [language, setLanguage] = useState<DraftLanguage>('ar')
  const arabic = language === 'ar'

  useEffect(() => {
    const html = document.documentElement
    const original = { lang: html.lang, dir: html.dir, title: document.title }
    return () => {
      html.lang = original.lang
      html.dir = original.dir
      document.title = original.title
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = arabic ? 'rtl' : 'ltr'
    document.title = arabic ? 'مسودات تصميم وارتق' : 'Wartaq design drafts'
  }, [language, arabic])

  useEffect(() => {
    function syncDesign() {
      const next = new URLSearchParams(window.location.search).get('design')
      if (next === 'a' || next === 'b') setDesign(next)
    }
    window.addEventListener('popstate', syncDesign)
    return () => window.removeEventListener('popstate', syncDesign)
  }, [])

  function selectDesign(next: Design) {
    setDesign(next)
    window.history.replaceState(null, '', `${window.location.pathname}?design=${next}`)
  }

  return (
    <div className="wartaq-drafts" lang={language} dir={arabic ? 'rtl' : 'ltr'}>
      <a className="wartaq-skip-link" href="#draft-content">
        {arabic ? 'انتقل إلى محتوى التصميم' : 'Skip to design content'}
      </a>
      <header className="wartaq-review-bar">
        <div className="wartaq-review-heading">
          <strong>{arabic ? 'مسودتان للتصميم' : 'Two design drafts'}</strong>
          <span>{arabic ? 'بيانات تجريبية للمراجعة' : 'Sample data for review'}</span>
        </div>
        <div className="wartaq-review-controls">
          <div
            className="wartaq-review-switch"
            role="group"
            aria-label={arabic ? 'التصميم' : 'Design'}
          >
            <button type="button" aria-pressed={design === 'a'} onClick={() => selectDesign('a')}>
              {arabic ? 'أ / رحاب' : 'A / Rihab'}
            </button>
            <button type="button" aria-pressed={design === 'b'} onClick={() => selectDesign('b')}>
              {arabic ? 'ب / مداد' : 'B / Midad'}
            </button>
          </div>
          <div
            className="wartaq-review-switch"
            role="group"
            aria-label={arabic ? 'اللغة' : 'Language'}
          >
            <button type="button" lang="ar" aria-pressed={arabic} onClick={() => setLanguage('ar')}>
              العربية
            </button>
            <button
              type="button"
              lang="en"
              aria-pressed={!arabic}
              onClick={() => setLanguage('en')}
            >
              English
            </button>
          </div>
          <a href={window.location.pathname}>
            {arabic ? 'العودة إلى الدفتر الحالي' : 'Return to current notebook'}
          </a>
        </div>
      </header>
      <div id="draft-content" tabIndex={-1}>
        {design === 'a' ? (
          <CourtyardDraft language={language} />
        ) : (
          <DeskDraft language={language} />
        )}
      </div>
    </div>
  )
}
