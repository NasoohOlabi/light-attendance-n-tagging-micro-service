import { ProfileMenu, type Profile } from './ProfileMenu'
import { BookOpen, House } from 'lucide-react'
import { useLanguage, type TranslationKey } from './i18n'
import { navigateNotebook, setQuery, useQueryState, type Tab } from './queryState'
import { WartaqIcon, WartaqLogo } from './brand/components'

const tabs: { id: Exclude<Tab, 'dashboard'>; label: TranslationKey }[] = [
  { id: 'attendance', label: 'Attendance' },
  { id: 'roster', label: 'Students' },
  { id: 'summary', label: 'Summary' },
]

export function WorkspaceNavigation({
  administrator,
  courseName,
  defaultCourse,
  assigned,
  profile,
  leave,
  sample,
  sampleHistory,
  disabled,
}: {
  administrator: boolean
  courseName?: string
  defaultCourse?: string
  assigned: boolean
  profile?: Profile
  leave: () => void
  sample?: boolean
  sampleHistory?: boolean
  disabled?: boolean
}) {
  const { t, language } = useLanguage()
  const query = useQueryState()
  return (
    <aside className="workspace-rail">
      <div className="workspace-brand">
        <div className="workspace-brand-name">
          <WartaqLogo />
          {courseName && (
            <span
              className="workspace-course-name"
              title={courseName}
              aria-label={courseName}
              dir="auto"
            >
              {courseName.match(
                /^\u0648\u0627\u0631\u062a\u0642\s+([0-9\u0660-\u0669\u06f0-\u06f9]+)$/u,
              )?.[1] ?? courseName}
            </span>
          )}
        </div>
        <ProfileMenu
          profile={profile}
          administrator={administrator}
          leave={leave}
          sample={sample}
          sampleHistory={sampleHistory}
          disabled={disabled}
        />
      </div>
      <nav aria-label={t('Main navigation')} data-courses={administrator}>
        <button
          className={query.view === 'notebook' && query.tab === 'dashboard' ? 'active' : ''}
          aria-label={language === 'ar' ? 'الرئيسية' : 'Dashboard'}
          aria-current={query.view === 'notebook' && query.tab === 'dashboard' ? 'page' : undefined}
          onClick={() => navigateNotebook('dashboard', defaultCourse)}
        >
          <House size={20} strokeWidth={1.6} aria-hidden="true" focusable="false" />
          <span className="workspace-tab-long">{language === 'ar' ? 'الرئيسية' : 'Dashboard'}</span>
          <span className="workspace-tab-short" aria-hidden="true">
            {language === 'ar' ? 'الرئيسية' : 'Home'}
          </span>
        </button>
        {administrator && (
          <button
            className={
              query.view === 'courses' || (query.view === 'add-student' && !!query.courseView)
                ? 'active'
                : ''
            }
            aria-current={
              query.view === 'courses' || (query.view === 'add-student' && !!query.courseView)
                ? 'page'
                : undefined
            }
            onClick={() => setQuery({ view: 'courses', courseView: '', course: '', q: '' }, true)}
          >
            <BookOpen size={20} strokeWidth={1.6} aria-hidden="true" focusable="false" />
            <span>{language === 'ar' ? 'الدورات' : 'Courses'}</span>
          </button>
        )}
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={query.view === 'notebook' && query.tab === tab.id ? 'active' : ''}
            aria-label={t(tab.label)}
            aria-current={query.view === 'notebook' && query.tab === tab.id ? 'page' : undefined}
            onClick={() =>
              navigateNotebook(tab.id, defaultCourse, {
                ...(tab.id === 'roster' || !assigned ? { student: '' } : {}),
              })
            }
          >
            <WartaqIcon name={tab.id === 'roster' ? 'students' : tab.id} />
            <span className={tab.id === 'attendance' ? 'workspace-tab-long' : undefined}>
              {t(tab.label)}
            </span>
            {tab.id === 'attendance' && (
              <span className="workspace-tab-short" aria-hidden="true">
                {language === 'ar' ? 'الحضور' : 'Attend'}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="workspace-identity">
        <span>{t('Attendance & notes')}</span>
      </div>
    </aside>
  )
}
