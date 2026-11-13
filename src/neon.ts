import { createAuthClient } from '@neon/auth'
import { BetterAuthReactAdapter } from '@neon/auth/react/adapters'
import { z } from 'zod'
import {
  neonAccountSchema,
  neonBatchSchema,
  neonSnapshotSchema,
  neonTeacherSchema,
} from '../shared/neon'
import type { LedgerEvent } from '../shared/ledger'

function endpoint(value: string | undefined) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null
    return url.href.replace(/\/$/, '')
  } catch {
    return null
  }
}

export const authUrl = endpoint(import.meta.env.VITE_NEON_AUTH_URL)
export const apiUrl = endpoint(import.meta.env.VITE_NEON_API_URL)
export const authClient =
  authUrl && apiUrl ? createAuthClient(authUrl, { adapter: BetterAuthReactAdapter() }) : null

export class NeonRequestError extends Error {
  constructor(public status: number) {
    super(
      status === 403
        ? 'Your account is awaiting approval or no longer has access. Contact your manager.'
        : status === 401
          ? 'Your session has expired. Please sign in again.'
          : 'The notebook request failed. Please try again.',
    )
  }
}

export async function request(path: string, userId: string, body?: unknown): Promise<unknown> {
  if (!authClient || !apiUrl) throw new Error('Notebook configuration is unavailable.')
  const session = await authClient.getSession({
    fetchOptions: { signal: AbortSignal.timeout(15000) },
  })
  if (session.data?.user.id !== userId)
    throw new Error('Your session changed. Please sign in again.')
  // This SDK caches unknown routes as session reads; force the JWT request over its transport.
  const result = await authClient.$fetch('/token', {
    method: 'GET',
    headers: { 'X-Force-Fetch': 'true' },
    signal: AbortSignal.timeout(15000),
  })
  const parsed = z.object({ token: z.string().min(1) }).safeParse(result.data)
  const token = parsed.success ? parsed.data.token : null
  if (!token) throw new NeonRequestError(401)
  try {
    const payload = token.split('.')[1]
    if (
      !payload ||
      z
        .object({ sub: z.string() })
        .parse(JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))).sub !== userId
    )
      throw new Error()
  } catch {
    throw new NeonRequestError(401)
  }
  const response = await fetch(`${apiUrl}${path}`, {
    method: body !== undefined ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      window.dispatchEvent(new CustomEvent('neon-access-denied', { detail: response.status }))
    throw new NeonRequestError(response.status)
  }
  return response.json() as Promise<unknown>
}
export async function getAccount(userId: string) {
  return z.object({ account: neonAccountSchema }).parse(await request('/api/me', userId)).account
}
export async function getTeacher(userId: string) {
  try {
    return z.object({ teacher: neonTeacherSchema }).parse(await request('/api/me', userId)).teacher
  } catch (cause) {
    if (cause instanceof NeonRequestError) throw cause
    throw new Error('The notebook request failed. Please try again.')
  }
}
export async function getNotebook(userId: string) {
  try {
    return neonSnapshotSchema.parse(await request('/api/notebook', userId))
  } catch (cause) {
    if (cause instanceof NeonRequestError) throw cause
    throw new Error('The notebook request failed. Please try again.')
  }
}
export async function postEvents(userId: string, events: LedgerEvent[]) {
  try {
    return neonSnapshotSchema.parse(
      await request('/api/events', userId, neonBatchSchema.parse({ events })),
    )
  } catch (cause) {
    if (cause instanceof NeonRequestError) throw cause
    throw new Error('The notebook request failed. Please try again.')
  }
}
