import { createHash } from 'node:crypto'
import { verifyOAuthQueryParams } from '@better-auth/oauth-provider'
import { betterAuth } from 'better-auth'
import { Pool } from 'pg'
import { z } from 'zod'
import { createHandler } from '../functions/notebook-service'
import { createMcpHandler } from './mcp'
import { invitationReceipts } from './mcp-invitation'
import { phoneSchema } from '../shared/invitations'
import { mcpConsentPage } from './mcp-consent'
import { createMcpOAuthPlugins } from './mcp-oauth'
import type { McpOperation } from './mcp-tools'
import {
  profileUpdateSchema,
  readBoundedBody,
  validProfileRequest,
  validProfileUpdate,
} from './profile'

const config = z
  .object({
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  })
  .parse(process.env)
const baseUrl = new URL(config.BETTER_AUTH_URL)
if (
  baseUrl.pathname !== '/' ||
  baseUrl.search ||
  baseUrl.hash ||
  baseUrl.username ||
  baseUrl.password ||
  (baseUrl.protocol !== 'https:' &&
    !(baseUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(baseUrl.hostname)))
) {
  throw new Error('BETTER_AUTH_URL must be an HTTPS origin or localhost origin')
}
const origin = baseUrl.origin
const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  statement_timeout: 15000,
  query_timeout: 20000,
})
const authPool = new Pool({
  connectionString: config.DATABASE_URL,
  options: '-c search_path=neon_auth',
  max: 5,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  statement_timeout: 15000,
  query_timeout: 20000,
})
const auth = betterAuth({
  logger: { disabled: true },
  baseURL: origin,
  secret: config.BETTER_AUTH_SECRET,
  database: authPool,
  advanced: { database: { generateId: 'uuid' } },
  emailAndPassword: { enabled: true, disableSignUp: true },
  plugins: createMcpOAuthPlugins(origin),
})
const secureCookies = baseUrl.protocol === 'https:'
const sessionCookie = `${secureCookies ? '__Secure-' : ''}better-auth.session_token`
const markerCookie = `${secureCookies ? '__Secure-' : ''}better-auth.dont_remember`
const slotPrefix = `${secureCookies ? '__Secure-' : ''}device-session-`
const slotCount = 5
const slotPattern = new RegExp(`^${slotPrefix}[a-f0-9]{64}=`)
const maxSlotCandidates = 32

type RememberedSession = {
  value: string
  userId: string
  name: string
  identifier: string
  expiresAt: Date
  marker: string | undefined
}

