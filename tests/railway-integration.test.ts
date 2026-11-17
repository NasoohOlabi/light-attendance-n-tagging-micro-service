import { afterAll, expect, test } from 'bun:test'
import { Pool } from 'pg'
import { z } from 'zod'
import { neonAdminBoardSchema } from '../shared/neon'

// Set only to a disposable database with the Railway and application migrations applied.
const databaseUrl = process.env.TEST_RAILWAY_DATABASE_URL
const integration = databaseUrl ? test : test.skip
let server: ReturnType<typeof Bun.spawn> | undefined
let pool: Pool | undefined
let userId = ''
let adminId = ''
const adminTeacherId = crypto.randomUUID()
const teacherId = crypto.randomUUID()
const studentId = crypto.randomUUID()
const origin = 'http://127.0.0.1:39377'
const password = 'synthetic-password-12345'
const email = `synthetic-${crypto.randomUUID()}@example.test`

afterAll(async () => {
  server?.kill()
  if (!pool) return
  await pool.query('DELETE FROM events WHERE student_id = $1', [studentId])
  if (userId) {
    await pool.query('DELETE FROM app_accounts WHERE auth_user_id = $1', [userId])
    await pool.query('DELETE FROM neon_auth."user" WHERE id = $1', [userId])
  }
  if (adminId) {
    await pool.query('DELETE FROM app_accounts WHERE auth_user_id = $1', [adminId])
    await pool.query('DELETE FROM neon_auth."user" WHERE id = $1', [adminId])
  }
  await pool.query('DELETE FROM teachers WHERE id = $1', [adminTeacherId])
  await pool.query('DELETE FROM students WHERE id = $1', [studentId])
  await pool.query('DELETE FROM teachers WHERE id = $1', [teacherId])
  await pool.end()
})

