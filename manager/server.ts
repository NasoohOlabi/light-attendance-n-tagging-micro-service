import { mkdir, rename } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { apiIdSchema, createAccessLink, endpointSchema } from '../shared/access'
import {
  globalCredentialsSchema,
  globalRequest,
  profileLink,
  readRoster,
  rosterTeachers,
  publicState,
  saveProfileSchema,
  spreadsheetSchema,
  stateSchema,
  verifyProfile,
  type GlobalCredentials,
} from './service'

const root = new URL('../', import.meta.url)
const localDirectory = process.env.MANAGER_DIRECTORY
  ? resolve(process.env.MANAGER_DIRECTORY)
  : fileURLToPath(new URL('.local/', root))
const stateFile = join(localDirectory, 'manager.json')
const port = z.coerce
  .number()
  .int()
  .min(0)
  .max(65535)
  .parse(process.env.MANAGER_PORT ?? '4174')
await mkdir(localDirectory, { recursive: true })
let state = stateSchema.parse(
  (await Bun.file(stateFile).exists()) ? await Bun.file(stateFile).json() : {},
)
let credentials: GlobalCredentials | null = null
let writing = false
let origin = ''
const responseHeaders = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy':
    "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
}
const files = new Map([
  ['/', new URL('./index.html', import.meta.url)],
  ['/app.js', new URL('./app.js', import.meta.url)],
  ['/styles.css', new URL('./styles.css', import.meta.url)],
  ['/setup.md', new URL('../docs/setup.md', import.meta.url)],
])
async function persist(next: typeof state) {
  const temporary = join(localDirectory, 'manager.json.tmp')
  await Bun.write(temporary, JSON.stringify(next, null, 2))
  await rename(temporary, stateFile)
  state = next
}
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: responseHeaders })
}
const usernameSchema = z.object({ username: z.string().min(1).max(100) })

