import { Globe, Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { LanguageContext, useLanguage, type Language } from './useLanguage'

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return localStorage.getItem('halaqa-language') === 'ar' ? 'ar' : 'en'
    } catch {
      return 'en'
    }
  })
  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
    try {
      localStorage.setItem('halaqa-language', language)
    } catch {
      /* Preference is optional. */
    }
  }, [language])
  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}
function subscribeTheme(listener: () => void) {
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme-preference'],
  })
  return () => observer.disconnect()
}
function themePreference() {
  const value = document.documentElement.dataset.themePreference
  return value === 'light' || value === 'dark' ? value : 'system'
}
function setTheme(value: 'system' | 'light' | 'dark') {
  document.documentElement.dataset.themePreference = value
  document.documentElement.dataset.theme =
    value === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : value
  try {
    if (value === 'system') localStorage.removeItem('halaqa-theme')
    else localStorage.setItem('halaqa-theme', value)
  } catch {
    /* Preference is optional. */
  }
}
export function ThemeChoices() {
  const { language } = useLanguage()
  const theme = useSyncExternalStore(subscribeTheme, themePreference)
  const choices = [
    { value: 'system', label: language === 'ar' ? 'الجهاز' : 'Device', Icon: Monitor },
    { value: 'light', label: language === 'ar' ? 'فاتح' : 'Light', Icon: Sun },
    { value: 'dark', label: language === 'ar' ? 'داكن' : 'Dark', Icon: Moon },
  ] as const
  return (
    <div className="preference-choices">
      {choices.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
        >
          <Icon size={17} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
export function ThemeSelect() {
  const { language } = useLanguage()
  const theme = useSyncExternalStore(subscribeTheme, themePreference)
  return (
    <label className="theme-select">
      <span className="theme-select-icon" aria-hidden="true">
        {theme === 'dark' ? (
          <Moon size={18} />
        ) : theme === 'light' ? (
          <Sun size={18} />
        ) : (
          <Monitor size={18} />
        )}
      </span>
      <span className="sr-only">
        {language === 'ar' ? '\u0627\u0644\u0645\u0638\u0647\u0631' : 'Color theme'}
      </span>
      <select
        aria-label={language === 'ar' ? '\u0627\u0644\u0645\u0638\u0647\u0631' : 'Color theme'}
        value={theme}
        onChange={(event) => {
          const value = event.target.value
          if (value !== 'light' && value !== 'dark' && value !== 'system') return
          setTheme(value)
        }}
      >
        <option value="system">
          {language === 'ar' ? '\u0627\u0644\u062c\u0647\u0627\u0632' : 'Device'}
        </option>
        <option value="light">{language === 'ar' ? '\u0641\u0627\u062a\u062d' : 'Light'}</option>
        <option value="dark">{language === 'ar' ? '\u062f\u0627\u0643\u0646' : 'Dark'}</option>
      </select>
    </label>
  )
}
export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage()
  const target = language === 'en' ? 'ar' : 'en'
  return (
    <div className="language-switch" role="group" aria-label="Language / اللغة">
      <ThemeSelect />
      <button
        type="button"
        className="icon-button"
        lang={target}
        aria-label={target === 'ar' ? 'العربية' : 'English'}
        title={target === 'ar' ? 'التبديل إلى العربية' : 'Switch to English'}
        onClick={() => setLanguage(target)}
      >
        <Globe size={20} strokeWidth={1.6} aria-hidden="true" focusable="false" />
      </button>
    </div>
  )
}
