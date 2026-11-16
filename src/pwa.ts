let waiting = false
let initialized = false
const listeners = new Set<() => void>()

function setWaiting(value: boolean) {
  if (waiting === value) return
  waiting = value
  listeners.forEach((listener) => listener())
}

export function subscribeToPwaUpdate(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function hasWaitingPwaUpdate() {
  return waiting
}

export function registerPwa() {
  if (initialized || !import.meta.env.PROD || !('serviceWorker' in navigator)) return
  initialized = true
  void navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .then((registration) => {
      const refresh = () => setWaiting(!!registration.waiting)
      const watchInstalling = () => {
        const worker = registration.installing
        worker?.addEventListener('statechange', refresh)
        refresh()
      }
      registration.addEventListener('updatefound', watchInstalling)
      navigator.serviceWorker.addEventListener('controllerchange', refresh)
      watchInstalling()
    })
    .catch(() => {})
}
