import { z } from 'zod'

type InstallPrompt = Event & { prompt: () => unknown; userChoice: unknown }
let promptEvent: InstallPrompt | null = null
let installed = false
let checkingInstalled = false
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
  if (
    'getInstalledRelatedApps' in navigator &&
    typeof navigator.getInstalledRelatedApps === 'function'
  ) {
    checkingInstalled = true
    const getApps = navigator.getInstalledRelatedApps.bind(navigator)
    void checkInstalledApps(getApps)
  }
}

async function checkInstalledApps(getApps: () => Promise<unknown>) {
  try {
    const apps = z
      .array(
        z.object({ platform: z.string(), url: z.string().optional(), id: z.string().optional() }),
      )
      .parse(await getApps())
    const manifest = document.querySelector<HTMLLinkElement>('link[rel=manifest]')?.href
    installed ||= apps.some(
      (app) =>
        app.platform === 'webapp' &&
        (app.id === `${location.origin}/` || (manifest !== undefined && app.url === manifest)),
    )
  } catch {
    // An unavailable lookup leaves the normal install options available.
  } finally {
    checkingInstalled = false
    notify()
  }
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function installAvailability() {
  if (installed || isStandalone()) return 'installed'
  if (checkingInstalled) return 'checking'
  return promptEvent ? 'ready' : 'instructions'
}

export function takeInstallPrompt() {
  const current = promptEvent
  promptEvent = null
  if (current) notify()
  return current
}