function cookieValue(headers: Headers, name: string): string | undefined {
  return headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

async function remembered(
  value: string | undefined,
  marker?: string,
): Promise<RememberedSession | undefined> {
  if (!value) return undefined
  const headers = new Headers({ cookie: `${sessionCookie}=${value}` })
  const session = await auth.api.getSession({ headers, query: { disableRefresh: true } })
  if (!session?.user.id) return undefined
  const result = await pool.query(
    'SELECT verified_phone FROM app_accounts WHERE auth_user_id = $1',
    [session.user.id],
  )
  return {
    value,
    userId: session.user.id,
    name: session.user.name,
    identifier: z.string().nullable().optional().parse(result.rows[0]?.verified_phone) ?? '',
    expiresAt: session.session.expiresAt,
    marker,
  }
}

function slotCookies(request: Request) {
  return (request.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => slotPattern.test(part))
}

function slotName(userId: string) {
  return `${slotPrefix}${createHash('sha256').update(userId).digest('hex')}`
}

async function activeAccount(request: Request) {
  return remembered(
    cookieValue(request.headers, sessionCookie),
    cookieValue(request.headers, markerCookie),
  )
}

async function rememberedAccounts(
  request: Request,
  active: RememberedSession | undefined,
): Promise<RememberedSession[]> {
  const slots = slotCookies(request).slice(0, maxSlotCandidates)
  const accounts = await Promise.all([
    active,
    ...slots.map(async (slot) => {
      const [name, value] = slot.split('=', 2)
      const separator = value?.indexOf('~') ?? -1
      if (!value || separator < 0) return undefined
      if (active && name === slotName(active.userId) && value.slice(separator + 1) === active.value)
        return active
      const account = await remembered(
        value.slice(separator + 1),
        value.slice(0, separator) || undefined,
      )
      return account && slotName(account.userId) === name ? account : undefined
    }),
  ])
  return accounts.filter(
    (account, index): account is RememberedSession =>
      Boolean(account) &&
      accounts.findIndex((other) => other?.userId === account?.userId) === index,
  )
}

function setCookie(
  headers: Headers,
  name: string,
  value: string,
  expiresAt?: Date,
  remove = false,
) {
  const lifetime = remove ? '; Max-Age=0' : expiresAt ? `; Expires=${expiresAt.toUTCString()}` : ''
  headers.append(
    'Set-Cookie',
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax${lifetime}${secureCookies ? '; Secure' : ''}`,
  )
}

function saveAccount(headers: Headers, account: RememberedSession) {
  setCookie(
    headers,
    slotName(account.userId),
    `${account.marker ?? ''}~${account.value}`,
    account.marker ? undefined : account.expiresAt,
  )
}

const receipts = invitationReceipts(config.BETTER_AUTH_SECRET)
const notebook = createHandler(
  pool,
  async () => {
    throw new Error('Bearer authentication disabled')
  },
  [origin],
  async (request) => {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session?.user.id || request.headers.get('x-user-id') !== session.user.id)
      throw new Error('Unauthorized')
    return { subject: session.user.id, sessionId: session.session.id }
  },
  { kind: 'reveal', reveal: receipts.reveal },
)

const mcpProfileSchema = z.object({ name: z.string(), image: z.string().nullable() })
const phoneLoginSchema = z.strictObject({
  phone: phoneSchema,
  rememberMe: z.boolean().optional(),
  password: z.string().min(1).max(128),
  oauth_query: z.string().max(6000).optional(),
})

function notebookAsUser(userId: string, operation: McpOperation) {
  // This request is built in-process from a named tool and a verified OAuth subject.
  const authenticated = async () => userId
  return createHandler(
    pool,
    authenticated,
    [origin],
    async () => ({ subject: userId }),
    operation.path === '/api/admin/accounts/invite'
      ? { kind: 'save', save: receipts.save }
      : undefined,
  )(
    new Request(new URL(operation.path, origin), {
      method: operation.method,
      headers: { 'content-type': 'application/json' },
      ...(operation.body === undefined ? {} : { body: JSON.stringify(operation.body) }),
    }),
  )
}

const mcp = createMcpHandler(
  origin,
  (request) => {
    const authorization = request.headers.get('authorization') ?? ''
    const proof = request.headers.get('dpop')
    if (authorization.length > 4096 || (proof && proof.length > 8192)) return Promise.resolve(null)
    return auth.api.validateMcpToken({ body: { authorization, method: request.method, proof } })
  },
  async (userId, operation) => {
    if (operation.path !== '/api/mcp/profile') return notebookAsUser(userId, operation)
    if (operation.method === 'GET') {
      const result = await authPool.query('SELECT name, image FROM "user" WHERE id = $1', [userId])
      return Response.json(mcpProfileSchema.parse(result.rows[0]))
    }
    if (!validProfileUpdate(operation.body))
      return Response.json({ error: 'Invalid account data' }, { status: 400 })
    const { name, image } = profileUpdateSchema.parse(operation.body)
    const result = await authPool.query(
      'UPDATE "user" SET name = $2, image = CASE WHEN $3 THEN $4::text ELSE image END, "updatedAt" = now() WHERE id = $1 RETURNING name, image',
      [userId, name, image !== undefined, image ?? null],
    )
    return Response.json(mcpProfileSchema.parse(result.rows[0]))
  },
)

const discoveryPaths = new Set([
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-authorization-server/api/auth',
])
const oauthMachinePaths = new Set([
  '/api/auth/oauth2/register',
  '/api/auth/oauth2/token',
  '/api/auth/oauth2/introspect',
  '/api/auth/oauth2/revoke',
])
const oauthBrowserPaths = new Set([
  '/api/auth/oauth2/authorize',
  '/api/auth/oauth2/continue',
  '/api/auth/oauth2/consent',
])

export async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)
  let authPath: string
  try {
    authPath = decodeURIComponent(url.pathname).replace(/\/+$/, '').toLowerCase()
  } catch {
    return new Response('Not found', { status: 404 })
  }
  if (
    [
      '/api/auth/sign-in/email',
      '/api/auth/sign-in/username',
      '/api/auth/sign-up/email',
      '/api/auth/change-email',
    ].includes(authPath)
  )
    return new Response('Not found', { status: 404 })
  if (url.pathname === '/mcp') return mcp(request)
  if (url.pathname === '/mcp/login' || url.pathname === '/mcp/consent') {
    if (request.method !== 'GET')
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } })
    if (!(await verifyOAuthQueryParams(url.search.slice(1), config.BETTER_AUTH_SECRET)))
      return new Response(
        'This connection request is invalid or expired. Start again in your MCP client.',
        {
          status: 400,
          headers: { 'Cache-Control': 'no-store' },
        },
      )
    return mcpConsentPage(request)
  }
  if (discoveryPaths.has(url.pathname)) return auth.handler(request)
  if (authPath.startsWith('/api/auth/oauth2/')) {
    if (oauthMachinePaths.has(url.pathname)) {
      if (request.method !== 'POST')
        return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } })
      const body = await readBoundedBody(request, 64 * 1024)
      if (body === null) return Response.json({ error: 'invalid_request' }, { status: 400 })
      const headers = new Headers(request.headers)
      headers.delete('cookie')
      return auth.handler(new Request(request.url, { method: 'POST', headers, body }))
    }
    if (!oauthBrowserPaths.has(url.pathname)) return new Response('Not found', { status: 404 })
  }
  if (
    ['/api/auth/update-user', '/api/auth/sign-in/phone', '/api/auth/sign-out'].includes(authPath) &&
    url.pathname !== authPath
  )
    return new Response('Not found', { status: 404 })
  if (url.pathname === '/health' && request.method === 'GET') {
    try {
      await pool.query(
        'SELECT course_enrollments.teacher_id, course_enrollments.active, course_enrollments.handbook_received, course_enrollments.notes, course_enrollments.grade_decisions, app_accounts.invitation_request_id, app_accounts.invitation_username, app_accounts.verified_phone, app_accounts.invitation_phone, app_accounts.invitation_birth_date, app_accounts.invitation_requires_setup, students.whatsapp, students.location, students.birth_year, courses.open, courses.attendance_minimum, courses.practical_minimum, courses.theory_minimum FROM app_accounts, teachers, students, courses, course_enrollments, events, neon_auth."user", neon_auth.account, neon_auth.session, neon_auth.verification LIMIT 0',
      )
      await authPool.query(
        'SELECT 1 FROM "oauthClient", "oauthClientResource", "oauthResource", "oauthAccessToken", "oauthRefreshToken", "oauthConsent", "oauthClientAssertion" LIMIT 0',
      )
      const assignment = await pool.query(
        "SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'teacher_id'",
      )
      if (assignment.rows[0]?.is_nullable !== 'YES') throw new Error('Roster migration required')
      const phoneIndex = await pool.query(
        `SELECT 1 FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
         WHERE i.indexrelid = to_regclass('public.app_accounts_verified_phone_idx')
           AND i.indrelid = 'public.app_accounts'::regclass AND a.attname = 'verified_phone'
           AND i.indisunique AND i.indisvalid AND i.indisready
           AND i.indnkeyatts = 1 AND i.indpred IS NULL`,
      )
      if (!phoneIndex.rowCount) throw new Error('Phone migration required')
      return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
    } catch {
      return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    }
  }
  if (url.pathname.startsWith('/api/')) {
    if (
      request.method !== 'GET' &&
      request.method !== 'HEAD' &&
      request.headers.get('origin') !== origin
    )
      return Response.json(
        { error: 'Forbidden' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      )
    if (url.pathname === '/api/auth/oauth2/consent' && request.method === 'POST') {
      const session = await auth.api.getSession({
        headers: request.headers,
        query: { disableRefresh: true },
      })
      if (!session?.user.id || request.headers.get('x-user-id') !== session.user.id)
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (url.pathname === '/api/device-accounts' && request.method === 'GET') {
      const accounts = await rememberedAccounts(request, await activeAccount(request))
      const headers = new Headers({ 'Cache-Control': 'no-store' })
      return Response.json(
        {
          accounts: accounts.map(({ userId, name, identifier }) => ({ userId, name, identifier })),
        },
        { headers },
      )
    }
    if (url.pathname === '/api/device-accounts/switch' && request.method === 'POST') {
      const body = await readBoundedBody(request, 4096)
      let userId: string
      try {
        userId = z
          .strictObject({ userId: z.string().min(1).max(128) })
          .parse(JSON.parse(body ?? '')).userId
      } catch {
        return Response.json({ error: 'Invalid account' }, { status: 400 })
      }
      const active = await activeAccount(request)
      const accounts = await rememberedAccounts(request, active)
      const selected = accounts.find((account) => account.userId === userId)
      const headers = new Headers({ 'Cache-Control': 'no-store' })
      if (!selected)
        return Response.json({ error: 'Account session expired' }, { status: 404, headers })
      if (
        active &&
        active.userId !== selected.userId &&
        cookieValue(request.headers, slotName(active.userId)) !==
          `${active.marker ?? ''}~${active.value}`
      ) {
        if (accounts.length > slotCount)
          return Response.json({ error: 'Device account limit reached' }, { status: 409, headers })
        saveAccount(headers, active)
      }
      setCookie(
        headers,
        sessionCookie,
        selected.value,
        selected.marker ? undefined : selected.expiresAt,
      )
      setCookie(headers, markerCookie, selected.marker ?? '', undefined, !selected.marker)
      return Response.json({ ok: true }, { headers })
    }
    if (
      authPath === '/api/auth/sign-out' &&
      request.method === 'POST' &&
      request.headers.has('x-user-id')
    ) {
      const session = await auth.api.getSession({ headers: request.headers })
      if (!session?.user.id || request.headers.get('x-user-id') !== session.user.id)
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (url.pathname === '/api/auth/update-user' && request.method === 'POST') {
      const session = await auth.api.getSession({ headers: request.headers })
      if (!session?.user.id || request.headers.get('x-user-id') !== session.user.id)
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      const body = await validProfileRequest(request)
      if (body === null) return Response.json({ error: 'Invalid account data' }, { status: 400 })
      request = new Request(request.url, { method: request.method, headers: request.headers, body })
    }
    if (['/api/auth/change-password', '/api/auth/set-password'].includes(authPath)) {
      const session = await auth.api.getSession({ headers: request.headers })
      if (session?.user.id) {
        const invited = await pool.query(
          'SELECT 1 FROM app_accounts WHERE auth_user_id = $1 AND (invitation_username IS NOT NULL OR invitation_request_id IS NOT NULL)',
          [session.user.id],
        )
        if (invited.rowCount) return Response.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
    let phoneLogin: z.infer<typeof phoneLoginSchema> | undefined
    if (url.pathname === '/api/auth/sign-in/phone' && request.method === 'POST') {
      try {
        const body = await readBoundedBody(request, 8192)
        if (body === null) throw new Error('Invalid request')
        phoneLogin = phoneLoginSchema.parse(JSON.parse(body))
      } catch {
        return Response.json({ error: 'Invalid credentials' }, { status: 400 })
      }
    }
    const isLogin = request.method === 'POST' && url.pathname === '/api/auth/sign-in/phone'
    const isSignout = request.method === 'POST' && url.pathname === '/api/auth/sign-out'
    const activeBefore = isLogin || isSignout ? await activeAccount(request) : undefined
    const before = isLogin ? await rememberedAccounts(request, activeBefore) : []
    let response: Response
    if (
      url.pathname.startsWith('/api/auth/') &&
      request.method !== 'GET' &&
      request.method !== 'HEAD'
    ) {
      // ponytail: one lock serializes auth mutations; use per-account locks if throughput matters.
      const db = await pool.connect()
      try {
        await db.query('BEGIN')
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended('auth-mutations', 0))")
        if (phoneLogin) {
          const found = await db.query(
            `SELECT u.email FROM app_accounts a JOIN neon_auth."user" u ON u.id::text = a.auth_user_id
             WHERE a.verified_phone = $1
               AND a.active AND (a.expires_at IS NULL OR a.expires_at > now())
               AND ((a.role = 'student' AND EXISTS (SELECT 1 FROM students s WHERE s.id = a.student_id AND s.active))
                 OR (a.role IN ('teacher', 'administrator') AND EXISTS (
                   SELECT 1 FROM teachers t WHERE t.id = a.teacher_id AND t.active
                     AND (t.expires_at IS NULL OR t.expires_at > now())
                 )))`,
            [phoneLogin.phone],
          )
          const email = z.string().safeParse(found.rows[0]?.email)
          request = new Request(new URL('/api/auth/sign-in/email', request.url), {
            method: 'POST',
            headers: request.headers,
            body: JSON.stringify({
              email: email.success ? email.data : 'missing@invitation.invalid',
              password: phoneLogin.password,
              rememberMe: phoneLogin.rememberMe,
              oauth_query: phoneLogin.oauth_query,
            }),
          })
        }
        response = await auth.handler(request)
        await db.query('COMMIT')
      } catch (error) {
        await db.query('ROLLBACK')
        throw error
      } finally {
        db.release()
      }
    } else {
      response = url.pathname.startsWith('/api/auth/')
        ? await auth.handler(request)
        : await notebook(request)
    }
    if (response.ok && isLogin) {
      const cookie = response.headers
        .getSetCookie()
        .find((item) => item.startsWith(`${sessionCookie}=`))
      const value = cookie?.slice(sessionCookie.length + 1).split(';')[0]
      const markerHeader = response.headers
        .getSetCookie()
        .find((item) => item.startsWith(`${markerCookie}=`))
      const markerValue = markerHeader?.slice(markerCookie.length + 1).split(';')[0]
      const current = await remembered(value, markerValue || undefined)
      if (current) {
        const accounts = [current, ...before.filter((account) => account.userId !== current.userId)]
        if (accounts.length > slotCount) {
          await auth.api.signOut({
            headers: new Headers({ cookie: `${sessionCookie}=${current.value}`, origin }),
          })
          return Response.json(
            { error: 'Device account limit reached' },
            { status: 409, headers: { 'Cache-Control': 'no-store' } },
          )
        }
        if (
          activeBefore &&
          activeBefore.userId !== current.userId &&
          cookieValue(request.headers, slotName(activeBefore.userId)) !==
            `${activeBefore.marker ?? ''}~${activeBefore.value}`
        )
          saveAccount(response.headers, activeBefore)
        saveAccount(response.headers, current)
        // Discard cookies left behind by expired or password-revoked sessions.
        const keep = new Set(accounts.map((account) => slotName(account.userId)))
        for (const slot of slotCookies(request).slice(0, maxSlotCandidates)) {
          const name = slot.slice(0, slot.indexOf('='))
          if (!keep.has(name)) setCookie(response.headers, name, '', undefined, true)
        }
      }
    } else if (response.ok && isSignout && activeBefore) {
      setCookie(response.headers, slotName(activeBefore.userId), '', undefined, true)
    }
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response('Method not allowed', { status: 405 })
  let path: string
  try {
    path = decodeURIComponent(url.pathname)
  } catch {
    return new Response('Not found', { status: 404 })
  }
  if (path.includes('..') || path.includes('\\') || path.includes('\0'))
    return new Response('Not found', { status: 404 })
  const file = Bun.file(`dist${path === '/' ? '/index.html' : path}`)
  if (!(await file.exists())) return new Response('Not found', { status: 404 })
  return new Response(file, {
    headers: { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' },
  })
}

if (import.meta.main) Bun.serve({ port: config.PORT, hostname: '0.0.0.0', fetch: handle })