const server = Bun.serve({
  hostname: '127.0.0.1',
  port,
  maxRequestBodySize: 1024 * 64,
  async fetch(request) {
    const url = new URL(request.url)
    if (request.headers.get('host') !== new URL(origin).host)
      return json({ error: 'Use the loopback manager URL' }, 403)
    if (request.headers.get('origin') && request.headers.get('origin') !== origin)
      return json({ error: 'Cross-origin request rejected' }, 403)
    if (request.headers.get('sec-fetch-site') === 'cross-site')
      return json({ error: 'Cross-site request rejected' }, 403)
    const file = files.get(url.pathname)
    if (request.method === 'GET' && file)
      return new Response(Bun.file(file), { headers: responseHeaders })
    if (request.method === 'GET' && url.pathname === '/api/state')
      return json(publicState(state, !!credentials))
    if (request.method !== 'POST' || !url.pathname.startsWith('/api/'))
      return json({ error: 'Not found' }, 404)
    if (
      request.headers.get('origin') !== origin ||
      request.headers.get('x-manager-request') !== '1' ||
      !request.headers.get('content-type')?.startsWith('application/json')
    )
      return json({ error: 'Same-origin JSON request required' }, 403)
    if (writing)
      return json(
        { error: 'Another manager operation is running. Try again when it finishes.' },
        409,
      )
    writing = true
    try {
      const input: unknown = await request.json()
      switch (url.pathname) {
        case '/api/settings': {
          const { siteUrl } = z.object({ siteUrl: z.string().url() }).parse(input)
          createAccessLink(siteUrl, {
            version: 1,
            username: 'validate',
            apiId: 'validate',
            token: 'validate',
            sheet: 'Events',
          })
          await persist({ ...state, siteUrl })
          return json({ message: 'Site URL saved' })
        }
        case '/api/connect':
          credentials = globalCredentialsSchema.parse(input)
          return json({ message: 'Management credentials loaded in memory for this process' })
        case '/api/disconnect':
          credentials = null
          return json({ message: 'Management credentials cleared' })
        case '/api/list': {
          if (!credentials) throw new Error('Load management credentials first')
          const result = z
            .array(z.object({ id: z.union([z.string(), z.number()]) }))
            .parse(await globalRequest(credentials, 'list'))
          return json(result.map(({ id }) => ({ id })))
        }
        case '/api/create': {
          if (!credentials) throw new Error('Load management credentials first')
          const { spreadsheetUrl } = z.object({ spreadsheetUrl: spreadsheetSchema }).parse(input)
          await globalRequest(credentials, 'create', spreadsheetUrl)
          return json({ message: 'Endpoint created. Find its ID in the SheetDB dashboard.' })
        }
        case '/api/profile': {
          const profile = saveProfileSchema.parse(input)
          const existing = state.profiles.find((item) => item.username === profile.username)
          if (
            existing &&
            !existing.revoked &&
            existing.version === 2 &&
            profile.version === 2 &&
            existing.teacherId !== profile.teacherId
          )
            throw new Error('This endpoint belongs to another active user with the same name.')
          if (existing?.revokePending)
            throw new Error('Resolve the pending revocation before replacing access.')
          if (
            existing &&
            !existing.revoked &&
            (existing.apiId !== profile.apiId ||
              (existing.version === 2 &&
                (profile.version !== 2 || existing.roster.apiId !== profile.roster.apiId)))
          )
            throw new Error(
              'Revoke the old endpoint first, then save its replacement. This keeps old access from being forgotten.',
            )
          for (const item of state.profiles) {
            if (item.username === profile.username || item.revoked) continue
            const shared =
              item.apiId === profile.apiId ||
              (item.version === 2 &&
                (item.roster.apiId === profile.apiId ||
                  (profile.version === 2 && item.roster.apiId === profile.roster.apiId))) ||
              (profile.version === 2 && item.apiId === profile.roster.apiId)
            if (item.version === 2 && profile.version === 2 && item.teacherId === profile.teacherId)
              throw new Error(
                'This endpoint belongs to another active user with the same teacher assignment.',
              )
            if (!shared) continue
            if (
              item.version !== 2 ||
              profile.version !== 2 ||
              item.teacherId === profile.teacherId ||
              item.apiId !== profile.apiId ||
              item.token !== profile.token ||
              item.sheet !== profile.sheet ||
              item.roster.apiId !== profile.roster.apiId ||
              item.roster.token !== profile.roster.token ||
              item.roster.sheet !== profile.roster.sheet
            )
              throw new Error(
                'This endpoint belongs to another active user with incompatible access or teacher assignment.',
              )
          }
          if (profile.version === 2 && profile.apiId === profile.roster.apiId)
            throw new Error('Events and Roster must use separate endpoints.')
          await verifyProfile(profile)
          await persist({
            ...state,
            retired: existing?.revoked ? [...state.retired, existing] : state.retired,
            profiles: [
              ...state.profiles.filter((item) => item.username !== profile.username),
              {
                ...profile,
                updatedAt: new Date().toISOString(),
                revoked: false,
                revokePending: false,
              },
            ],
          })
          return json({ message: 'Authenticated read and anonymous denial verified. User saved.' })
        }
        case '/api/teachers': {
          const endpoint = endpointSchema.parse(input)
          return json({ teachers: await rosterTeachers(endpoint) })
        }
        case '/api/students': {
          const { username } = usernameSchema.parse(input)
          const profile = state.profiles.find(
            (item) => item.username === username && !item.revoked && !item.revokePending,
          )
          if (!profile || profile.version !== 2) throw new Error('Active profile not found')
          const students = (await readRoster(profile.roster)).filter(
            (student) => student.active && student.teacherId === profile.teacherId,
          )
          return json({ students: students.map(({ studentId, name }) => ({ studentId, name })) })
        }
        case '/api/link': {
          const { username, studentId } = usernameSchema
            .extend({ studentId: z.uuid().optional() })
            .parse(input)
          return json({ link: await profileLink(state, username, studentId) })
        }
        case '/api/revoke': {
          const { username, confirmApiId, manual } = usernameSchema
            .extend({ confirmApiId: apiIdSchema, manual: z.boolean() })
            .parse(input)
          const profile = state.profiles.find((item) => item.username === username && !item.revoked)
          if (!profile || profile.apiId !== confirmApiId)
            throw new Error('The endpoint ID does not match the selected active user')
          const endpointIds =
            profile.version === 2 ? [profile.apiId, profile.roster.apiId] : [profile.apiId]
          const affected = state.profiles.filter(
            (item) =>
              item.username !== username &&
              !item.revoked &&
              (endpointIds.includes(item.apiId) ||
                (item.version === 2 && endpointIds.includes(item.roster.apiId))),
          )
          if (affected.length)
            throw new Error(
              `Shared endpoint also affects: ${affected.map((item) => item.username).join(', ')}. Individual revocation is unavailable.`,
            )
          if (!manual && !credentials)
            throw new Error(
              'Load management credentials, or delete the endpoint in SheetDB and choose manual confirmation',
            )
          if (!profile.revokePending)
            await persist({
              ...state,
              profiles: state.profiles.map((item) =>
                item.username === username ? { ...item, revokePending: true } : item,
              ),
            })
          if (!manual) {
            if (!credentials) throw new Error('Load management credentials first')
            z.object({ deleted: z.literal(1) }).parse(
              await globalRequest(credentials, 'delete', profile.apiId),
            )
          }
          {
            const response = await fetch(`https://sheetdb.io/api/v1/${profile.apiId}`, {
              headers: { Authorization: `Bearer ${profile.token}` },
              redirect: 'error',
              signal: AbortSignal.timeout(20000),
            })
            if (![404, 410].includes(response.status))
              throw new Error(
                'Endpoint deletion could not be confirmed. Read denial alone does not prove Create is disabled; check SheetDB before retrying.',
              )
          }
          await persist({
            ...state,
            profiles: state.profiles.map((item) =>
              item.username === username
                ? {
                    ...item,
                    revoked: true,
                    revokePending: false,
                    token: 'revoked',
                    updatedAt: new Date().toISOString(),
                  }
                : item,
            ),
          })
          return json({
            message: manual
              ? 'Endpoint returned 404/410. Confirm deletion in SheetDB; this response alone is not conclusive proof that writes are disabled.'
              : 'Provider reported deletion and the endpoint returned 404/410. Sheet data is preserved.',
          })
        }
        default:
          return json({ error: 'Not found' }, 404)
      }
    } catch (error) {
      if (error instanceof z.ZodError)
        return json(
          {
            error:
              'Invalid fields or unexpected SheetDB response. Check the setup guide and entered values.',
          },
          400,
        )
      return json(
        {
          error:
            error instanceof Error &&
            /^(Active profile|The endpoint ID|Revoke the old|This endpoint belongs|Resolve the pending|Load management|Endpoint deletion|Authenticated read failed|Missing Events headers|This endpoint did not|SheetDB management|Shared endpoint|Roster does not|Roster has|Student is not|Student links|Events and Roster|Missing Roster)/.test(
              error.message,
            )
              ? error.message
              : 'Operation failed. Check SheetDB before retrying.',
        },
        400,
      )
    } finally {
      writing = false
    }
  },
  error() {
    return json({ error: 'Manager operation failed' }, 500)
  },
})
origin = `http://127.0.0.1:${server.port}`
console.info(`Local access manager: ${origin}`)
