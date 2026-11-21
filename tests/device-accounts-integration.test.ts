import { afterAll, expect, test } from 'bun:test'
import { Pool } from 'pg'
import { z } from 'zod'
import { invitationResponseSchema } from '../shared/invitations'
import { startIntegrationServer } from './integration-server'
import { createIdentity } from './integration-identity'

// Only use a disposable, migrated database.
const databaseUrl = process.env.TEST_RAILWAY_DATABASE_URL
const integration = databaseUrl ? test : test.skip
const requestId = crypto.randomUUID()
const teacherId = crypto.randomUUID()
let adminId = ''
let pool: Pool | undefined
let server: ReturnType<typeof Bun.spawn> | undefined

afterAll(async () => {
  server?.kill()
  if (!pool) return
  const accounts = await pool.query(
    'SELECT auth_user_id, teacher_id, student_id FROM app_accounts WHERE invitation_request_id = $1 OR auth_user_id = $2',
    [requestId, adminId],
  )
  await pool.query(
    'DELETE FROM app_accounts WHERE invitation_request_id = $1 OR auth_user_id = $2',
    [requestId, adminId],
  )
  for (const account of accounts.rows) {
    await pool.query('DELETE FROM neon_auth.session WHERE "userId" = $1', [account.auth_user_id])
    await pool.query('DELETE FROM neon_auth.account WHERE "userId" = $1', [account.auth_user_id])
    await pool.query('DELETE FROM neon_auth."user" WHERE id = $1', [account.auth_user_id])
    if (account.student_id)
      await pool.query('DELETE FROM students WHERE id = $1', [account.student_id])
    if (account.teacher_id)
      await pool.query('DELETE FROM teachers WHERE id = $1', [account.teacher_id])
  }
  await pool.query('DELETE FROM teachers WHERE id = $1', [teacherId])
  await pool.end()
})

