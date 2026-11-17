import { ProfileMenu, type Profile } from './ProfileMenu'
import { BookOpen, House } from 'lucide-react'
import { useLanguage, type TranslationKey } from './i18n'
import { setQuery, useQueryState, type Tab } from './queryState'
import { WartaqIcon, WartaqLogo } from './brand/components'

export const tabs: { id: Exclude<Tab, 'dashboard'>; label: TranslationKey }[] = [
  { id: 'attendance', label: 'Attendance' },
  { id: 'notes', label: 'Notes' },
  { id: 'roster', label: 'Students' },
  { id: 'summary', label: 'Summary' },
  { id: 'history', label: 'History & corrections' },
]

export function WorkspaceNavigation({
  administrator,
  assigned,
  profile,
  leave,
  sample,
  disabled,
}: {
  administrator: boolean
  assigned: boolean
  profile?: Profile
  leave: () => void
  sample?: boolean
  disabled?: boolean
}) {
  const { t, language } = useLanguage()
  const query = useQueryState()
  return (
    <aside className="workspace-rail">
      <div className="workspace-brand">
        <WartaqLogo />
        <ProfileMenu
          profile={profile}
          administrator={administrator}
          leave={leave}
          sample={sample}
          disabled={disabled}
        />
      </div>
      <nav aria-label={t('Notebook')} data-courses={administrator}>
        <button
          className={query.view === 'notebook' && query.tab === 'dashboard' ? 'active' : ''}
          aria-label={language === 'ar' ? 'الرئيسية' : 'Dashboard'}
          aria-current={query.view === 'notebook' && query.tab === 'dashboard' ? 'page' : undefined}
          onClick={() => setQuery({ tab: 'dashboard', view: 'notebook' }, true)}
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
              setQuery(
                {
                  tab: tab.id,
                  view: 'notebook',
                  ...(tab.id === 'roster'
                    ? { course: '', student: '' }
                    : assigned
                      ? {}
                      : { student: '' }),
                  tag: '',
                },
                true,
              )
            }
          >
            <WartaqIcon name={tab.id === 'roster' ? 'students' : tab.id} />
            <span
              className={
                ['attendance', 'history'].includes(tab.id) ? 'workspace-tab-long' : undefined
              }
            >
              {t(tab.label)}
            </span>
            {['attendance', 'history'].includes(tab.id) && (
              <span className="workspace-tab-short" aria-hidden="true">
                {tab.id === 'attendance'
                  ? language === 'ar'
                    ? 'الحضور'
                    : 'Attend'
                  : language === 'ar'
                    ? 'السجل'
                    : 'History'}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="workspace-identity">
        <span>{t('Attendance & notes · الحضور والملاحظات')}</span>
      </div>
    </aside>
  )
}
