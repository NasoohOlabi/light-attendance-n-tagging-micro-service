import { expect, test, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdir } from 'node:fs/promises'
import { compactHeader } from './headerLayout'

test.use({ trace: 'off' })
const auth = 'https://roles-auth.example.test'
const api = 'https://roles-api.example.test'
const adminId = '10000000-0000-4000-8000-000000000001'
const teacherId = '10000000-0000-4000-8000-000000000002'
const studentUserId = '10000000-0000-4000-8000-000000000003'
const studentId = '20000000-0000-4000-8000-000000000001'
let server: ChildProcess
let origin = ''
test.beforeAll(async ({ browserName }, testInfo) => {
  if (browserName !== 'chromium') throw new Error('Chromium required')
  const port = testInfo.project.name === 'mobile' ? 4383 : 4382
  await new Promise<void>((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve()))
  })
  origin = `http://127.0.0.1:${port}`
  server = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      env: { ...process.env, VITE_NEON_AUTH_URL: auth, VITE_NEON_API_URL: api },
      stdio: 'ignore',
    },
  )
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('Synthetic Vite server exited')
    try {
      if ((await fetch(origin)).ok) return
    } catch {
      /* starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Synthetic Vite server did not start')
})
test.afterAll(() => server?.kill())

async function mockAuth(page: Page, id: string) {
  const token = `e30.${Buffer.from(JSON.stringify({ sub: id })).toString('base64url')}.c2ln`
  await page.route(`${auth}/**`, async (route) => {
    const request = route.request()
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers':
        request.headers()['access-control-request-headers'] ?? 'content-type',
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (request.url().endsWith('/token')) return route.fulfill({ json: { token }, headers })
    const now = new Date().toISOString()
    return route.fulfill({
      headers,
      json: {
        user: {
          id,
          name: 'Synthetic User',
          email: 'synthetic@example.test',
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
        session: {
          id: 'synthetic-session',
          userId: id,
          token: 'opaque-session',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          createdAt: now,
          updatedAt: now,
        },
      },
    })
  })
}
function cors(requestedHeaders: string | undefined) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': requestedHeaders ?? 'content-type',
  }
}

async function utilityIcon(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true })
  await expect(button).toBeVisible()
  await expect(button).toHaveText('')
  await expect(button).toHaveAttribute('title', /\S/)
  await expect(button.locator('svg[aria-hidden="true"]')).toHaveClass(/lucide/)
  const box = await button.boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(44)
  expect(box?.height).toBeGreaterThanOrEqual(44)
  return button
}

test('student sees only their attendance and loses it after access is denied', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await mockAuth(page, studentUserId)
  const paths: string[] = []
  let denied = false
  await page.route(`${api}/**`, async (route) => {
    const req = route.request()
    const headers = cors(req.headers()['access-control-request-headers'])
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const path = new URL(req.url()).pathname
    paths.push(path)
    if (path === '/api/me')
      return route.fulfill({
        headers,
        json: {
          account: {
            role: 'student',
            id: studentId,
            name: 'Synthetic Student',
            canRead: true,
            canWrite: false,
            expiresAt: null,
          },
        },
      })
    if (path === '/api/student/attendance' && !denied)
      return route.fulfill({
        headers,
        json: {
          student: { studentId, name: 'Synthetic Student', group: 'Synthetic Group' },
          attendance: [{ date: '2026-11-12', status: 'present' }],
        },
      })
    return route.fulfill({ status: 403, headers, json: { error: 'Forbidden' } })
  })
  await page.goto(`${origin}/?page=app`)
  await expect(page.getByRole('heading', { name: 'My attendance' })).toBeVisible()
  await expect(page.getByText('Synthetic Student')).toBeVisible()
  await expect(page.getByText('2026-11-12')).toBeVisible()
  await expect(page.getByText('present', { exact: true })).toBeVisible()
  await compactHeader(page, '.role-header')
  await expect(
    page.getByRole('button', { name: /Notes|Students|History|Administration/ }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'العربية', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'حضوري' })).toBeVisible()
  await expect(page.getByText('حاضر', { exact: true })).toBeVisible()
  await compactHeader(page, '.role-header')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({ path: '.artifacts/verification/student-attendance.png', fullPage: true })
  denied = true
  await page.getByRole('button', { name: 'تحديث', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText('2026-11-12')).toHaveCount(0)
  await expect(page.getByText('Synthetic Student')).toHaveCount(0)
  expect(paths.filter((path) => path === '/api/student/attendance').length).toBeGreaterThanOrEqual(
    2,
  )
  expect(new Set(paths)).toEqual(new Set(['/api/me', '/api/student/attendance']))
})

test('administrator assigns roles and creates an assigned student', async ({ page }) => {
  await mockAuth(page, adminId)
  const posts: { path: string; body: unknown }[] = []
  let notebookReads = 0
  const board = {
    accounts: [
      {
        authUserId: adminId,
        email: 'admin@example.test',
        name: 'Synthetic Admin',
        role: 'administrator',
        active: true,
        expiresAt: null,
        teacherId: adminId,
        studentId: null,
      },
      {
        authUserId: teacherId,
        email: 'teacher@example.test',
        name: 'Synthetic Teacher',
        role: 'teacher',
        active: true,
        expiresAt: null,
        teacherId,
        studentId: null,
      },
      {
        authUserId: studentUserId,
        email: 'student@example.test',
        name: 'Synthetic Account',
        role: null,
        active: false,
        expiresAt: null,
        teacherId: null,
        studentId: null,
      },
    ],
    teachers: [{ teacherId, name: 'Synthetic Teacher', active: true }],
    students: [{ studentId, name: 'Synthetic Student', group: 'Group A', active: true, teacherId }],
  }
  await page.route(`${api}/**`, async (route) => {
    const req = route.request()
    const headers = cors(req.headers()['access-control-request-headers'])
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const path = new URL(req.url()).pathname
    if (path === '/api/notebook') {
      notebookReads++
      return route.fulfill({
        headers,
        json: {
          teacher: {
            role: 'administrator',
            id: adminId,
            name: 'Synthetic Admin',
            canRead: true,
            canWrite: true,
            expiresAt: null,
          },
          students: [
            {
              kind: 'student',
              studentId,
              name: 'Synthetic Student',
              group: 'Group A',
              active: true,
            },
          ],
          events: [],
        },
      })
    }
    if (path === '/api/me')
      return route.fulfill({
        headers,
        json: {
          account: {
            role: 'administrator',
            id: adminId,
            name: 'Synthetic Admin',
            canRead: true,
            canWrite: true,
            expiresAt: null,
          },
        },
      })
    if (req.method() === 'POST') posts.push({ path, body: req.postDataJSON() })
    return route.fulfill({ headers, json: board })
  })
  await page.goto(`${origin}/?page=app`)
  await expect(page.getByRole('heading', { name: 'Accounts and students' })).toBeVisible()
  const account = page.locator('form').filter({ hasText: 'student@example.test' })
  await account.getByLabel('Role').selectOption('student')
  await account.locator('select').nth(1).selectOption(studentId)
  await account.getByRole('button', { name: 'Save role' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved.')
  expect(posts[0]).toEqual({
    path: '/api/admin/accounts/grant',
    body: { role: 'student', authUserId: studentUserId, studentId, expiresAt: null },
  })
  const teacher = page.locator('form').filter({ hasText: 'teacher@example.test' })
  await teacher.locator('select').nth(1).selectOption('read_only')
  await teacher.getByRole('button', { name: 'Save role' }).click()
  await expect.poll(() => posts.length).toBe(2)
  expect(posts[1]).toEqual({
    path: '/api/admin/accounts/grant',
    body: {
      role: 'teacher',
      authUserId: teacherId,
      name: 'Synthetic Teacher',
      mode: 'read_only',
      expiresAt: null,
    },
  })
  const self = page.locator('form').filter({ hasText: 'admin@example.test' })
  await expect(self.getByRole('button', { name: 'Save role' })).toBeDisabled()
  await expect(self.getByRole('button', { name: 'Disable access' })).toBeDisabled()
  await page.getByRole('button', { name: 'Add student' }).click()
  await page.getByLabel('Student name').fill('Synthetic New Student')
  await page.getByLabel('Group', { exact: true }).fill('Group B')
  await page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save student' }) })
    .locator('select')
    .selectOption(teacherId)
  await page.getByRole('button', { name: 'Save student' }).click()
  await expect.poll(() => posts.length).toBe(3)
  expect(posts[2].path).toBe('/api/admin/students')
  expect(posts[2].body).toEqual({
    studentId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    name: 'Synthetic New Student',
    group: 'Group B',
    teacherId,
    active: true,
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({ path: '.artifacts/verification/role-administration.png', fullPage: true })
  await utilityIcon(page, 'Sign out')
  await utilityIcon(page, 'Refresh')
  for (const width of [320, 390, 844]) {
    await page.setViewportSize({ width, height: 844 })
    await compactHeader(page, '.role-header')
  }
  await page.getByRole('button', { name: 'العربية', exact: true }).click()
  for (const width of [320, 390, 844]) {
    await page.setViewportSize({ width, height: 844 })
    await compactHeader(page, '.role-header')
  }
  await page.screenshot({
    path: '.artifacts/verification/compact-role-header-ar.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await page.getByRole('button', { name: 'Open notebook', exact: true }).click()
  await expect(page.locator('.workspace')).toBeVisible()
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await utilityIcon(page, 'Administration')
  await utilityIcon(page, 'Sign out')
  await utilityIcon(page, 'العربية')
  for (const width of [320, 390, 844]) {
    await page.setViewportSize({ width, height: 844 })
    await compactHeader(page, '.workspace-topline')
  }
  const refresh = await utilityIcon(page, 'Refresh')
  await expect(refresh).toBeEnabled()
  const readsBeforeRefresh = notebookReads
  await refresh.click()
  await expect.poll(() => notebookReads).toBeGreaterThan(readsBeforeRefresh)
  await utilityIcon(page, 'Open student')
  await page.getByRole('button', { name: 'العربية', exact: true }).click()
  await utilityIcon(page, 'الإدارة')
  await utilityIcon(page, 'تسجيل الخروج')
  await utilityIcon(page, 'تحديث')
  await utilityIcon(page, 'فتح الطالب')
  for (const width of [320, 390, 844]) {
    await page.setViewportSize({ width, height: 844 })
    await compactHeader(page, '.workspace-topline')
  }
  await page.screenshot({ path: '.artifacts/verification/utility-icons-ar.png', fullPage: true })
  await page.getByRole('button', { name: 'English', exact: true }).click()
  const openStudent = await utilityIcon(page, 'Open student')
  await openStudent.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`student=${studentId}`))
  await expect(page.getByLabel('Attendance for Synthetic Student')).toBeVisible()
  await page.getByRole('button', { name: 'Administration', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Accounts and students' })).toBeVisible()
  expect(posts).toHaveLength(3)
})
