import { z } from 'zod'
import type { Access, Endpoint } from '../shared/access'
import { parseRoster } from '../shared/roster'
import { eventToRow, HEADERS, parseRows, type LedgerEvent } from '../shared/ledger'

export class SheetsAccessError extends Error {}
async function endpointRequest(
  access: Endpoint,
  method: 'GET' | 'POST',
  body?: unknown,
  suffix = '',
): Promise<unknown> {
  const url = new URL(`https://sheetdb.io/api/v1/${access.apiId}${suffix}`)
  url.searchParams.set('sheet', access.sheet)
  if (method === 'GET') url.searchParams.set('ignore_cache', '1')
  if (method === 'POST') url.searchParams.set('mode', 'RAW')
  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${access.token}`,
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    })
  } catch {
    throw new Error(
      'SheetDB could not be reached. Check your connection and the endpoint CORS settings.',
    )
  }
  if (response.status === 401 || response.status === 403)
    throw new SheetsAccessError(
      'This link has lost access, or the endpoint permissions are incorrect. Ask the manager for a replacement.',
    )
  if (response.status === 429) {
    const header = response.headers.get('Retry-After')
    const seconds =
      header && /^\d+$/.test(header)
        ? Number(header)
        : header
          ? Math.ceil((Date.parse(header) - Date.now()) / 1000)
          : NaN
    const wait =
      Number.isFinite(seconds) && seconds > 0
        ? ` Wait at least ${Math.min(seconds, 3600)} seconds before retrying.`
        : ' Wait before retrying.'
    throw new Error(`SheetDB request limit reached.${wait}`)
  }
  if (!response.ok)
    throw new Error(`SheetDB returned ${response.status}. Check the endpoint and Events tab.`)
  return response.json()
}
export async function request(access: Access, method: 'GET' | 'POST', body?: unknown, suffix = '') {
  return endpointRequest(access, method, body, suffix)
}
export async function readEvents(access: Access) {
  return parseRows(await request(access, 'GET'))
}
export async function appendEvents(access: Access, events: LedgerEvent[]): Promise<void> {
  if (!events.length) return
  const keys = z.array(z.string()).parse(await request(access, 'GET', undefined, '/keys'))
  if (HEADERS.some((header) => !keys.includes(header)))
    throw new Error(
      'Events sheet headers do not match. Open the setup guide before submitting records.',
    )
  const result = z
    .object({ created: z.number().int() })
    .parse(await request(access, 'POST', { data: events.map(eventToRow) }))
  if (result.created !== events.length)
    throw new Error(
      'SheetDB did not confirm every row. Keep this batch and retry after checking the sheet.',
    )
}

export async function readRoster(endpoint: Endpoint) {
  return parseRoster(await endpointRequest(endpoint, 'GET'))
}
