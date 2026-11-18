import { z } from 'zod'

const key = 'halaqa-offline-access'
const schema = z.object({ userId: z.string(), actor: z.string(), expires: z.number().nullable() })
export function offlineAccess() {
  try {
    const value = schema.parse(JSON.parse(localStorage.getItem(key) ?? 'null'))
    return value.expires === null || value.expires > Date.now() ? value : null
  } catch {
    return null
  }
}
export function allowOfflineAccess(userId: string, actor: string, expires: number | null) {
  localStorage.setItem(key, JSON.stringify(schema.parse({ userId, actor, expires })))
}
export function clearOfflineAccess() {
  try {
    localStorage.removeItem(key)
  } catch {
    /* Storage may be unavailable. */
  }
}
