import { useEffect, useRef } from 'react'
import { ProfileMenu, type Profile } from './ProfileMenu'
import { BookOpen, House } from 'lucide-react'
import { useLanguage, type TranslationKey } from './useLanguage'
import { navigateNotebook, setQuery, useQueryState, type Tab } from './queryState'
import { WartaqIcon, WartaqLogo } from './brand/components'

const tabs: { id: Exclude<Tab, 'dashboard'>; label: TranslationKey }[] = [
  { id: 'attendance', label: 'Attendance' },
  { id: 'roster', label: 'Students' },
]

export function WorkspaceNavigation({
  administrator,
  courseName,
  courses,
  currentCourse,
  chooseDefault,
  defaultCourse,
  profile,
  leave,
  disabled,
}: {
  administrator: boolean
  courseName?: string
  courses?: { id: string; name: string; closed?: boolean }[]
  currentCourse?: string
  chooseDefault?: (course: string) => void
  defaultCourse?: string
  profile?: Profile
  leave: () => void
  disabled?: boolean
}) {
  const { t, language } = useLanguage()
  const query = useQueryState()
  const notebookCourse =
    query.view === 'notebook' ||
    query.view === 'history' ||
    query.view === 'student' ||
    query.view === 'changes'
      ? query.courseScope === 'all'
        ? ''
        : query.courseScope || defaultCourse
      : defaultCourse
  const roster = query.view === 'notebook' && query.tab === 'roster'
  const courseNumber = courseName?.match(/^وارتق\s+([0-9\u0660-\u0669\u06f0-\u06f9]+)$/u)?.[1]
  const switcher = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    function dismiss(event: MouseEvent | KeyboardEvent) {
      const element = switcher.current
      if (!element?.open) return
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        element.open = false
        element.querySelector('summary')?.focus()
      } else if (
        event instanceof MouseEvent &&
        event.target instanceof Node &&
        !element.contains(event.target)
      ) {
        element.open = false
      }
    }
    document.addEventListener('click', dismiss)
    document.addEventListener('keydown', dismiss)
    return () => {
      document.removeEventListener('click', dismiss)
      document.removeEventListener('keydown', dismiss)
    }
  }, [])
  return (
    <aside className="workspace-rail">
      <div className="workspace-brand">
        <WartaqLogo />
        <ProfileMenu
          profile={profile}
          administrator={administrator}
          leave={leave}
          disabled={disabled}
        />
        {courses && chooseDefault && (
          <details
            ref={switcher}
            className="workspace-course-switcher"
            data-numbered={courseNumber !== undefined}
          >
            <summary
              className="workspace-course-name"
              aria-label={language === 'ar' ? 'تغيير الدورة' : 'Change course'}
              aria-description={courseName}
              title={courseName}
            >
              <span dir="auto">
                {courseNumber ??
                  courseName ??
                  (roster
                    ? language === 'ar'
                      ? 'جميع الطلاب'
                      : 'All students'
                    : query.view === 'history'
                      ? language === 'ar'
                        ? 'السجل السابق'
                        : 'Previous'
                      : language === 'ar'
                        ? 'اختر دورة'
                        : 'Choose course')}
              </span>
            </summary>
            <div className="workspace-course-menu">
              {[
                roster
                  ? {
                      id: 'all',
                      name: language === 'ar' ? 'جميع الطلاب' : 'All students',
                    }
                  : {
                      id: 'none',
                      name: language === 'ar' ? 'السجل السابق / بلا دورة' : 'Previous / no course',
                    },
                ...courses.filter(
                  (course) =>
                    query.view === 'history' ||
                    !course.closed ||
                    course.id === currentCourse ||
                    course.id === defaultCourse,
                ),
              ].map((course) => (
                <button
                  key={course.id}
                  type="button"
                  aria-pressed={
                    (roster && (!currentCourse || currentCourse === 'none')
                      ? 'all'
                      : currentCourse || 'none') === course.id
                  }
                  onClick={(event) => {
                    setQuery(
                      { course: course.id, ...(query.view === 'student' ? {} : { student: '' }) },
                      true,
                    )
                    const details = event.currentTarget.closest('details')
                    details?.removeAttribute('open')
                    details?.querySelector('summary')?.focus()
                  }}
                  dir="auto"
                >
                  {course.name}
                </button>
              ))}
              {currentCourse !== 'all' &&
                (!roster || !!query.course) &&
                !courses.find((course) => course.id === currentCourse)?.closed &&
                query.course !== (defaultCourse || '') && (
                  <button
                    type="button"
                    onClick={(event) => {
                      chooseDefault(currentCourse === 'none' ? '' : currentCourse || '')
                      const details = event.currentTarget.closest('details')
                      details?.removeAttribute('open')
                      details?.querySelector('summary')?.focus()
                    }}
                  >
                    {language === 'ar' ? 'تعيين كافتراضية' : 'Make default'}
                  </button>
                )}
            </div>
          </details>
        )}
      </div>
      <nav aria-label={t('Main navigation')} data-courses={administrator}>
        <button
          className={query.view === 'notebook' && query.tab === 'dashboard' ? 'active' : ''}
          aria-label={language === 'ar' ? 'الرئيسية' : 'Dashboard'}
          aria-current={query.view === 'notebook' && query.tab === 'dashboard' ? 'page' : undefined}
          onClick={() => navigateNotebook('dashboard', notebookCourse)}
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
            className={
              query.view === 'notebook' &&
              (query.tab === tab.id || (tab.id === 'attendance' && query.tab === 'summary'))
                ? 'active'
                : ''
            }
            aria-label={t(tab.label)}
            aria-current={
              query.view === 'notebook' &&
              (query.tab === tab.id || (tab.id === 'attendance' && query.tab === 'summary'))
                ? 'page'
                : undefined
            }
            onClick={() =>
              navigateNotebook(
                tab.id,
                tab.id === 'roster' && query.courseScope === 'all' ? 'all' : notebookCourse,
                {
                  ...(tab.id === 'roster' ? { student: '' } : {}),
                },
              )
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
