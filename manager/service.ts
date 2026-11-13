import { z } from 'zod'
import { accessSchema, apiIdSchema, createAccessLink } from '../shared/access'
import { HEADERS } from '../shared/ledger'

export const profileSchema = accessSchema.extend({
  permissionsConfirmed: z.literal(true), updatedAt: z.string(), revoked: z.boolean(),
})
export const stateSchema = z.object({ siteUrl: z.string().default('http://127.0.0.1:5173/'), profiles: z.array(profileSchema).default([]) })
export type ManagerState = z.infer<typeof stateSchema>
export const globalCredentialsSchema = z.object({ appId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/), apiKey: z.string().regex(/^[A-Za-z0-9_-]{1,500}$/) })
export type GlobalCredentials = z.infer<typeof globalCredentialsSchema>
export const saveProfileSchema = accessSchema.extend({ permissionsConfirmed: z.literal(true) })
export const spreadsheetSchema = z.string().url().refine((value) => {
  const url = new URL(value)
  return url.protocol === 'https:' && url.hostname === 'docs.google.com' && /^\/spreadsheets\/d\/[A-Za-z0-9_-]+/.test(url.pathname)
}, 'Use a Google spreadsheet URL')

export async function globalRequest(credentials: GlobalCredentials, operation: 'list' | 'create' | 'delete', input?: string): Promise<unknown> {
  const suffix = operation === 'delete' ? `delete/${apiIdSchema.parse(input)}` : operation
  const url = `https://sheetdb.io/api/v1/${credentials.appId}/${credentials.apiKey}/${suffix}`
  try {
    const response = await fetch(url, {
      method: operation === 'list' ? 'GET' : operation === 'create' ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: operation === 'create' ? JSON.stringify({ url: spreadsheetSchema.parse(input), permissions: 'read,create' }) : undefined,
      signal: AbortSignal.timeout(20000), redirect: 'error',
    })
    if (!response.ok) throw new Error(`SheetDB management request failed (${response.status}). Check the plan, API key and permissions.`)
    return await response.json()
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('SheetDB management')) throw error
    throw new Error('SheetDB management request did not complete. Check the SheetDB dashboard before repeating a create or revoke operation.')
  }
}

export async function verifyProfile(input: z.infer<typeof saveProfileSchema>): Promise<void> {
  const url = new URL(`https://sheetdb.io/api/v1/${input.apiId}/keys`)
  url.searchParams.set('sheet', input.sheet)
  const authenticated = await fetch(url, { headers: { Authorization: `Bearer ${input.token}` }, signal: AbortSignal.timeout(20000), redirect: 'error' })
  if (!authenticated.ok) throw new Error(`Authenticated read failed (${authenticated.status}). Check the token, Read permission and tab name.`)
  const keys = z.array(z.string()).parse(await authenticated.json())
  if (HEADERS.some((header) => !keys.includes(header))) throw new Error(`Missing Events headers. Expected: ${HEADERS.join(', ')}`)
  const anonymous = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'error' })
  if (anonymous.status !== 401 && anonymous.status !== 403) throw new Error('This endpoint did not reject an unauthenticated request. Enable bearer authentication in SheetDB before issuing links.')
}

export function publicState(state: ManagerState, connected: boolean) {
  return { siteUrl: state.siteUrl, connected, profiles: state.profiles.map(({ username, apiId, sheet, updatedAt, revoked }) => ({ username, apiId, sheet, updatedAt, revoked })) }
}
export function profileLink(state: ManagerState, username: string) {
  const profile = state.profiles.find((item) => item.username === username && !item.revoked)
  if (!profile) throw new Error('Active profile not found')
  return createAccessLink(state.siteUrl, profile)
}
