import { afterAll, expect, test } from 'bun:test'
import { Pool } from 'pg'
import { z } from 'zod'
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
    const phone = '+12025550110'
    const teacherPhone = '+12025550111'
    const verified = { phoneConfirmed: true }
    const body = {
      requestId,
      people: [
        { firstName: 'Test', lastName: 'Student', role: 'student', phone, ...verified },
        {
          firstName: 'Test',
          lastName: 'Teacher',
          role: 'teacher',
          phone: teacherPhone,
          ...verified,
        },
        {
          firstName: 'Test',
          lastName: 'Admin',
          role: 'administrator',
          phone: '+12025550112',
          ...verified,
        },
      ],
    }
    const [student, teacher] = body.people
    expect(
      (
        await post(
          '/api/admin/accounts/invite',
          { requestId, people: [{ ...student, phoneConfirmed: false }] },
          adminHeaders,
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await post(
          '/api/admin/accounts/invite',
          { requestId, people: [student, { ...teacher, phone: '001 (202) 555-0110' }] },
          adminHeaders,
        )
      ).status,
    ).toBe(409)
    const invite = await post('/api/admin/accounts/invite', body, adminHeaders)
    expect(invite.status).toBe(200)
    const { invitations } = z
      .object({
        invitations: z.array(
          z.strictObject({
            firstName: z.string(),
            lastName: z.string(),
            role: z.string(),
            phone: z.string(),
            temporaryPassword: z.string().min(8),
          }),
        ),
      })
      .parse(await invite.json())
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
      'SELECT u.email FROM neon_auth."user" u JOIN app_accounts a ON a.auth_user_id = u.id::text WHERE a.invitation_request_id = $1 AND a.role = $2',
      [requestId, 'student'],
    )
    expect(
      (
        await post('/api/auth/sign-in/email', {
          email: alias.rows[0].email,
          password: person.temporaryPassword,
        })
      ).status,
    ).toBe(401)
    const login = (phone: string, password: string) =>
      post('/api/auth/sign-in/phone', { phone, password })
    const signed = await login('+1 (202) 555-0110', person.temporaryPassword)
    expect(signed.status).toBe(200)
    const userId = z.object({ user: z.object({ id: z.uuid() }) }).parse(await signed.json()).user.id
    const headers = {
      cookie: signed.headers.get('set-cookie')?.split(';')[0] ?? '',
      'x-user-id': userId,
    }
    const me = await fetch(`${origin}/api/me`, { headers })
    expect(me.status).toBe(200)
    expect((await me.json()).account.invitationProfile).toMatchObject({
      username: null,
      verifiedPhone: phone,
      requiresSetup: true,
    })
    expect((await fetch(`${origin}/api/student/attendance`, { headers })).status).toBe(403)
    expect((await post('/api/admin/accounts/invite', body, headers)).status).toBe(403)
    const reset = async () => {
      const response = await post(
        '/api/admin/accounts/reset-password-generated',
        { authUserId: userId },
        adminHeaders,
      )
      expect(response.status).toBe(200)
      return z
        .object({
          loginMethod: z.literal('phone'),
          loginIdentifier: z.string(),
          temporaryPassword: z.string().min(16).max(128),
        })
        .parse(await response.json())
    }
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
    const resetInvitation = await reset()
    expect(resetInvitation.loginIdentifier).toBe(phone)
    expect((await login(phone, person.temporaryPassword)).status).toBe(401)
    expect((await fetch(`${origin}/api/me`, { headers })).status).toBe(401)
    const signedAfterReset = await login(phone, resetInvitation.temporaryPassword)
    expect(signedAfterReset.status).toBe(200)
    headers.cookie = signedAfterReset.headers.get('set-cookie')?.split(';')[0] ?? ''
    const secondSession = await login(phone, resetInvitation.temporaryPassword)
    expect(secondSession.status).toBe(200)
    const otherHeaders = {
      ...headers,
      cookie: secondSession.headers.get('set-cookie')?.split(';')[0] ?? '',
    }
    expect((await fetch(`${origin}/api/me`, { headers: otherHeaders })).status).toBe(200)
    expect((await fetch(`${origin}/api/student/attendance`, { headers })).status).toBe(403)
    const profile = { newPassword: 'personal-password-123' }
    const otherPhone = '+12025550119'
    expect((await post('/api/me/invitation-profile', profile)).status).toBe(401)
    expect(
      (await post('/api/me/invitation-profile', { ...profile, verifiedPhone: otherPhone }, headers))
        .status,
    ).toBe(400)
    expect(
      (
        await post(
          '/api/me/invitation-profile',
          { ...profile, newPassword: resetInvitation.temporaryPassword },
          headers,
        )
      ).status,
    ).toBe(400)
    const completions = await Promise.all([
      post('/api/me/invitation-profile', profile, headers),
      post('/api/me/invitation-profile', profile, headers),
    ])
    expect(completions.map(({ status }) => status).sort()).toEqual([200, 400])
    expect((await fetch(`${origin}/api/student/attendance`, { headers })).status).toBe(200)
    expect((await fetch(`${origin}/api/me`, { headers: otherHeaders })).status).toBe(401)
    expect((await login(phone, resetInvitation.temporaryPassword)).status).toBe(401)
    expect((await login(otherPhone, profile.newPassword)).status).toBe(401)
    const fresh = await login(phone, profile.newPassword)
    expect(fresh.status).toBe(200)
    const freshHeaders = {
      cookie: fresh.headers.get('set-cookie')?.split(';')[0] ?? '',
      'x-user-id': userId,
    }
    expect((await post('/api/me/invitation-profile', profile, freshHeaders)).status).toBe(400)
    expect(
      (
        await post(
          '/api/me/invitation-profile',
          { username: null, phone: otherPhone, currentPassword: 'wrong' },
          freshHeaders,
        )
      ).status,
    ).toBe(400)
    const updatedPassword = 'updated-personal-password'
    expect(
      (
        await post(
          '/api/me/invitation-profile',
          {
            username: null,
            phone: otherPhone,
            currentPassword: profile.newPassword,
            newPassword: updatedPassword,
          },
          freshHeaders,
        )
      ).status,
    ).toBe(200)
    expect(
      (await fetch(`${origin}/api/student/attendance`, { headers: freshHeaders })).status,
    ).toBe(200)
    expect((await fetch(`${origin}/api/notebook`, { headers: freshHeaders })).status).toBe(403)
    expect((await fetch(`${origin}/api/admin`, { headers: freshHeaders })).status).toBe(403)
    expect((await fetch(`${origin}/api/me`, { headers })).status).toBe(401)
    expect((await login(phone, profile.newPassword)).status).toBe(401)
    expect((await login(phone, updatedPassword)).status).toBe(200)
    const resetEstablished = await reset()
    expect(resetEstablished.loginIdentifier).toBe(phone)
    expect((await login(phone, updatedPassword)).status).toBe(401)
    expect((await fetch(`${origin}/api/me`, { headers: freshHeaders })).status).toBe(401)
    const signedEstablished = await login(phone, resetEstablished.temporaryPassword)
    expect(signedEstablished.status).toBe(200)
    freshHeaders.cookie = signedEstablished.headers.get('set-cookie')?.split(';')[0] ?? ''
    expect(
      (await fetch(`${origin}/api/student/attendance`, { headers: freshHeaders })).status,
    ).toBe(200)

    const username = `legacy-${crypto.randomUUID().slice(0, 8)}`
    const legacyUserId = z.object({ auth_user_id: z.uuid() }).parse(
      (
        await pool.query(
          `UPDATE app_accounts SET verified_phone = NULL, invitation_username = $2, invitation_phone = $3
         WHERE invitation_request_id = $1 AND role = 'teacher' RETURNING auth_user_id`,
          [requestId, username, teacherPhone],
        )
      ).rows[0],
    ).auth_user_id
    const legacyPassword = invitations[1].temporaryPassword
    const legacyLogin = () =>
      post('/api/auth/sign-in/username', { username, password: legacyPassword })
    const legacySession = await legacyLogin()
    expect(legacySession.status).toBe(200)
    const legacyHeaders = {
      cookie: legacySession.headers.get('set-cookie')?.split(';')[0] ?? '',
      'x-user-id': legacyUserId,
    }
    expect((await login(teacherPhone, legacyPassword)).status).toBe(401)
    const verifyPhone = (authUserId: string, phone: string, headers: Record<string, string>) =>
      post('/api/admin/accounts/verify-phone', { authUserId, phone, ...verified }, headers)
    expect((await verifyPhone(legacyUserId, teacherPhone, freshHeaders)).status).toBe(403)
    expect((await verifyPhone(adminId, teacherPhone, adminHeaders)).status).toBe(403)
    expect((await verifyPhone(legacyUserId, phone, adminHeaders)).status).toBe(409)
    const confirmed = await verifyPhone(legacyUserId, teacherPhone, adminHeaders)
    expect(confirmed.status).toBe(200)
    expect((await confirmed.json()).accounts).toContainEqual(
      expect.objectContaining({ authUserId: legacyUserId, verifiedPhone: teacherPhone }),
    )
    expect((await fetch(`${origin}/api/me`, { headers: legacyHeaders })).status).toBe(401)
    expect((await legacyLogin()).status).toBe(401)
    expect((await login(teacherPhone, legacyPassword)).status).toBe(200)
    await pool.query('UPDATE app_accounts SET expires_at = now() WHERE auth_user_id = $1', [
      legacyUserId,
    ])
    expect((await login(teacherPhone, legacyPassword)).status).toBe(401)
  },
  30000,
)
