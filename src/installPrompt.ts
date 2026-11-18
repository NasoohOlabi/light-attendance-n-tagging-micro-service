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

export function subscribeInstall(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function installAvailability() {
  return isStandalone() ? 'installed' : promptEvent ? 'ready' : 'instructions'
}

export function takeInstallPrompt() {
  const current = promptEvent
  promptEvent = null
  if (current) notify()
  return current
}
