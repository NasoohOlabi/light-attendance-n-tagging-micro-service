import { afterAll, expect, test } from 'bun:test'
import { randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import { z } from 'zod'
import { Auth } from '../telegram/auth'
import { renderBot } from '../telegram/menu'
import { Storage } from '../telegram/storage'
import { Mcp } from '../telegram/transport'
import type { Action, Screen } from '../telegram/types'
import { startIntegrationServer } from './integration-server'
import { createIdentity } from './integration-identity'

const databaseUrl = process.env.TEST_RAILWAY_DATABASE_URL
const integration = databaseUrl ? test : test.skip
const teacherId = crypto.randomUUID()
const studentId = crypto.randomUUID()
const password = randomBytes(32).toString('base64url')
const phone = '+12025550783'
let userId = ''
let clientId = ''
let createdStudentId = ''
let pool: Pool | undefined
let server: ReturnType<typeof Bun.spawn> | undefined
let storage: Storage | undefined

afterAll(async () => {
  server?.kill()
  storage?.close()
  if (!pool) return
  for (const table of [
    'oauthAccessToken',
    'oauthRefreshToken',
    'oauthConsent',
    'oauthClientResource',
  ])
    await pool.query(`DELETE FROM neon_auth."${table}" WHERE "clientId" = $1`, [clientId])
  await pool.query('DELETE FROM neon_auth."oauthClient" WHERE "clientId" = $1', [clientId])
  await pool.query('DELETE FROM app_accounts WHERE auth_user_id = $1', [userId])
  await pool.query('DELETE FROM events WHERE student_id IN ($1, $2)', [
    studentId,
    createdStudentId || studentId,
  ])
  await pool.query('DELETE FROM students WHERE id IN ($1, $2)', [
    studentId,
    createdStudentId || studentId,
  ])
  await pool.query('DELETE FROM teachers WHERE id = $1', [teacherId])
  if (userId) await pool.query('DELETE FROM neon_auth."user" WHERE id = $1', [userId])
  await pool.end()
})

function action(screen: Screen, label: string): Action {
  const button = screen.rows.flat().find((item) => item.label === label)
  if (!button || !('action' in button)) throw new Error(`Missing button ${label}`)
  return button.action
}

integration(
  'real OAuth, MCP and bot screens enforce current role and withdrawal',
  async () => {
    if (!databaseUrl) throw new Error('A disposable migrated database is required')
    pool = new Pool({ connectionString: databaseUrl })
    const started = await startIntegrationServer(databaseUrl)
    server = started.child
    const { origin } = started
    userId = await createIdentity(pool, 'Telegram synthetic', password)
    await pool.query(
      "INSERT INTO teachers (id, auth_user_id, name, access_mode) VALUES ($1, $2, 'Telegram synthetic teacher', 'read_write')",
      [teacherId, userId],
    )
    await pool.query(
      "INSERT INTO students (id, teacher_id, name) VALUES ($1, $2, 'Telegram synthetic student')",
      [studentId, teacherId],
    )
    await pool.query(
      "INSERT INTO app_accounts (auth_user_id, role, teacher_id, verified_phone) VALUES ($1, 'administrator', $2, $3)",
      [userId, teacherId, phone],
    )
    storage = new Storage(':memory:', randomBytes(32).toString('base64'))
    const auth = new Auth(storage, origin, 'https://bot.example.test')
    const authorize = new URL(await auth.begin('synthetic-chat'))
    clientId = authorize.searchParams.get('client_id') ?? ''
    expect(clientId).not.toBe('')
    const response = await fetch(authorize, { redirect: 'manual' })
    const login = new URL(response.headers.get('location') ?? '', origin)
    expect(login.pathname).toBe('/mcp/login')
    const post = (path: string, body: unknown, cookie?: string, user?: string) =>
      fetch(new URL(path, origin), {
        method: 'POST',
        redirect: 'manual',
        headers: {
          origin,
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
          ...(user ? { 'x-user-id': user } : {}),
        },
        body: JSON.stringify(body),
      })
    const signin = await post('/api/auth/sign-in/phone', {
      phone,
      password,
      oauth_query: login.search.slice(1),
    })
    expect(signin.status).toBe(200)
    const cookie = signin.headers
      .getSetCookie()
      .find((value) => value.startsWith('better-auth.session_token='))
      ?.split(';')[0]
    if (!cookie) throw new Error('Missing browser session')
    const consentUrl = new URL(z.object({ url: z.string() }).parse(await signin.json()).url, origin)
    expect(consentUrl.pathname).toBe('/mcp/consent')
    const consent = await post(
      '/api/auth/oauth2/consent',
      { accept: true, oauth_query: consentUrl.search.slice(1) },
      cookie,
      userId,
    )
    expect(consent.status).toBe(200)
    const callback = new URL(z.object({ url: z.string() }).parse(await consent.json()).url)
    expect(callback.origin + callback.pathname).toBe('https://bot.example.test/callback')
    expect(await auth.begin('synthetic-chat')).toBe(authorize.href)
    const code = await auth.callback(callback)
    expect(auth.hasPendingCode('synthetic-chat')).toBe(true)
    expect(auth.redeem('different-chat', code)).toBe(false)
    expect(auth.redeem('synthetic-chat', code)).toBe(true)
    const credentials = await auth.credentials('synthetic-chat')
    if (!credentials) throw new Error('Missing redeemed credentials')
    const mcp = new Mcp(origin, credentials.access_token)
    const render = async (request: Action, input?: string) =>
      renderBot({
        lang: 'en',
        website: origin,
        route: request.route,
        args: request.args ?? {},
        input,
        tools: await mcp.tools(),
        call: (name, args) => mcp.call(name, args),
      })
    const admin = await render({ route: 'home' })
    expect(action(admin, 'Add student').route).toBe('nb.add')
    const add = await render(action(admin, 'Add student'))
    if (!add.prompt) throw new Error('Missing add prompt')
    createdStudentId = add.prompt.args?.studentId ?? ''
    expect((await render(add.prompt, 'Telegram synthetic created')).text).toContain('saved')
    expect(
      (await render({ route: 'nb.students' })).rows.flat().map((item) => item.label),
    ).toContain('Telegram synthetic created')
    const previous = await render({ route: 'nb.summary.course', args: { courseId: 'previous' } })
    expect((await render(action(previous, 'Follow-up'))).text).toContain(
      'No students need follow-up',
    )
    const chart = await render(action(previous, 'Attendance chart'))
    expect(chart.text).toContain('Student 1')
    expect(chart.rows.flat().some((item) => 'url' in item && item.url.startsWith(origin))).toBe(
      true,
    )
    await pool.query("UPDATE app_accounts SET role = 'teacher' WHERE auth_user_id = $1", [userId])
    const teacher = await render({ route: 'home' })
    expect(action(teacher, 'Students').route).toBe('nb.students')
    expect(teacher.rows.flat().map((item) => item.label)).not.toContain('Add student')
    await pool.query(
      "UPDATE app_accounts SET role = 'student', teacher_id = NULL, student_id = $2 WHERE auth_user_id = $1",
      [userId, studentId],
    )
    const student = await render({ route: 'home' })
    expect(action(student, 'My attendance').route).toBe('nb.mine')
    expect(student.rows.flat().map((item) => item.label)).not.toContain('Students')
    const myAttendance = await render({ route: 'nb.mine' })
    expect(myAttendance.text).toContain('Telegram synthetic student')
    expect(myAttendance.text).not.toContain('Telegram synthetic created')
    await pool.query('UPDATE app_accounts SET active = false WHERE auth_user_id = $1', [userId])
    await expect(mcp.tools()).rejects.toThrow()
    await pool.query('UPDATE app_accounts SET active = true WHERE auth_user_id = $1', [userId])
    expect((await mcp.tools()).has('get_my_attendance')).toBe(true)
    const metadata = z
      .object({ revocation_endpoint: z.url() })
      .parse(
        await (await fetch(`${origin}/.well-known/oauth-authorization-server/api/auth`)).json(),
      )
    const revoked = await fetch(metadata.revocation_endpoint, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: clientId,
        token: credentials.access_token,
        token_type_hint: 'access_token',
      }),
    })
    expect(revoked.status).toBe(200)
    await expect(mcp.tools()).rejects.toThrow('MCP request failed (401)')
    await auth.unlink('synthetic-chat')
    expect(await auth.credentials('synthetic-chat')).toBeNull()
  },
  30000,
)
