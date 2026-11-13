import { afterEach, expect, spyOn, test } from 'bun:test'
import { appendEvents, readEvents, SheetsAccessError } from '../src/sheetdb'
import { HEADERS, makeEvent, eventToRow } from '../shared/ledger'
import { globalRequest, verifyProfile } from '../manager/service'

const access = {
  version: 1,
  username: 'teacher',
  apiId: 'example123',
  token: 'secret-token',
  sheet: 'Events',
} as const
const mocks: { mockRestore: () => void }[] = []
function mockFetch(
  implementation: (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => Promise<Response>,
) {
  return spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(implementation, { preconnect: fetch.preconnect }),
  )
}
afterEach(() => {
  for (const mock of mocks) mock.mockRestore()
  mocks.length = 0
})

test('teacher transport sends only GET and POST, RAW input, bearer header and stable IDs', async () => {
  const seen: { url: string; method: string; body: unknown; auth: string | null }[] = []
  const mock = mockFetch(async (input, init) => {
    const url = String(input)
    seen.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
      auth: new Headers(init?.headers).get('Authorization'),
    })
    return Response.json(url.includes('/keys') ? HEADERS : { created: 1 })
  })
  mocks.push(mock)
  const event = makeEvent(access.username, {
    kind: 'note',
    studentId: '',
    date: '2026-11-13',
    tags: ['test'],
    text: '=IMPORTXML("example")',
  })
  await appendEvents(access, [event])
  expect(seen.map((call) => call.method)).toEqual(['GET', 'POST'])
  expect(new URL(seen[1].url).searchParams.get('mode')).toBe('RAW')
  expect(seen[1].auth).toBe('Bearer secret-token')
  expect(seen[1].body).toEqual({ data: [eventToRow(event)] })
  expect(seen[1].url).not.toContain(access.token)
})
test('invalid sheet headers prevent writes', async () => {
  const mock = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(['wrong-header']))
  mocks.push(mock)
  const event = makeEvent('teacher', {
    kind: 'note',
    studentId: '',
    date: '2026-11-13',
    tags: ['test'],
    text: 'hello',
  })
  await expect(appendEvents(access, [event])).rejects.toThrow('headers')
  expect(mock).toHaveBeenCalledTimes(1)
})
test('revoked links fail with a friendly access error', async () => {
  const mock = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 403 }))
  mocks.push(mock)
  await expect(readEvents(access)).rejects.toBeInstanceOf(SheetsAccessError)
})
test('manager will not issue a link for an anonymous readable API', async () => {
  const mock = mockFetch(async () => Response.json(HEADERS))
  mocks.push(mock)
  await expect(verifyProfile({ ...access, permissionsConfirmed: true })).rejects.toThrow(
    'unauthenticated',
  )
})
test('management creation explicitly limits permissions instead of accepting permissive defaults', async () => {
  let body: unknown
  const mock = mockFetch(async (_input, init) => {
    body = JSON.parse(String(init?.body))
    return Response.json({ success: true, id: 'example123' })
  })
  mocks.push(mock)
  await globalRequest(
    { appId: 'manager', apiKey: 'private' },
    'create',
    'https://docs.google.com/spreadsheets/d/example/edit',
  )
  expect(body).toEqual({
    url: 'https://docs.google.com/spreadsheets/d/example/edit',
    permissions: 'read,create',
  })
})

test('rate limit reports bounded Retry-After without automatically retrying', async () => {
  const mock = spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response('', { status: 429, headers: { 'Retry-After': '999999' } }),
  )
  mocks.push(mock)
  await expect(readEvents(access)).rejects.toThrow('Wait at least 3600 seconds')
  expect(mock).toHaveBeenCalledTimes(1)
})

test('invalid Retry-After is not echoed to the user', async () => {
  const mock = spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response('', { status: 429, headers: { 'Retry-After': 'private-token' } }),
  )
  mocks.push(mock)
  await expect(readEvents(access)).rejects.toThrow('Wait before retrying')
  expect(mock).toHaveBeenCalledTimes(1)
})
