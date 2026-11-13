import { useState, useSyncExternalStore, type MouseEvent } from 'react'
import { useLanguage } from './i18n'
import './install.css'

type InstallPrompt = Event & { prompt: () => unknown; userChoice: unknown }
let promptEvent: InstallPrompt | null = null
let installed = false
let initialized = false
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

function isInstallPrompt(event: Event): event is InstallPrompt {
  return 'prompt' in event && typeof event.prompt === 'function' && 'userChoice' in event
}

function isStandalone() {
  return (
    installed ||
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && navigator.standalone === true)
  )
}

export function initializeInstallPrompt() {
  if (initialized) return
  initialized = true
  window.addEventListener('beforeinstallprompt', (event) => {
    if (!isInstallPrompt(event)) return
    event.preventDefault()
    promptEvent = event
    notify()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    promptEvent = null
    notify()
  })
  window.matchMedia('(display-mode: standalone)').addEventListener('change', notify)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshot() {
  return isStandalone() ? 'installed' : promptEvent ? 'ready' : 'instructions'
}

const copy = {
  en: {
    install: 'Install Wartaq',
    opening: 'Opening install prompt…',
    close: 'Close install help',
    ios: 'In Safari, tap Share, then Add to Home Screen.',
    other: 'Open your browser menu and choose Install app or Add to Home screen, if available.',
    dismissed: 'Installation was dismissed. You can use your browser menu to install later.',
    accepted: 'Follow your browser’s instructions to finish installing.',
    error: 'The install prompt could not open. Use your browser menu to install.',
  },
  ar: {
    install: 'تثبيت وارتق',
    opening: 'جارٍ فتح طلب التثبيت…',
    close: 'إغلاق إرشادات التثبيت',
    ios: 'في سفاري، اضغط على مشاركة، ثم إضافة إلى الشاشة الرئيسية.',
    other:
      'افتح قائمة المتصفح واختر تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية، إن كان الخيار متاحًا.',
    dismissed: 'تم إغلاق طلب التثبيت. يمكنك استخدام قائمة المتصفح للتثبيت لاحقًا.',
    accepted: 'اتبع تعليمات المتصفح لإكمال التثبيت.',
    error: 'تعذر فتح طلب التثبيت. استخدم قائمة المتصفح للتثبيت.',
  },
}

function isAppleMobile() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function InstallApp() {
  const { language } = useLanguage()
  const text = copy[language]
  const availability = useSyncExternalStore(subscribe, snapshot)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<'dismissed' | 'accepted' | 'error' | null>(null)
  const [busy, setBusy] = useState(false)

  if (availability === 'installed') return null

  async function install(event: MouseEvent<HTMLButtonElement>) {
    if (!event.nativeEvent.isTrusted) return
    const current = promptEvent
    if (!current) {
      setOpen(true)
      return
    }
    promptEvent = null
    setBusy(true)
    setStatus(null)
    try {
      // Invoke the native prompt within the click before awaiting anything.
      const result = current.prompt()
      notify()
      await result
      const choice = await current.userChoice
      if (typeof choice === 'object' && choice !== null && 'outcome' in choice) {
        if (choice.outcome === 'accepted') setStatus('accepted')
        else if (choice.outcome === 'dismissed') setStatus('dismissed')
      }
    } catch {
      notify()
      setStatus('error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="install-strip" aria-label={text.install}>
      <div className="install-strip-inner">
        <button
          type="button"
          className="install-button"
          disabled={busy}
          onClick={(event) => void install(event)}
        >
          {busy ? text.opening : text.install}
        </button>
        {open && (
          <button type="button" className="install-close" onClick={() => setOpen(false)}>
            {text.close}
          </button>
        )}
      </div>
      {open && <p className="install-guidance">{isAppleMobile() ? text.ios : text.other}</p>}
      {status && (
        <p className="install-guidance" role="status">
          {text[status]}
        </p>
      )}
    </section>
  )
}
