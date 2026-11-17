import { clickAccountAction } from './profileActions'
import { expect, test, type Page } from '@playwright/test'
import { compactHeader } from './headerLayout'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdir } from 'node:fs/promises'

test.use({ trace: 'off' })

let auth = ''
let api = ''
const users = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Teacher Alpha',
    email: 'alpha@example.test',
    student: 'Alpha Student',
    studentId: '20000000-0000-4000-8000-000000000001',
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'Teacher Beta',
    email: 'beta@example.test',
    student: 'Beta Student',
    studentId: '20000000-0000-4000-8000-000000000002',
  },
]
let server: ChildProcess
let origin = ''

test.beforeAll(async ({ browserName }, testInfo) => {
  if (browserName !== 'chromium') throw new Error('Synthetic test requires Chromium')
  const port =
    Number(process.env.PLAYWRIGHT_PORT ?? 4173) + (testInfo.project.name === 'mobile' ? 10 : 9)
  await new Promise<void>((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve()))
  })
  origin = `http://127.0.0.1:${port}`
  auth = `${origin}/api/auth`
  api = `${origin}/api`
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
      /* server starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Synthetic Vite server did not start')
})
test.afterAll(() => {
  server?.kill()
})

test('Arabic authentication keeps mobile input semantics and localized feedback', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.route(`${auth}/**`, async (route) => {
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers':
        route.request().headers()['access-control-request-headers'] ?? 'content-type',
    }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (route.request().url().includes('/sign-in/email'))
      return route.fulfill({
        status: 401,
        headers,
        json: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
      })
    return route.fulfill({ headers, json: null })
  })
  await page.goto(origin)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await compactHeader(page, '.workspace-auth-header')
  await clickAccountAction(page, 'العربية')
  await compactHeader(page, '.workspace-auth-header')
  const email = page.getByLabel('البريد الإلكتروني', { exact: true })
  const password = page.getByLabel('كلمة المرور', { exact: true })
  await expect(email).toHaveAttribute('type', 'email')
  await expect(email).toHaveAttribute('autocomplete', 'email')
  await expect(password).toHaveAttribute('autocomplete', 'current-password')
  await email.fill('synthetic@example.test')
  await password.fill('synthetic-password')
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click()
  await expect(page.getByRole('alert')).not.toContainText('Invalid')
  await expect(page.getByRole('alert')).toBeVisible()
  await clickAccountAction(page, 'English')
  await expect(email).toHaveCount(0)
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('synthetic@example.test')
  await expect(page.getByRole('alert')).toContainText('Invalid email or password')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute('autocomplete', 'name')
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
    'autocomplete',
    'new-password',
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
})

test('sign in, reload and switch teacher without mixing notebook data', async ({
  context,
  page,
}) => {
  let current: (typeof users)[number] | undefined
  const events: Record<string, unknown[]> = {}
  let writes = 0
  let releaseApproval = () => {}
  const approvalHeld = new Promise<void>((resolve) => {
    releaseApproval = resolve
  })
  let firstApproval = true
  await context.route(`${auth}/**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
    }
    if (request.method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          ...headers,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers':
            request.headers()['access-control-request-headers'] ?? 'content-type',
        },
      })
    if (path.endsWith('/sign-in/email')) {
      const body = request.postDataJSON()
      current = users.find((user) => user.email === body.email)
    }
    if (path.endsWith('/sign-out')) {
      current = undefined
      return route.fulfill({ json: { success: true }, headers })
    }
    const session = current
      ? {
          user: {
            id: current.id,
            name: current.name,
            email: current.email,
            emailVerified: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          session: {
            id: 'synthetic-session',
            userId: current.id,
            token: 'opaque-session',
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }
      : null
    return route.fulfill({ json: session, headers })
  })
  await context.route(`${api}/**`, async (route) => {
    if (new URL(route.request().url()).pathname.startsWith('/api/auth/')) return route.fallback()
    const request = route.request()
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
    }
    if (request.method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          ...headers,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers':
            request.headers()['access-control-request-headers'] ?? 'content-type',
        },
      })
    const selected = users.find(
      (user) => user.id === request.headers()['x-user-id'] && user.id === current?.id,
    )
    if (!selected) return route.fulfill({ status: 401, json: { error: 'Unauthorized' }, headers })
    const teacher = {
      role: 'teacher',
      id: selected.id,
      name: selected.name,
      canRead: true,
      canWrite: true,
      expiresAt: null,
    }
    if (request.url().endsWith('/api/me')) {
      if (firstApproval) {
        firstApproval = false
        await approvalHeld
      }
      return route.fulfill({ json: { account: teacher, teacher }, headers })
    }
    if (request.method() === 'POST') {
      writes++
      events[selected.id] = [...(events[selected.id] ?? []), ...request.postDataJSON().events]
      if (writes === 1)
        return route.fulfill({ status: 503, json: { error: 'Synthetic response loss' }, headers })
    }
    return route.fulfill({
      json: {
        teacher,
        students: [
          {
            kind: 'student',
            studentId: selected.studentId,
            name: selected.student,
            group: '',
            active: true,
          },
        ],
        events: events[selected.id] ?? [],
      },
      headers,
    })
  })
  await page.goto(`${origin}/?page=app`)
  await page.getByLabel('Email').fill(users[0].email)
  await page.getByLabel('Password').fill('synthetic-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Loading your notebook…')).toBeVisible()
  await expect(page.getByText('Alpha Student')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Explore with sample students' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
  releaseApproval()
  await expect(page.getByRole('button', { name: 'Add student', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Take attendance' }).click()
  await expect(page.getByText('Alpha Student')).toBeVisible()
  await expect(page.getByText('Beta Student')).toHaveCount(0)
  await page.getByLabel('Attendance for Alpha Student').selectOption('present')
  await page.getByRole('button', { name: 'Save attendance (1)' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'The save may already have reached the server',
  )
  await expect(page.getByRole('button', { name: 'Retry pending batch' })).toBeVisible()
  await page.getByRole('button', { name: 'Retry pending batch' }).click()
  await expect(page.getByText('1 record saved.')).toBeVisible()
  expect(writes).toBe(1)
  await page.reload()
  await expect(page.getByText('Alpha Student')).toBeVisible()
  await clickAccountAction(page, 'Sign out')
  await expect(page.locator('.wartaq-home h1')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByLabel('Email').fill(users[1].email)
  await page.getByLabel('Password').fill('synthetic-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('button', { name: 'Take attendance' }).click()
  await expect(page.getByText('Beta Student')).toBeVisible()
  await expect(page.getByText('Alpha Student')).toHaveCount(0)
})

test('session restoration shows a neutral placeholder until signed out', async ({ page }) => {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`${auth}/**`, async (route) => {
    await held
    await route.fulfill({ json: null }).catch(() => {})
  })
  await page.setViewportSize(
    test.info().project.name === 'mobile'
      ? { width: 320, height: 568 }
      : { width: 1280, height: 800 },
  )
  await page.goto(`${origin}/?page=app`)
  await expect(page.getByText('Loading your session…')).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Explore|Grow|Sign out/ })).toHaveCount(0)
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({ path: `.artifacts/verification/loading-${test.info().project.name}.png` })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  release()
  await expect(page.getByLabel('Email')).toBeVisible()
})

test('Arabic session placeholder fits a narrow screen', async ({ page }) => {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.addInitScript(() => localStorage.setItem('halaqa-language', 'ar'))
  await page.route(`${auth}/**`, async (route) => {
    await held
    await route.fulfill({ json: null }).catch(() => {})
  })
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto(`${origin}/?page=app`)
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({
    path: `.artifacts/verification/loading-ar-${test.info().project.name}.png`,
  })
  await expect(page.getByRole('status')).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  release()
})

test('failed session check offers retry', async ({ page }) => {
  let fail = true
  await page.route(`${auth}/**`, async (route) => {
    if (fail) return route.fulfill({ status: 503, json: { message: 'Unavailable' } })
    return route.fulfill({ json: null })
  })
  await page.goto(`${origin}/?page=app`)
  await expect(page.getByRole('alert')).toContainText('Could not check your session')
  await expect(page.getByLabel('Email')).toHaveCount(0)
  fail = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByLabel('Email')).toBeVisible()
})

test('stalled session check times out and can recover', async ({ page }) => {
  let stall = true
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`${auth}/**`, async (route) => {
    if (stall) await held
    await route
      .fulfill({
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-credentials': 'true',
        },
        json: null,
      })
      .catch(() => {})
  })
  await page.goto(`${origin}/?page=app`)
  await expect(page.getByText('Could not check your session. Please try again.')).toBeVisible({
    timeout: 15000,
  })
  stall = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled()
  release()
})

test('account retry ignores stale denial and notebook waits for its snapshot', async ({ page }) => {
  test.setTimeout(45000)
  const user = users[0]
  const now = new Date().toISOString()
  const teacher = {
    role: 'teacher',
    id: user.id,
    name: user.name,
    canRead: true,
    canWrite: true,
    expiresAt: null,
  }
  const session = {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: 'synthetic-session',
      userId: user.id,
      token: 'synthetic-token',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      createdAt: now,
      updatedAt: now,
    },
  }
  let releaseAccount = () => {}
  let releaseNotebook = () => {}
  const accountHeld = new Promise<void>((resolve) => {
    releaseAccount = resolve
  })
  const notebookHeld = new Promise<void>((resolve) => {
    releaseNotebook = resolve
  })
  let accounts = 0
  await page.route(`${auth}/**`, (route) => route.fulfill({ json: session }))
  await page.route(`${api}/**`, async (route) => {
    if (new URL(route.request().url()).pathname.startsWith('/api/auth/')) return route.fallback()
    if (route.request().url().endsWith('/api/me')) {
      accounts++
      if (accounts === 1) {
        await accountHeld
        return route.fulfill({ status: 403 }).catch(() => {})
      }
      return route.fulfill({ json: { account: teacher } })
    }
    await notebookHeld
    return route
      .fulfill({
        json: {
          teacher,
          students: [
            {
              kind: 'student',
              studentId: user.studentId,
              name: user.student,
              group: '',
              active: true,
            },
          ],
          events: [],
        },
      })
      .catch(() => {})
  })
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto(`${origin}/?page=app&tab=attendance`)
  await expect(page.getByText('Loading your notebook\u2026')).toBeVisible()
  await expect(page.getByRole('button', { name: /Sign out|Explore|Grow/ })).toHaveCount(0)
  await expect(page.getByRole('alert')).toContainText('notebook request failed', { timeout: 20000 })
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Loading the shared notebook\u2026')).toBeVisible()
  releaseAccount()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText('Alpha Student')).toHaveCount(0)
  await expect(page.getByText('No students')).toHaveCount(0)
  releaseNotebook()
  await expect(page.getByLabel('Attendance for Alpha Student')).toBeVisible()
  expect(new URL(page.url()).searchParams.get('tab')).toBe('attendance')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
})

async function mockTeacher(page: Page, post: () => Promise<void>) {
  const user = users[0]
  const now = new Date().toISOString()
  const session = {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: 'synthetic-session',
      userId: user.id,
      token: 'synthetic-token',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      createdAt: now,
      updatedAt: now,
    },
  }
  const teacher = {
    role: 'teacher',
    id: user.id,
    name: user.name,
    canRead: true,
    canWrite: true,
    expiresAt: null,
  }
  await page.route(`${auth}/**`, (route) => route.fulfill({ json: session }))
  await page.route(`${api}/**`, async (route) => {
    if (new URL(route.request().url()).pathname.startsWith('/api/auth/')) return route.fallback()
    if (route.request().url().endsWith('/api/me'))
      return route.fulfill({ json: { account: teacher } })
    if (route.request().method() === 'POST') await post()
    return route.fulfill({
      json: {
        teacher,
        students: [
          {
            kind: 'student',
            studentId: user.studentId,
            name: user.student,
            group: '',
            active: true,
          },
        ],
        events: [],
      },
    })
  })
  await page.goto(`${origin}/?page=app`)
  await page.getByRole('button', { name: 'Take attendance' }).click()
  await expect(page.getByLabel('Attendance for Alpha Student')).toBeVisible()
}

async function saveAttendance(page: Page) {
  await page.getByLabel('Attendance for Alpha Student').selectOption('present')
  await page.getByRole('button', { name: 'Save attendance (1)' }).click()
}

test('storage write failure prevents authenticated writes', async ({ page }) => {
  let posts = 0
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('halaqa-pending-neon:')) throw new Error('Synthetic storage failure')
      return original.call(this, key, value)
    }
  })
  await mockTeacher(page, async () => {
    posts++
  })
  await saveAttendance(page)
  await expect(page.getByRole('alert').first()).toContainText('Could not persist the pending batch')
  expect(posts).toBe(0)
})

test('old pending batches block authenticated writes', async ({ page }) => {
  let posts = 0
  await page.addInitScript(() => localStorage.setItem('halaqa-pending-v1:old', 'pending'))
  await mockTeacher(page, async () => {
    posts++
  })
  await expect(page.getByRole('alert').first()).toContainText(
    'Copy the pending batch from browser storage',
  )
  await expect(page.getByRole('button', { name: 'Save attendance (0)' })).toBeDisabled()
  expect(posts).toBe(0)
})

test('corrupted pending storage blocks authenticated writes', async ({ page }) => {
  let posts = 0
  await page.addInitScript(
    (id) => localStorage.setItem(`halaqa-pending-neon:${location.origin}:${id}`, 'invalid'),
    users[0].id,
  )
  await mockTeacher(page, async () => {
    posts++
  })
  await expect(page.getByRole('alert').first()).toContainText('saved batch is corrupted')
  expect(posts).toBe(0)
})

test('a second tab cannot send while a save is in flight', async ({ context, page }) => {
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let posts = 0
  const write = async () => {
    posts++
    await gate
  }
  const second = await context.newPage()
  try {
    await mockTeacher(page, write)
    await mockTeacher(second, write)
    await saveAttendance(page)
    await expect.poll(() => posts).toBe(1)
    await saveAttendance(second)
    await expect(second.getByRole('alert')).toContainText('Another tab is saving')
    expect(posts).toBe(1)
  } finally {
    release()
  }
})

test('malformed notebook snapshots block saving', async ({ page }) => {
  let posts = 0
  await mockTeacher(page, async () => {
    posts++
  })
  await page.route(`${api}/notebook`, (route) =>
    route.fulfill({ json: { students: 'invalid', events: [] } }),
  )
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('The notebook request failed')
  await saveAttendance(page)
  await expect(page.getByRole('alert')).toContainText('The notebook request failed')
  expect(posts).toBe(0)
})

test('pending retry rejects a student removed from the current assignment', async ({ page }) => {
  let posts = 0
  await mockTeacher(page, async () => {})
  await page.route(`${api}/events`, (route) => {
    posts++
    return route.fulfill({ status: 503, json: { error: 'Synthetic response loss' } })
  })
  await saveAttendance(page)
  await expect(page.getByText('1 records awaiting confirmation')).toBeVisible()
  await expect.poll(() => posts).toBe(1)
  const teacher = {
    role: 'teacher',
    id: users[0].id,
    name: users[0].name,
    canRead: true,
    canWrite: true,
    expiresAt: null,
  }
  await page.route(`${api}/notebook`, (route) =>
    route.fulfill({ json: { teacher, students: [], events: [] } }),
  )
  await page.getByRole('button', { name: 'Retry pending batch' }).click()
  await expect(page.getByRole('alert')).toContainText('outside your assigned active students')
  expect(posts).toBe(1)
})
