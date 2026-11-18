import { z } from 'zod'

const key = 'halaqa-offline-access'
const schema = z.object({
  userId: z.string(),
  accountId: z.string(),
  actor: z.string(),
  expires: z.number(),
})
export function offlineAccess() {
  try {
    const value = schema.parse(JSON.parse(localStorage.getItem(key) ?? 'null'))
    return value.expires > Date.now() ? value : null
  } catch {
    return null
  }
}
export function allowOfflineAccess(
  userId: string,
  accountId: string,
  actor: string,
  expires: number,
) {
  localStorage.setItem(key, JSON.stringify(schema.parse({ userId, accountId, actor, expires })))
}
export function clearOfflineAccess() {
  try {
    localStorage.removeItem(key)
  } catch {
    /* Storage may be unavailable. */
  }
}