integration(
  'held sessions switch without granting access to another browser',
  async () => {
    if (!databaseUrl) throw new Error('Disposable database required')
    pool = new Pool({ connectionString: databaseUrl })
    const { origin, child } = await startIntegrationServer(databaseUrl)
    server = child

    // Apply Set-Cookie responses as a browser does, including deletion and replacement.
    const cookies = new Map<string, string>()
    const call = async (path: string, body?: unknown, userId?: string) => {
      const headers: Record<string, string> = {
        origin,
        cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      }
      if (userId) headers['x-user-id'] = userId
      if (body !== undefined) headers['content-type'] = 'application/json'
      const response = await fetch(`${origin}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(';')[0]
        const equals = pair.indexOf('=')
        if (equals < 0) continue
        const name = pair.slice(0, equals)
        if (/max-age=0(?:;|$)/i.test(cookie) || !pair.slice(equals + 1)) cookies.delete(name)
        else cookies.set(name, pair.slice(equals + 1))
      }
      return response
    }
    const adminPhone = '+12025550201'
    adminId = await createIdentity(pool, 'Synthetic Admin', 'synthetic-password-123')
    await pool.query(
      "INSERT INTO teachers (id, auth_user_id, name, access_mode) VALUES ($1, $2, 'Synthetic Admin', 'read_write')",
      [teacherId, adminId],
    )
    await pool.query(
      "INSERT INTO app_accounts (auth_user_id, role, teacher_id, verified_phone) VALUES ($1, 'administrator', $2, $3)",
      [adminId, teacherId, adminPhone],
    )
    await call('/api/auth/sign-in/phone', { phone: adminPhone, password: 'synthetic-password-123' })
    // A session created before this feature has only the original Better Auth cookie.
    for (const name of cookies.keys()) if (!name.includes('session_token')) cookies.delete(name)
    const list = async () => {
      const response = await call('/api/device-accounts')
      expect(response.status).toBe(200)
      expect(response.headers.getSetCookie()).toHaveLength(0)
      return z
        .strictObject({
          accounts: z.array(
            z.strictObject({ userId: z.string(), name: z.string(), identifier: z.string() }),
          ),
        })
        .parse(await response.json()).accounts
    }
    expect((await list()).map((account) => account.userId)).toContain(adminId)
    const adminLogin = await call('/api/auth/sign-in/phone', {
      phone: adminPhone,
      password: 'synthetic-password-123',
      rememberMe: false,
    })
    expect(adminLogin.status).toBe(200)
    const sessionCookies = adminLogin.headers
      .getSetCookie()
      .filter((value) => /session_token|device-session-/.test(value) && !/max-age=0/i.test(value))
    expect(sessionCookies.length).toBeGreaterThan(0)
    for (const cookie of sessionCookies) expect(cookie).not.toMatch(/(?:expires|max-age)=/i)
    for (const name of cookies.keys()) if (name.startsWith('device-session-')) cookies.delete(name)
    const invite = await call(
      '/api/admin/accounts/invite',
      {
        requestId,
        people: [
          {
            firstName: 'Synthetic',
            lastName: 'Teacher',
            role: 'teacher',
            phone: '+12025550120',
            phoneConfirmed: true,
          },
          {
            firstName: 'Synthetic',
            lastName: 'Student',
            role: 'student',
            phone: '+12025550121',
            phoneConfirmed: true,
          },
          ...['Four', 'Five', 'Six'].map((lastName, index) => ({
            firstName: 'Synthetic',
            lastName,
            role: 'teacher',
            phone: `+1202555012${index + 2}`,
            phoneConfirmed: true,
          })),
        ],
      },
      adminId,
    )
    expect(invite.status).toBe(200)
    const invitations = invitationResponseSchema
      .parse(await invite.json())
      .invitations.map((item) => {
        if (!('phone' in item)) throw new Error('Expected a phone invitation')
        return item
      })
    const teacher = invitations[0]
    const student = invitations[1]
    expect(
      (await call('/api/auth/sign-in/phone', { phone: teacher.phone, password: 'wrong' })).status,
    ).toBe(401)
    expect((await call('/api/me', undefined, adminId)).status).toBe(200)
    const signed = await call('/api/auth/sign-in/phone', {
      phone: teacher.phone,
      password: teacher.temporaryPassword,
    })
    expect(signed.status).toBe(200)
    const teacherUserId = z.object({ user: z.object({ id: z.uuid() }) }).parse(await signed.json())
      .user.id
    expect(
      (
        await call(
          '/api/me/invitation-profile',
          {
            phone: teacher.phone,
            currentPassword: teacher.temporaryPassword,
            newPassword: 'personal-password-123',
          },
          teacherUserId,
        )
      ).status,
    ).toBe(200)
    const teacherLogin = await call('/api/auth/sign-in/phone', {
      phone: teacher.phone,
      password: 'personal-password-123',
    })
    expect(teacherLogin.status).toBe(200)
    expect(
      (
        await call(
          '/api/me/invitation-profile',
          {
            phone: teacher.phone,
            birthDate: '2000-01-01',
            currentPassword: 'personal-password-123',
          },
          teacherUserId,
        )
      ).status,
    ).toBe(200)
    expect(
      (await (await call('/api/me', undefined, teacherUserId)).json()).account.invitationProfile,
    ).toMatchObject({
      birthDate: null,
      requiresSetup: false,
    })
    expect((await list()).find((account) => account.userId === teacherUserId)?.identifier).toBe(
      teacher.phone,
    )
    expect((await call('/api/notebook', undefined, teacherUserId)).status).toBe(200)
    expect((await call('/api/admin', undefined, teacherUserId)).status).toBe(403)
    const adminSwitch = await call('/api/device-accounts/switch', { userId: adminId })
    expect(adminSwitch.status).toBe(200)
    for (const cookie of adminSwitch.headers
      .getSetCookie()
      .filter((value) => /session_token|device-session-/.test(value) && !/max-age=0/i.test(value)))
      expect(cookie).not.toMatch(/(?:expires|max-age)=/i)
    expect((await call('/api/admin', undefined, adminId)).status).toBe(200)
    const studentSignIn = await call('/api/auth/sign-in/phone', {
      phone: student.phone,
      password: student.temporaryPassword,
    })
    expect(studentSignIn.status).toBe(200)
    const studentId = z
      .object({ user: z.object({ id: z.uuid() }) })
      .parse(await studentSignIn.json()).user.id
    expect(
      (
        await call(
          '/api/me/invitation-profile',
          {
            phone: student.phone,
            birthDate: '2000-01-01',
            currentPassword: student.temporaryPassword,
            newPassword: 'personal-password-123',
          },
          studentId,
        )
      ).status,
    ).toBe(200)
    expect(
      (
        await call('/api/auth/sign-in/phone', {
          phone: student.phone,
          password: 'personal-password-123',
        })
      ).status,
    ).toBe(200)
    expect((await call('/api/student/attendance', undefined, studentId)).status).toBe(200)
    expect((await call('/api/notebook', undefined, studentId)).status).toBe(403)
    expect((await call('/api/admin', undefined, studentId)).status).toBe(403)
    expect((await call('/api/device-accounts/switch', { userId: adminId })).status).toBe(200)
    expect((await call('/api/me', undefined, studentId)).status).toBe(401)
    expect((await call('/api/auth/sign-out', {}, studentId)).status).toBe(401)
    expect((await call('/api/admin', undefined, adminId)).status).toBe(200)
    const otherBrowser = await fetch(`${origin}/api/device-accounts/switch`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ userId: adminId }),
    })
    expect(otherBrowser.ok).toBe(false)
    expect((await list()).map((account) => account.userId)).toContain(studentId)
    for (const extra of invitations.slice(2, 4))
      expect(
        (
          await call('/api/auth/sign-in/phone', {
            phone: extra.phone,
            password: extra.temporaryPassword,
          })
        ).status,
      ).toBe(200)
    expect((await call('/api/device-accounts/switch', { userId: adminId })).status).toBe(200)
    const sixth = invitations[4]
    expect(
      (
        await call('/api/auth/sign-in/phone', {
          phone: sixth.phone,
          password: sixth.temporaryPassword,
        })
      ).status,
    ).toBe(409)
    expect(await list()).toHaveLength(5)
    expect((await call('/api/me', undefined, adminId)).status).toBe(200)
    const teacherSwitch = await call('/api/device-accounts/switch', { userId: teacherUserId })
    expect(teacherSwitch.status).toBe(200)
    expect((await call('/api/auth/sign-out', {})).status).toBe(200)
    expect((await list()).map((account) => account.userId)).not.toContain(teacherUserId)
    expect((await call('/api/device-accounts/switch', { userId: teacherUserId })).ok).toBe(false)
    await pool.query(
      `UPDATE neon_auth.session SET "expiresAt" = now() - interval '1 day' WHERE "userId" = $1`,
      [studentId],
    )
    expect((await list()).map((account) => account.userId)).not.toContain(studentId)
    expect((await call('/api/device-accounts/switch', { userId: studentId })).ok).toBe(false)
    expect((await call('/api/device-accounts/switch', { userId: adminId })).status).toBe(200)
    expect((await call('/api/admin', undefined, adminId)).status).toBe(200)
  },
  30000,
)
