import { lazy, Suspense, useEffect, useState } from 'react'
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
  const [demo, setDemo] = useState<'editable' | 'assigned' | null>(null)
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
  const openDemo = (kind: 'editable' | 'assigned') => {
    setDemo(kind)
    navigatePage('app')
  }
  const goHome = () => {
    setDemo(null)
    navigatePage('home')
  }
  if (query.page === 'home')
    return (
      <HomePage
        onOpenApp={() => {
          setDemo(null)
          navigatePage('app')
        }}
        onExplore={() => openDemo('editable')}
        onExploreAssigned={() => openDemo('assigned')}
      />
    )
  return (
    <Suspense fallback={<WorkspaceLoading message={t('Loading your session…')} />}>
      <Workspace demo={demo} openDemo={openDemo} goHome={goHome} />
    </Suspense>
  )
}

function SkipText() {
  const { t } = useLanguage()
  return t('Skip to main content')
}
