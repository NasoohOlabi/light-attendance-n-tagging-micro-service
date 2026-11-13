import { accessSchema, decodeAccess, type Access } from '../shared/access'

const KEY = 'halaqa-access-v1'
export function loadSession(): { access: Access | null; error: string } {
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const encoded = hash.get('access')
  if (encoded !== null) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    try {
      sessionStorage.removeItem(KEY)
      const access = decodeAccess(encoded)
      sessionStorage.setItem(KEY, JSON.stringify(access))
      return { access, error: '' }
    } catch { return { access: null, error: 'This link is invalid or session storage is unavailable. Reopen it in a regular browser window, or ask the manager for a new link.' } }
  }
  try {
    const stored = sessionStorage.getItem(KEY)
    return { access: stored ? accessSchema.parse(JSON.parse(stored)) : null, error: '' }
  } catch { return { access: null, error: 'Session storage is unavailable or invalid. Reopen your access link.' } }
}
export function clearSession() { sessionStorage.removeItem(KEY) }
