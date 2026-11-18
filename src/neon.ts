import { createAuthClient } from 'better-auth/react'
import { z } from 'zod'
import {
  neonAccountSchema,
  neonBatchSchema,
  neonSnapshotSchema,
  neonTeacherSchema,
} from '../shared/neon'
import type { LedgerEvent } from '../shared/ledger'

export const apiUrl = window.location.origin
export const authClient = createAuthClient()

export const sessionChangeEvent = 'halaqa-session-change'
export const sessionChangeSource = crypto.randomUUID()

export function announceSessionChange() {
  try {
    localStorage.setItem(sessionChangeEvent, crypto.randomUUID())
  } catch {
    /* Storage can be disabled. */
  }
  try {
    const channel = new BroadcastChannel(sessionChangeEvent)
    channel.postMessage(sessionChangeSource)
    channel.close()
  } catch {
    /* BroadcastChannel can be unavailable. */
  }
}

export function resetWorkspace() {
  announceSessionChange()
  window.location.replace(window.location.pathname + '?page=app')
}

export class NeonRequestError extends Error {
  constructor(public status: number) {
    super(
      status === 403
        ? 'Your account is awaiting approval or no longer has access. Contact your manager.'
        : status === 401
          ? 'Your session has expired. Please sign in again.'
          : 'The request failed. Please try again.',
    )
  }
}

export async function request(
  path: string,
  userId: string,
  body?: unknown,
  reportDenial = true,
): Promise<unknown> {
  if (!authClient || !apiUrl) throw new Error('App configuration is unavailable.')
  const session = await authClient.getSession({
    fetchOptions: { signal: AbortSignal.timeout(15000) },
  })
  if (session.data?.user.id !== userId)
    throw new Error('Your session changed. Please sign in again.')
  const response = await fetch(`${apiUrl}${path}`, {
    method: body !== undefined ? 'POST' : 'GET',
    headers: {
      'X-User-Id': userId,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) {
    if (reportDenial && (response.status === 401 || response.status === 403))
      window.dispatchEvent(new CustomEvent('neon-access-denied', { detail: response.status }))
    throw new NeonRequestError(response.status)
  }
  return response.json() as Promise<unknown>
}
export type InvitationProfile = z.infer<
  typeof import('../shared/invitations').invitationProfileSchema
>

export async function getAccount(userId: string) {
  return z
    .object({ account: neonAccountSchema })
    .parse(await request('/api/me', userId, undefined, false)).account
}

export async function getTeacher(userId: string) {
  try {
    return z.object({ teacher: neonTeacherSchema }).parse(await request('/api/me', userId)).teacher
  } catch (cause) {
    if (cause instanceof NeonRequestError) throw cause
    throw new Error('The request failed. Please try again.')
  }
}
export async function getNotebook(userId: string) {
  try {
    return neonSnapshotSchema.parse(await request('/api/notebook', userId))
  } catch (cause) {
    if (cause instanceof NeonRequestError) throw cause
    throw new Error('The request failed. Please try again.')
  }
}
export async function postEvents(userId: string, events: LedgerEvent[]) {
  try {
    return neonSnapshotSchema.parse(
      await request('/api/events', userId, neonBatchSchema.parse({ events })),
    )
  } catch (cause) {
    if (cause instanceof NeonRequestError) throw cause
    throw new Error('The request failed. Please try again.')
  }
}