integration(
  'same-origin sessions enforce approval, roles, origin and sign out',
  async () => {
    if (!databaseUrl) throw new Error('Disposable database is required')
    pool = new Pool({ connectionString: databaseUrl })
    server = Bun.spawn([process.execPath, 'run', 'server/index.ts'], {
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_URL: origin,
        BETTER_AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID(),
        PORT: '39377',
      },
      stdout: 'ignore',
      stderr: 'inherit',
    })
    let ready = false
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`${origin}/health`)).ok) {
          ready = true
          break
        }
      } catch {
        /* starting */
      }
      await Bun.sleep(100)
    }
    expect(ready).toBe(true)
    const signUp = await fetch(`${origin}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Synthetic user', email, password }),
    })
    expect(signUp.status, await signUp.clone().text()).toBe(200)
    userId = z.object({ user: z.object({ id: z.uuid() }) }).parse(await signUp.json()).user.id
    const cookie = signUp.headers.get('set-cookie')?.split(';')[0]
    expect(cookie).toBeTruthy()
    const headers = { cookie: cookie ?? '', 'x-user-id': userId }
    expect((await fetch(`${origin}/api/me`, { headers })).status).toBe(403)
    expect(
      (
        await fetch(`${origin}/api/me`, {
          headers: { ...headers, 'x-user-id': crypto.randomUUID() },
        })
      ).status,
    ).toBe(401)
    expect(
      (
        await fetch(`${origin}/api/events`, {
          method: 'POST',
          headers: { ...headers, origin: 'https://evil.example' },
        })
      ).status,
    ).toBe(403)
    await pool.query(
      "INSERT INTO teachers (id, auth_user_id, name, access_mode) VALUES ($1, $2, 'Synthetic teacher', 'read_write')",
      [teacherId, userId],
    )
    await pool.query(
      "INSERT INTO students (id, teacher_id, name) VALUES ($1, $2, 'Synthetic student')",
      [studentId, teacherId],
    )
    await pool.query(
      "INSERT INTO app_accounts (auth_user_id, role, student_id) VALUES ($1, 'student', $2)",
      [userId, studentId],
    )
    expect((await fetch(`${origin}/api/student/attendance`, { headers })).status).toBe(200)
    expect((await fetch(`${origin}/api/notebook`, { headers })).status).toBe(403)
    expect((await fetch(`${origin}/api/admin`, { headers })).status).toBe(403)
    const deniedReset = () =>
      fetch(`${origin}/api/admin/accounts/reset-password`, {
        method: 'POST',
        headers: { ...headers, origin, 'content-type': 'application/json' },
        body: JSON.stringify({
          authUserId: crypto.randomUUID(),
          password,
          passwordConfirmation: password,
        }),
      })
    expect((await deniedReset()).status).toBe(403)
    await pool.query(
      "UPDATE app_accounts SET role = 'teacher', student_id = NULL, teacher_id = $2 WHERE auth_user_id = $1",
      [userId, teacherId],
    )
    const event = {
      id: crypto.randomUUID(),
      actor: 'Synthetic teacher',
      clientTime: new Date().toISOString(),
      receivedAt: '',
      payload: { kind: 'attendance', studentId, date: '2026-11-15', status: 'present' },
    }
    const save = () =>
      fetch(`${origin}/api/events`, {
        method: 'POST',
        headers: { ...headers, origin, 'content-type': 'application/json' },
        body: JSON.stringify({ events: [event] }),
      })
    expect((await save()).status).toBe(200)
    expect((await save()).status).toBe(200)
    const stored = await pool.query('SELECT count(*)::int AS count FROM events WHERE id = $1', [
      event.id,
    ])
    expect(z.object({ count: z.literal(1) }).safeParse(stored.rows[0]).success).toBe(true)
    expect((await fetch(`${origin}/api/notebook`, { headers })).status).toBe(200)
    expect((await deniedReset()).status).toBe(403)
    await pool.query('UPDATE app_accounts SET active = false WHERE auth_user_id = $1', [userId])
    expect((await fetch(`${origin}/api/me`, { headers })).status).toBe(403)
    expect(
      (
        await fetch(`${origin}/api/auth/sign-out`, {
          method: 'POST',
          headers: { ...headers, origin },
        })
      ).status,
    ).toBe(200)
    expect((await fetch(`${origin}/api/me`, { headers })).status).toBe(401)
    const signIn = await fetch(`${origin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    expect(signIn.status).toBe(200)
    const targetCookie = signIn.headers.get('set-cookie')?.split(';')[0] ?? ''
    const adminSignUp = await fetch(`${origin}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Synthetic administrator',
        email: `admin-${crypto.randomUUID()}@example.test`,
        password,
      }),
    })
    expect(adminSignUp.status).toBe(200)
    adminId = z.object({ user: z.object({ id: z.uuid() }) }).parse(await adminSignUp.json()).user.id
    const adminCookie = adminSignUp.headers.get('set-cookie')?.split(';')[0] ?? ''
    await pool.query(
      "INSERT INTO teachers (id, auth_user_id, name, access_mode) VALUES ($1, $2, 'Administrator', 'read_write')",
      [adminTeacherId, adminId],
    )
    await pool.query(
      "INSERT INTO app_accounts (auth_user_id, role, teacher_id) VALUES ($1, 'administrator', $2)",
      [adminId, adminTeacherId],
    )
    const adminHeaders = { cookie: adminCookie, 'x-user-id': adminId }
    const renamed = await fetch(`${origin}/api/auth/update-user`, {
      method: 'POST',
      headers: { ...adminHeaders, origin, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Updated administrator' }),
    })
    expect(renamed.status).toBe(200)
    const directory = await fetch(`${origin}/api/admin`, { headers: adminHeaders })
    expect(directory.status).toBe(200)
    const { accounts } = neonAdminBoardSchema.parse(await directory.json())
    expect(accounts.find((account) => account.authUserId === adminId)).toMatchObject({
      name: 'Administrator',
      profileName: 'Updated administrator',
      role: 'administrator',
    })
    const resetPassword = crypto.randomUUID()
    const reset = (cookie: string, id: string, body: unknown, requestOrigin = origin) =>
      fetch(`${origin}/api/admin/accounts/reset-password`, {
        method: 'POST',
        headers: {
          cookie,
          'x-user-id': id,
          origin: requestOrigin,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    const body = {
      authUserId: userId,
      password: resetPassword,
      passwordConfirmation: resetPassword,
    }
    expect((await reset('', '', body)).status).toBe(401)
    expect((await reset(targetCookie, userId, body)).status).toBe(403)
    expect((await reset(adminCookie, adminId, body, 'https://evil.example')).status).toBe(403)
    expect((await reset(adminCookie, adminId, { ...body, authUserId: adminId })).status).toBe(403)
    expect(
      (await reset(adminCookie, adminId, { ...body, passwordConfirmation: 'wrong' })).status,
    ).toBe(400)
    const before = await pool.query(
      'SELECT role, active, expires_at, teacher_id, student_id FROM app_accounts WHERE auth_user_id = $1',
      [userId],
    )
    expect((await reset(adminCookie, adminId, body)).status).toBe(200)
    expect(
      (await fetch(`${origin}/api/me`, { headers: { cookie: targetCookie, 'x-user-id': userId } }))
        .status,
    ).toBe(401)
    const after = await pool.query(
      'SELECT role, active, expires_at, teacher_id, student_id FROM app_accounts WHERE auth_user_id = $1',
      [userId],
    )
    expect(after.rows).toEqual(before.rows)
    expect(
      (await pool.query('SELECT count(*)::int AS count FROM events WHERE id = $1', [event.id]))
        .rows[0].count,
    ).toBe(1)
    const login = (value: string) =>
      fetch(`${origin}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: value }),
      })
    expect((await login(password)).ok).toBe(false)
    expect((await login(resetPassword)).status).toBe(200)
  },
  180000,
)
