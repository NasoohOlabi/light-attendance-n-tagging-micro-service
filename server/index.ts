import { betterAuth } from 'better-auth'
import { Pool } from 'pg'
import { z } from 'zod'
import { createHandler } from '../functions/notebook-service'
import { readBoundedBody, validProfileRequest, validSignupRequest } from './profile'

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
  emailAndPassword: { enabled: true },
})
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
    return session.user.id
  },
)

export async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)
  let authPath: string
  try {
    authPath = decodeURIComponent(url.pathname).replace(/\/+$/, '').toLowerCase()
  } catch {
    return new Response('Not found', { status: 404 })
  }
  if (
    (authPath === '/api/auth/update-user' || authPath === '/api/auth/sign-up/email') &&
    url.pathname !== authPath
  )
    return new Response('Not found', { status: 404 })
  if (url.pathname === '/health' && request.method === 'GET') {
    try {
      await pool.query(
        'SELECT course_enrollments.teacher_id, course_enrollments.active, course_enrollments.handbook_received, course_enrollments.notes, course_enrollments.grade_decisions, app_accounts.invitation_request_id, app_accounts.invitation_username, app_accounts.invitation_phone, app_accounts.invitation_birth_date, app_accounts.invitation_requires_setup, students.whatsapp, students.location, students.birth_year, courses.open, courses.attendance_minimum, courses.practical_minimum, courses.theory_minimum FROM app_accounts, teachers, students, courses, course_enrollments, events, neon_auth."user", neon_auth.account, neon_auth.session, neon_auth.verification LIMIT 0',
      )
      const assignment = await pool.query(
        "SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'teacher_id'",
      )
      if (assignment.rows[0]?.is_nullable !== 'YES') throw new Error('Roster migration required')
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
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    if (
      request.method === 'POST' &&
      (url.pathname === '/api/auth/update-user' || url.pathname === '/api/auth/sign-up/email')
    ) {
      const body = url.pathname.endsWith('/update-user')
        ? await validProfileRequest(request)
        : await validSignupRequest(request)
      if (body === null) return Response.json({ error: 'Invalid account data' }, { status: 400 })
      request = new Request(request.url, { method: request.method, headers: request.headers, body })
    }
    if (
      ['/api/auth/change-password', '/api/auth/set-password', '/api/auth/change-email'].includes(
        authPath,
      )
    ) {
      const session = await auth.api.getSession({ headers: request.headers })
      if (session?.user.id) {
        const invited = await pool.query(
          'SELECT 1 FROM app_accounts WHERE auth_user_id = $1 AND invitation_username IS NOT NULL',
          [session.user.id],
        )
        if (invited.rowCount) return Response.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
    let usernameLogin: { username: string; password: string } | undefined
    if (url.pathname === '/api/auth/sign-in/username' && request.method === 'POST') {
      let input: { username: string; password: string }
      try {
        const body = await readBoundedBody(request, 8192)
        if (body === null) throw new Error('Invalid request')
        input = z
          .strictObject({
            username: z
              .string()
              .trim()
              .toLowerCase()
              .regex(/^[a-z0-9._-]{3,32}$/),
            password: z.string().min(1).max(128),
          })
          .parse(JSON.parse(body))
      } catch {
        return Response.json({ error: 'Invalid credentials' }, { status: 400 })
      }
      usernameLogin = input
    }
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
        if (usernameLogin) {
          const found = await db.query(
            `SELECT u.email FROM app_accounts a JOIN neon_auth."user" u ON u.id::text = a.auth_user_id
            WHERE a.invitation_username = $1 AND a.active AND (a.expires_at IS NULL OR a.expires_at > now())`,
            [usernameLogin.username],
          )
          const email = z.string().safeParse(found.rows[0]?.email)
          if (!email.success) {
            await db.query('COMMIT')
            return Response.json(
              { error: 'Invalid credentials' },
              { status: 401, headers: { 'Cache-Control': 'no-store' } },
            )
          }
          request = new Request(new URL('/api/auth/sign-in/email', request.url), {
            method: 'POST',
            headers: request.headers,
            body: JSON.stringify({ email: email.data, password: usernameLogin.password }),
          })
        } else if (authPath === '/api/auth/sign-in/email') {
          const body = await readBoundedBody(request, 8192)
          let email = ''
          try {
            email = request.headers
              .get('content-type')
              ?.startsWith('application/x-www-form-urlencoded')
              ? (new URLSearchParams(body ?? '').get('email') ?? '')
              : z.object({ email: z.string() }).parse(JSON.parse(body ?? '')).email
          } catch {
            /* Better Auth validates the request */
          }
          if (email.toLowerCase().endsWith('@invitation.invalid')) {
            await db.query('COMMIT')
            return Response.json(
              { error: 'Invalid credentials' },
              { status: 401, headers: { 'Cache-Control': 'no-store' } },
            )
          }
          request = new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body,
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
