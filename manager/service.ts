import { z } from 'zod'
import {
  accessSchema,
  apiIdSchema,
  createAccessLink,
  createStudentAccessLink,
  endpointSchema,
} from '../shared/access'
import { parseRoster, ROSTER_HEADERS } from '../shared/roster'
import { HEADERS } from '../shared/ledger'

export const profileSchema = accessSchema.and(
  z.object({
    permissionsConfirmed: z.literal(true),
    updatedAt: z.string(),
    revoked: z.boolean(),
    revokePending: z.boolean().default(false),
  }),
)
export const stateSchema = z.object({
  siteUrl: z.string().default('http://127.0.0.1:5173/'),
  profiles: z.array(profileSchema).default([]),
  retired: z.array(profileSchema).default([]),
})
export type ManagerState = z.infer<typeof stateSchema>
export const globalCredentialsSchema = z.object({
  appId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
  apiKey: z.string().regex(/^[A-Za-z0-9_-]{1,500}$/),
})
export type GlobalCredentials = z.infer<typeof globalCredentialsSchema>
export const saveProfileSchema = accessSchema.and(
  z.object({ permissionsConfirmed: z.literal(true) }),
)
export const spreadsheetSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname === 'docs.google.com' &&
      /^\/spreadsheets\/d\/[A-Za-z0-9_-]+/.test(url.pathname)
    )
  }, 'Use a Google spreadsheet URL')

export async function globalRequest(
  credentials: GlobalCredentials,
  operation: 'list' | 'create' | 'delete',
  input?: string,
): Promise<unknown> {
  const suffix = operation === 'delete' ? `delete/${apiIdSchema.parse(input)}` : operation
  const url = `https://sheetdb.io/api/v1/${credentials.appId}/${credentials.apiKey}/${suffix}`
  try {
    const response = await fetch(url, {
      method: operation === 'list' ? 'GET' : operation === 'create' ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:
        operation === 'create'
          ? JSON.stringify({ url: spreadsheetSchema.parse(input), permissions: 'read,create' })
          : undefined,
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    })
    if (!response.ok)
      throw new Error(
        `SheetDB management request failed (${response.status}). Check the plan, API key and permissions.`,
      )
    return await response.json()
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('SheetDB management')) throw error
    throw new Error(
      'SheetDB management request did not complete. Check the SheetDB dashboard before repeating a create or revoke operation.',
    )
  }
}

type Endpoint = z.infer<typeof endpointSchema>

async function verifyEndpoint(endpoint: Endpoint, headers: readonly string[], label: string) {
  const url = new URL(`https://sheetdb.io/api/v1/${endpoint.apiId}/keys`)
  url.searchParams.set('sheet', endpoint.sheet)
  const authenticated = await fetch(url, {
    headers: { Authorization: `Bearer ${endpoint.token}` },
    signal: AbortSignal.timeout(20000),
    redirect: 'error',
  })
  if (!authenticated.ok)
    throw new Error(`Authenticated read failed for ${label} (${authenticated.status}).`)
  const keys = z.array(z.string()).parse(await authenticated.json())
  if (headers.some((header) => !keys.includes(header)))
    throw new Error(`Missing ${label} headers. Expected: ${headers.join(', ')}`)
  const anonymous = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'error' })
  if (anonymous.status !== 401 && anonymous.status !== 403)
    throw new Error(`This endpoint did not reject an unauthenticated request (${label}).`)
}

export async function readRoster(endpoint: Endpoint) {
  const url = new URL(`https://sheetdb.io/api/v1/${endpoint.apiId}`)
  url.searchParams.set('sheet', endpoint.sheet)
  url.searchParams.set('ignore_cache', '1')
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${endpoint.token}` },
    signal: AbortSignal.timeout(20000),
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`Authenticated read failed for Roster (${response.status}).`)
  return parseRoster(await response.json())
}

export async function rosterTeachers(endpoint: Endpoint) {
  await verifyEndpoint(endpoint, ROSTER_HEADERS, 'Roster')
  const roster = await readRoster(endpoint)
  const teachers = new Map<string, string>()
  for (const student of roster) {
    if (!student.active || !student.teacherId) continue
    const previous = teachers.get(student.teacherId)
    if (previous && previous !== student.teacherName)
      throw new Error('Roster has conflicting teacher names.')
    teachers.set(student.teacherId, student.teacherName)
  }
  return [...teachers].map(([teacherId, username]) => ({ teacherId, username }))
}

export async function verifyProfile(input: z.infer<typeof saveProfileSchema>): Promise<void> {
  await verifyEndpoint(input, HEADERS, 'Events')
  if (input.version === 2) {
    const teachers = await rosterTeachers(input.roster)
    if (
      !teachers.some(
        (teacher) => teacher.teacherId === input.teacherId && teacher.username === input.username,
      )
    )
      throw new Error('Roster does not contain this teacher with active assigned students.')
  }
}

export function publicState(state: ManagerState, connected: boolean) {
  return {
    siteUrl: state.siteUrl,
    connected,
    profiles: state.profiles.map(
      ({ version, username, apiId, sheet, updatedAt, revoked, revokePending }) => ({
        version,
        username,
        apiId,
        sheet,
        updatedAt,
        revoked,
        revokePending,
      }),
    ),
    retired: state.retired.map(({ username, apiId, sheet, updatedAt }) => ({
      username,
      apiId,
      sheet,
      updatedAt,
    })),
  }
}
export async function profileLink(state: ManagerState, username: string, studentId?: string) {
  const profile = state.profiles.find(
    (item) => item.username === username && !item.revoked && !item.revokePending,
  )
  if (!profile) throw new Error('Active profile not found')
  if (studentId) {
    if (profile.version !== 2) throw new Error('Student links require assigned access.')
    const roster = await readRoster(profile.roster)
    if (
      !roster.some(
        (student) =>
          student.studentId === studentId &&
          student.active &&
          student.teacherId === profile.teacherId,
      )
    )
      throw new Error('Student is not assigned to this teacher.')
    return createStudentAccessLink(state.siteUrl, profile, studentId)
  }
  return createAccessLink(state.siteUrl, profile)
}
