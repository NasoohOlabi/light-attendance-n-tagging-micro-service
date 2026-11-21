import { lazy, Suspense, useEffect } from 'react'
import { LanguageProvider } from './i18n'
import { useLanguage } from './useLanguage'
import { navigatePage, useQueryState } from './queryState'
import { HomePage } from './HomePage'
import { InstallApp } from './InstallApp'
import { AppUpdate } from './AppUpdate'
import { WorkspaceLoading } from './WorkspaceLoading'

const Workspace = lazy(() => import('./Workspace'))

export function App() {
  return (
    <LanguageProvider>
      <div className="wartaq-site">
        <a className="skip-link" href="#main-content">
          <SkipText />
        </a>
        <InstallApp />
        <AppUpdate />
        <AppContent />
      </div>
    </LanguageProvider>
  )
}

function AppContent() {
  const { language, t } = useLanguage()
  const query = useQueryState()
  useEffect(() => {
    document.title =
      query.page === 'home'
        ? language === 'ar'
          ? 'وارتق · دورة تلاوة القرآن'
          : 'Wartaq · Quran recitation course'
        : language === 'ar'
          ? 'وارتق'
          : 'Wartaq'
  }, [language, query.page])
  if (query.page === 'home') return <HomePage onOpenApp={() => navigatePage('app')} />
  return (
    <Suspense fallback={<WorkspaceLoading message={t('Loading your session…')} />}>
      <Workspace goHome={() => navigatePage('home')} />
    </Suspense>
  )
}

function SkipText() {
  const { t } = useLanguage()
  return t('Skip to main content')
}
