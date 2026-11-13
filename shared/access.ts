import { z } from 'zod'

export const apiIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{5,100}$/)
export const accessSchema = z.object({
  version: z.literal(1), username: z.string().trim().min(1).max(100), apiId: apiIdSchema,
  token: z.string().min(1).max(2048).regex(/^[\x21-\x7e]+$/),
  sheet: z.string().trim().min(1).max(100).default('Events'),
})
export type Access = z.infer<typeof accessSchema>
export function encodeAccess(input: Access): string {
  const bytes = new TextEncoder().encode(JSON.stringify(accessSchema.parse(input)))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
export function decodeAccess(encoded: string): Access {
  if (encoded.length > 10000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('Invalid access link')
  const binary = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'))
  return accessSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))))
}
export function createAccessLink(site: string, access: Access): string {
  const url = new URL(site)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Use an HTTPS site URL, or localhost for development')
  if (url.username || url.password) throw new Error('Site URL must not contain credentials')
  url.search = ''
  url.hash = `access=${encodeAccess(access)}`
  return url.href
}
