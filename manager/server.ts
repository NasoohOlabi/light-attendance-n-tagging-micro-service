import { mkdir, rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { apiIdSchema, createAccessLink } from '../shared/access'
import { globalCredentialsSchema, globalRequest, profileLink, publicState, saveProfileSchema, spreadsheetSchema, stateSchema, verifyProfile, type GlobalCredentials } from './service'

const root = new URL('../', import.meta.url)
const localDirectory = new URL('.local/', root)
const stateFile = new URL('manager.json', localDirectory)
await mkdir(localDirectory, { recursive: true })
let state = stateSchema.parse(await Bun.file(stateFile).exists() ? await Bun.file(stateFile).json() : {})
let credentials: GlobalCredentials | null = null
let writing = false
const origin = 'http://127.0.0.1:4174'
const responseHeaders = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" }
const files = new Map([
  ['/', new URL('./index.html', import.meta.url)], ['/app.js', new URL('./app.js', import.meta.url)],
  ['/styles.css', new URL('./styles.css', import.meta.url)], ['/setup.md', new URL('../docs/setup.md', import.meta.url)],
])
async function persist() {
  const temporary = new URL('manager.json.tmp', localDirectory)
  await Bun.write(temporary, JSON.stringify(state, null, 2))
  await rename(fileURLToPath(temporary), fileURLToPath(stateFile))
}
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: responseHeaders }) }
const usernameSchema = z.object({ username: z.string().min(1).max(100) })

Bun.serve({
  hostname: '127.0.0.1', port: 4174, maxRequestBodySize: 1024 * 64,
  async fetch(request) {
    const url = new URL(request.url)
    if (request.headers.get('host') !== '127.0.0.1:4174') return json({ error: 'Use the loopback manager URL' }, 403)
    if (request.headers.get('origin') && request.headers.get('origin') !== origin) return json({ error: 'Cross-origin request rejected' }, 403)
    if (request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Cross-site request rejected' }, 403)
    const file = files.get(url.pathname)
    if (request.method === 'GET' && file) return new Response(Bun.file(file), { headers: responseHeaders })
    if (request.method === 'GET' && url.pathname === '/api/state') return json(publicState(state, !!credentials))
    if (request.method !== 'POST' || !url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404)
    if (request.headers.get('origin') !== origin || request.headers.get('x-manager-request') !== '1' || !request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Same-origin JSON request required' }, 403)
    if (writing) return json({ error: 'Another manager operation is running. Try again when it finishes.' }, 409)
    writing = true
    try {
      const input: unknown = await request.json()
      switch (url.pathname) {
        case '/api/settings': {
          const { siteUrl } = z.object({ siteUrl: z.string().url() }).parse(input)
          createAccessLink(siteUrl, { version: 1, username: 'validate', apiId: 'validate', token: 'validate', sheet: 'Events' })
          state = { ...state, siteUrl }
          await persist()
          return json({ message: 'Site URL saved' })
        }
        case '/api/connect': credentials = globalCredentialsSchema.parse(input); return json({ message: 'Management credentials loaded in memory for this process' })
        case '/api/disconnect': credentials = null; return json({ message: 'Management credentials cleared' })
        case '/api/list': {
          if (!credentials) throw new Error('Load management credentials first')
          return json(await globalRequest(credentials, 'list'))
        }
        case '/api/create': {
          if (!credentials) throw new Error('Load management credentials first')
          const { spreadsheetUrl } = z.object({ spreadsheetUrl: spreadsheetSchema }).parse(input)
          return json(await globalRequest(credentials, 'create', spreadsheetUrl))
        }
        case '/api/profile': {
          const profile = saveProfileSchema.parse(input)
          const existing = state.profiles.find((item) => item.username === profile.username)
          if (existing && !existing.revoked && existing.apiId !== profile.apiId) throw new Error('Revoke the old endpoint first, then save its replacement. This keeps old access from being forgotten.')
          if (state.profiles.some((item) => item.apiId === profile.apiId && item.username !== profile.username && !item.revoked)) throw new Error('This endpoint belongs to another active user. Use a separate endpoint for individual revocation.')
          await verifyProfile(profile)
          state = { ...state, profiles: [...state.profiles.filter((item) => item.username !== profile.username), { ...profile, updatedAt: new Date().toISOString(), revoked: false }] }
          await persist()
          return json({ message: 'Authenticated read and anonymous denial verified. User saved.' })
        }
        case '/api/link': return json({ link: profileLink(state, usernameSchema.parse(input).username) })
        case '/api/revoke': {
          const { username, confirmApiId, manual } = usernameSchema.extend({ confirmApiId: apiIdSchema, manual: z.boolean() }).parse(input)
          const profile = state.profiles.find((item) => item.username === username && !item.revoked)
          if (!profile || profile.apiId !== confirmApiId) throw new Error('The endpoint ID does not match the selected active user')
          if (manual) {
            const response = await fetch(`https://sheetdb.io/api/v1/${profile.apiId}`, { headers: { Authorization: `Bearer ${profile.token}` }, redirect: 'error', signal: AbortSignal.timeout(20000) })
            if (![401, 404, 410].includes(response.status)) throw new Error('Revocation could not be confirmed. Delete the endpoint in SheetDB first. A 403 alone may only mean Read is disabled while Create is still allowed.')
          } else {
            if (!credentials) throw new Error('Load management credentials, or revoke the endpoint in SheetDB and choose manual confirmation')
            const result = z.object({ deleted: z.literal(1) }).parse(await globalRequest(credentials, 'delete', profile.apiId))
            if (result.deleted !== 1) throw new Error('Revocation was not confirmed')
          }
          state = { ...state, profiles: state.profiles.map((item) => item.username === username ? { ...item, revoked: true, token: 'revoked', updatedAt: new Date().toISOString() } : item) }
          await persist()
          return json({ message: 'Old access revoked. Sheet data is preserved.' })
        }
        default: return json({ error: 'Not found' }, 404)
      }
    } catch (error) {
      if (error instanceof z.ZodError) return json({ error: 'Invalid fields or unexpected SheetDB response. Check the setup guide and entered values.' }, 400)
      return json({ error: error instanceof Error && !error.message.includes('https://') ? error.message : 'Operation failed. Check SheetDB before retrying.' }, 400)
    } finally { writing = false }
  },
  error() { return json({ error: 'Manager operation failed' }, 500) },
})
console.info(`Local access manager: ${origin}`)
