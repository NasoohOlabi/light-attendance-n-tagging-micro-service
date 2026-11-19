import { afterAll, expect, test } from 'bun:test'
import { Pool } from 'pg'
import { z } from 'zod'
import { invitationResponseSchema } from '../shared/invitations'
import { startIntegrationServer } from './integration-server'

const databaseUrl = process.env.TEST_RAILWAY_DATABASE_URL
const integration = databaseUrl ? test : test.skip
let server: ReturnType<typeof Bun.spawn> | undefined
let pool: Pool | undefined
const requestId = crypto.randomUUID()
let adminId = ''
const adminTeacherId = crypto.randomUUID()
afterAll(async () => {
  server?.kill()
  if (!pool) return
  const rows = await pool.query(
    'SELECT auth_user_id, teacher_id, student_id FROM app_accounts WHERE invitation_request_id = $1',
    [requestId],
  )
  await pool.query(
    'DELETE FROM app_accounts WHERE invitation_request_id = $1 OR auth_user_id = $2',
    [requestId, adminId],
  )
  for (const row of rows.rows) {
    await pool.query('DELETE FROM neon_auth.session WHERE "userId" = $1', [row.auth_user_id])
    await pool.query('DELETE FROM neon_auth.account WHERE "userId" = $1', [row.auth_user_id])
    await pool.query('DELETE FROM neon_auth."user" WHERE id = $1', [row.auth_user_id])
    if (row.teacher_id) await pool.query('DELETE FROM teachers WHERE id = $1', [row.teacher_id])
    if (row.student_id) await pool.query('DELETE FROM students WHERE id = $1', [row.student_id])
  }
  if (adminId) {
    await pool.query('DELETE FROM neon_auth.session WHERE "userId" = $1', [adminId])
    await pool.query('DELETE FROM neon_auth.account WHERE "userId" = $1', [adminId])
    await pool.query('DELETE FROM neon_auth."user" WHERE id = $1', [adminId])
  }
  await pool.query('DELETE FROM teachers WHERE id = $1', [adminTeacherId])
  await pool.end()
})
integration(
  'invited accounts enforce setup, role access and credential rotation',
  async () => {
    if (!databaseUrl) throw new Error('Disposable database required')
    pool = new Pool({ connectionString: databaseUrl })
    const { origin, child } = await startIntegrationServer(databaseUrl)
    server = child
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
      fetch(`${origin}${path}`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      })
    const signup = await post('/api/auth/sign-up/email', {
      name: 'Synthetic Admin',
      email: `${crypto.randomUUID()}@example.test`,
      password: 'synthetic-password',
    })
    expect(signup.status).toBe(200)
    adminId = z.object({ user: z.object({ id: z.uuid() }) }).parse(await signup.json()).user.id
    const adminHeaders = {
      cookie: signup.headers.get('set-cookie')?.split(';')[0] ?? '',
      'x-user-id': adminId,
    }
    await pool.query(
      "INSERT INTO teachers (id, auth_user_id, name, access_mode) VALUES ($1, $2, 'Synthetic Admin', 'read_write')",
      [adminTeacherId, adminId],
    )
    await pool.query(
      "INSERT INTO app_accounts (auth_user_id, role, teacher_id) VALUES ($1, 'administrator', $2)",
      [adminId, adminTeacherId],
    )
    const body = {
      requestId,
      people: [
        { firstName: 'Test', lastName: 'Student', role: 'student' },
        { firstName: 'Test', lastName: 'Teacher', role: 'teacher' },
        { firstName: 'Test', lastName: 'Admin', role: 'administrator' },
      ],
    }
    const invite = await post('/api/admin/accounts/invite', body, adminHeaders)
    expect(invite.status, await invite.clone().text()).toBe(200)
    const { invitations } = invitationResponseSchema.parse(await invite.json())
    expect((await post('/api/admin/accounts/invite', body, adminHeaders)).status).toBe(409)
    const records = await pool.query(
      'SELECT a.role, a.teacher_id, a.student_id, t.access_mode, s.teacher_id AS assignment FROM app_accounts a LEFT JOIN teachers t ON t.id = a.teacher_id LEFT JOIN students s ON s.id = a.student_id WHERE invitation_request_id = $1',
      [requestId],
    )
    expect(records.rowCount).toBe(3)
    expect(records.rows.find((row) => row.role === 'student').assignment).toBeNull()
    expect(records.rows.find((row) => row.role === 'teacher').access_mode).toBe('read_write')
    const person = invitations[0]
    const alias = await pool.query(
      'SELECT u.email FROM neon_auth."user" u JOIN app_accounts a ON a.auth_user_id = u.id::text WHERE a.invitation_username = $1',
      [person.username],
    )
    expect(
      (
        await post('/api/auth/sign-in/email', {
          email: alias.rows[0].email,
          password: person.temporaryPassword,
        })
      ).status,
    ).toBe(401)
    const login = (username: string, password: string) =>
      post('/api/auth/sign-in/username', { username, password })
    const signed = await login(person.username, person.temporaryPassword)
    expect(signed.status, await signed.clone().text()).toBe(200)
    const userId = z.object({ user: z.object({ id: z.uuid() }) }).parse(await signed.json()).user.id
    const headers = {
      cookie: signed.headers.get('set-cookie')?.split(';')[0] ?? '',
      'x-user-id': userId,
    }
    const me = await fetch(`${origin}/api/me`, { headers })
    expect(me.status).toBe(200)
    expect((await me.json()).account.invitationProfile.requiresSetup).toBe(true)
    expect((await fetch(`${origin}/api/student/attendance`, { headers })).status).toBe(403)
    expect((await post('/api/admin/accounts/invite', body, headers)).status).toBe(403)
    expect(
      (
        await post(
          '/api/auth/change-password',
          { currentPassword: person.temporaryPassword, newPassword: 'some-new-password' },
          headers,
        )
      ).status,
    ).toBe(403)
    expect(
      (await post('/api/auth/change-email', { newEmail: 'other@example.test' }, headers)).status,
    ).toBe(403)
    const profile = {
      username: `student${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
      phone: '12345678',
      birthDate: '2000-01-01',
      currentPassword: person.temporaryPassword,
      newPassword: 'personal-password-123',
    }
    expect(
      (
        await post(
          '/api/me/invitation-profile',
          { ...profile, username: invitations[1].username },
          headers,
        )
      ).status,
    ).toBe(409)
    expect(
      (await post('/api/me/invitation-profile', { ...profile, currentPassword: 'wrong' }, headers))
        .status,
    ).toBe(400)
    expect(
      (
        await post(
          '/api/me/invitation-profile',
          { ...profile, newPassword: person.temporaryPassword },
          headers,
        )
      ).status,
    ).toBe(400)
    expect((await post('/api/me/invitation-profile', profile, headers)).status).toBe(200)
    expect((await fetch(`${origin}/api/me`, { headers })).status).toBe(401)
    expect((await login(profile.username, person.temporaryPassword)).status).toBe(401)
    expect((await login(person.username, profile.newPassword)).status).toBe(401)
    const fresh = await login(profile.username, profile.newPassword)
    expect(fresh.status).toBe(200)
    const freshHeaders = {
      cookie: fresh.headers.get('set-cookie')?.split(';')[0] ?? '',
      'x-user-id': userId,
    }
    expect(
      (await fetch(`${origin}/api/student/attendance`, { headers: freshHeaders })).status,
    ).toBe(200)
    expect((await fetch(`${origin}/api/notebook`, { headers: freshHeaders })).status).toBe(403)
    expect((await fetch(`${origin}/api/admin`, { headers: freshHeaders })).status).toBe(403)
  },
  30000,
)
