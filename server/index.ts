import { betterAuth } from 'better-auth'
import { Pool } from 'pg'
import { z } from 'zod'
import { createHandler } from '../functions/notebook-service'

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
  if (url.pathname === '/health' && request.method === 'GET') {
    try {
      await pool.query(
        'SELECT course_enrollments.active, courses.open FROM app_accounts, teachers, students, courses, course_enrollments, events, neon_auth."user", neon_auth.account, neon_auth.session, neon_auth.verification LIMIT 0',
      )
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
