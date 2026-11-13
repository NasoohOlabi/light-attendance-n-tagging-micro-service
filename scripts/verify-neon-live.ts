import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { Pool } from 'pg'
import { functionBaseUrl } from '@neon/env'
import { z } from 'zod'
import { neonSnapshotSchema } from '../shared/neon'
import { makeEvent } from '../shared/ledger'

// Real provider verification: synthetic accounts/data only, no traces or token output.
const settings = z
  .object({
    DATABASE_URL_UNPOOLED: z.string().min(1),
    NEON_AUTH_BASE_URL: z.url(),
    NEON_BRANCH_ID: z.string().min(1),
    NEON_FUNCTION_HOST_SUFFIX: z.string().min(1),
    NEON_VERIFY_APP_URL: z.url().default('http://127.0.0.1:4173'),
  })
  .parse(process.env)
const api = functionBaseUrl('notebook', settings)
const origin = new URL(settings.NEON_VERIFY_APP_URL).origin
const pool = new Pool({ connectionString: settings.DATABASE_URL_UNPOOLED, max: 2 })
const browser = await chromium.launch()
const contexts = []
const users: string[] = []
const emails: string[] = []
const teachers: string[] = []
const students: string[] = []
const results: string[] = []
const check = (name: string) => {
  results.push(name)
  console.info(`PASS ${name}`)
}
const stateFile = '.local/neon-verification-cleanup.json'
await mkdir('.local', { recursive: true })
async function remember() {
  await writeFile(stateFile, JSON.stringify({ users, emails, teachers, students }))
}
async function call(path: string, token?: string, body?: unknown) {
  return fetch(`${api}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Origin: origin,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  })
}
let failure = false
try {
  assert.equal((await call('/health')).status, 200)
  assert.equal((await call('/api/notebook')).status, 401)
  assert.equal((await call('/api/notebook', 'invalid')).status, 401)
  check('deployed Function health and unauthenticated denial')
  const roles = await pool.query(
    "SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')",
  )
  for (const row of roles.rows)
    for (const table of ['teachers', 'students', 'events'])
      for (const permission of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        const grant = await pool.query('SELECT has_table_privilege($1, $2, $3) AS allowed', [
          row.rolname,
          `public.${table}`,
          permission,
        ])
        assert.equal(grant.rows[0].allowed, false)
      }
  check('no anonymous or Data API grants on application tables')
  const accounts = []
  for (const suffix of ['A', 'B']) {
    const context = await browser.newContext()
    contexts.push(context)
    const page = await context.newPage()
    page.on('requestfailed', (request) => {
      const url = new URL(request.url())
      console.error(
        `Browser request failed: ${url.origin}${url.pathname} (${request.failure()?.errorText})`,
      )
    })
    page.on('response', (response) => {
      const url = new URL(response.url())
      if (response.status() >= 400 && url.origin === new URL(settings.NEON_AUTH_BASE_URL).origin)
        console.error(`Auth HTTP ${response.status()}: ${url.pathname}`)
    })
    page.on('pageerror', (error) => console.error(`Browser error: ${error.name}`))
    const email = `halaqa-verification-${crypto.randomUUID()}@example.com`
    emails.push(email)
    await remember()
    const password = crypto.randomUUID() + 'aA1!'
    const name = `Verification teacher ${suffix}`
    await page.goto(settings.NEON_VERIFY_APP_URL)
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await page.getByLabel('Name', { exact: true }).fill(name)
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Create account', exact: true }).first().click()
    await expect(page.getByRole('alert')).toContainText('awaiting teacher approval', {
      timeout: 30000,
    })
    const authUser = await pool.query('SELECT id FROM neon_auth."user" WHERE email = $1', [email])
    const userId = z.uuid().parse(authUser.rows[0]?.id)
    users.push(userId)
    await remember()
    const teacherId = crypto.randomUUID()
    const studentId = crypto.randomUUID()
    teachers.push(teacherId)
    students.push(studentId)
    await remember()
    const teacherFile = `.local/neon-verify-teacher-${teacherId}.json`
    const studentFile = `.local/neon-verify-student-${studentId}.json`
    await writeFile(teacherFile, JSON.stringify({ id: teacherId, email, name, mode: 'read_write' }))
    await writeFile(
      studentFile,
      JSON.stringify([
        {
          id: studentId,
          teacherId,
          name: `Verification student ${suffix}`,
          group: 'Synthetic verification',
          active: true,
        },
      ]),
    )
    const grant = spawnSync(
      process.execPath,
      ['run', 'scripts/neon-admin.ts', 'teacher', 'grant', teacherFile],
      { stdio: 'pipe' },
    )
    assert.equal(grant.status, 0, 'Private CLI teacher approval by signup email')
    const roster = spawnSync(
      process.execPath,
      ['run', 'scripts/neon-admin.ts', 'students', 'upsert', studentFile],
      { stdio: 'pipe' },
    )
    assert.equal(roster.status, 0, 'Private CLI canonical roster import')
    await unlink(teacherFile)
    await unlink(studentFile)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Halaqa notebook', exact: true })).toBeVisible({
      timeout: 30000,
    })
    const tokenResponse = await context.request.get(`${settings.NEON_AUTH_BASE_URL}/token`, {
      headers: { Origin: origin },
    })
    assert.equal(tokenResponse.status(), 200, 'Real token endpoint')
    const { token } = z.object({ token: z.string().min(1) }).parse(await tokenResponse.json())
    const response = await call('/api/notebook', token)
    assert.equal(response.status, 200)
    const snapshot = neonSnapshotSchema.parse(await response.json())
    assert.equal(snapshot.students.length, 1)
    assert.equal(snapshot.students[0].studentId, studentId)
    accounts.push({ context, page, email, password, name, userId, teacherId, studentId, token })
  }
  check('real browser sign-up, CLI approval/import, JWT and isolated rosters for two teachers')
  const [a, b] = accounts
  assert.ok(a && b)
  await a.page.reload()
  await expect(a.page.getByRole('heading', { name: 'Halaqa notebook', exact: true })).toBeVisible({
    timeout: 30000,
  })
  check('authenticated session restoration after reload')
  const event = makeEvent(a.name, {
    kind: 'attendance',
    studentId: a.studentId,
    date: '2026-11-13',
    status: 'present',
  })
  const duplicate = await Promise.all([
    call('/api/events', a.token, { events: [event] }),
    call('/api/events', a.token, { events: [event] }),
  ])
  assert.deepEqual(
    duplicate.map((r) => r.status),
    [200, 200],
  )
  const stored = await pool.query('SELECT count(*)::int AS count FROM events WHERE id = $1', [
    event.id,
  ])
  assert.equal(stored.rows[0].count, 1)
  assert.equal(
    (
      await call('/api/events', a.token, {
        events: [{ ...event, payload: { ...event.payload, status: 'late' } }],
      })
    ).status,
    409,
  )
  check('real Postgres concurrent retry deduplication and conflicting-ID rejection')
  const foreign = makeEvent(a.name, {
    kind: 'attendance',
    studentId: b.studentId,
    date: '2026-11-13',
    status: 'present',
  })
  assert.equal((await call('/api/events', a.token, { events: [foreign] })).status, 403)
  assert.equal(
    (
      await call('/api/events', a.token, {
        events: [{ ...event, id: crypto.randomUUID(), actor: b.name }],
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await call('/api/events', b.token, {
        events: [
          makeEvent(b.name, { kind: 'reversal', targetId: event.id, reason: 'Foreign target' }),
        ],
      })
    ).status,
    403,
  )
  check('cross-teacher writes, forged actors and foreign corrections denied')
  await pool.query('UPDATE teachers SET access_mode = $1 WHERE id = $2', ['read_only', a.teacherId])
  assert.equal((await call('/api/notebook', a.token)).status, 200)
  assert.equal((await call('/api/events', a.token, { events: [event] })).status, 403)
  await pool.query('UPDATE teachers SET access_mode = $1 WHERE id = $2', [
    'write_only',
    a.teacherId,
  ])
  assert.equal((await call('/api/notebook', a.token)).status, 403)
  assert.equal((await call('/api/events', a.token, { events: [event] })).status, 200)
  await pool.query(
    "UPDATE teachers SET access_mode = $1, expires_at = now() - interval '1 minute' WHERE id = $2",
    ['read_write', a.teacherId],
  )
  assert.equal((await call('/api/notebook', a.token)).status, 403)
  await pool.query('UPDATE teachers SET expires_at = NULL, active = false WHERE id = $1', [
    a.teacherId,
  ])
  assert.equal((await call('/api/notebook', a.token)).status, 403)
  await pool.query('UPDATE teachers SET active = true WHERE id = $1', [a.teacherId])
  check('server-enforced read-only, write-only, expiry and immediate account disable')
  await pool.query('UPDATE students SET teacher_id = $1 WHERE id = $2', [b.teacherId, a.studentId])
  const moved = neonSnapshotSchema.parse(await (await call('/api/notebook', b.token)).json())
  assert.ok(moved.events.some((e) => e.id === event.id))
  assert.equal((await call('/api/events', a.token, { events: [event] })).status, 403)
  await pool.query('UPDATE students SET teacher_id = $1 WHERE id = $2', [a.teacherId, a.studentId])
  check('current assignment controls existing history and prevents stale writes')
  await a.page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await a.page.getByRole('button', { name: 'Notes', exact: true }).click()
  await expect(a.page.getByRole('heading', { name: 'Leave a note', exact: true })).toBeVisible()
  await a.page.getByRole('combobox', { name: /^Student/ }).selectOption(a.studentId)
  await a.page.getByLabel('Tags, separated by commas').fill('verification, تجريبي')
  await a.page.getByLabel('Note', { exact: true }).fill('ملاحظة تحقق تجريبية =1+1')
  await a.page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(a.page.getByText('1 record saved.', { exact: true })).toBeVisible({ timeout: 30000 })
  await a.page.reload()
  await expect(a.page.getByText('ملاحظة تحقق تجريبية =1+1', { exact: true })).toBeVisible({
    timeout: 30000,
  })
  await mkdir('.artifacts/verification', { recursive: true })
  await a.page.screenshot({ path: '.artifacts/verification/neon-live.png', fullPage: true })
  check('real rendered note save and persisted Arabic data after browser reload')
  await a.page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(a.page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  await a.page.getByLabel('Email', { exact: true }).fill(a.email)
  await a.page.getByLabel('Password', { exact: true }).fill('wrong-password')
  await a.page.getByRole('button', { name: 'Sign in', exact: true }).first().click()
  await expect(a.page.getByRole('alert')).toContainText(/invalid|check/i, { timeout: 30000 })
  await a.page.getByLabel('Password', { exact: true }).fill(a.password)
  await a.page.getByRole('button', { name: 'Sign in', exact: true }).first().click()
  await expect(a.page.getByRole('heading', { name: 'Halaqa notebook', exact: true })).toBeVisible({
    timeout: 30000,
  })
  check('real sign-out, invalid-password error and email/password sign-in')
} catch (cause) {
  failure = true
  // Playwright diagnostics can include DOM email values; retain only a local redacted message.
  const message = cause instanceof Error ? cause.message : 'Verification failed'
  console.error(
    message.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]+/g, '[synthetic email]'),
  )
} finally {
  for (const context of contexts) await context.close()
  await browser.close()
  try {
    const registered = await pool.query(
      'SELECT id FROM neon_auth."user" WHERE email = ANY($1::text[])',
      [emails],
    )
    for (const row of registered.rows) {
      const id = z.uuid().parse(row.id)
      if (!users.includes(id)) users.push(id)
    }
    await remember()
    await pool.query('DELETE FROM events WHERE teacher_id = ANY($1::uuid[])', [teachers])
    await pool.query('DELETE FROM students WHERE id = ANY($1::uuid[])', [students])
    await pool.query('DELETE FROM teachers WHERE id = ANY($1::uuid[])', [teachers])
    let cleanupFailed = false
    for (const id of users) {
      z.uuid().parse(id)
      const cleanup = spawnSync('neon', ['neon-auth', 'user', 'delete', id], {
        shell: process.platform === 'win32',
        stdio: 'pipe',
        timeout: 30000,
      })
      if (cleanup.status !== 0) cleanupFailed = true
    }
    if (cleanupFailed) {
      failure = true
      console.error(
        'Synthetic Auth user cleanup incomplete; see the ignored private cleanup manifest.',
      )
    } else {
      check('synthetic accounts and records removed')
      await writeFile(stateFile, JSON.stringify({ users: [], teachers: [], students: [] }))
    }
  } catch {
    failure = true
    console.error('Cleanup incomplete; use the ignored private cleanup manifest.')
  }
  await pool.end()
  await mkdir('.artifacts/verification', { recursive: true })
  await writeFile(
    '.artifacts/verification/neon-live.json',
    JSON.stringify({ passed: !failure, checks: results }, null, 2),
  )
}
if (failure) process.exitCode = 1
