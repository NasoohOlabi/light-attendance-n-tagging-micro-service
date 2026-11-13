import { expect, test } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'

test.use({ trace: 'off' })

const auth = 'https://auth.example.test'
const api = 'https://notebook.example.test'
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
  const port = testInfo.project.name === 'mobile' ? '4183' : '4182'
  origin = `http://127.0.0.1:${port}`
  server = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', port, '--strictPort'],
    {
      env: { ...process.env, VITE_NEON_AUTH_URL: auth, VITE_NEON_API_URL: api },
      stdio: 'ignore',
    },
  )
  for (let i = 0; i < 100; i++) {
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

test('sign in, reload and switch teacher without mixing notebook data', async ({
  context,
  page,
}) => {
  let current: (typeof users)[number] | undefined
  const events: Record<string, unknown[]> = {}
  let writes = 0
  const token = (id: string) =>
    `e30.${Buffer.from(JSON.stringify({ sub: id })).toString('base64url')}.c2ln`
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
    if (path.endsWith('/token'))
      return route.fulfill({ json: { token: token(current?.id ?? '') }, headers })
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
    const bearer = request.headers().authorization
    const selected = users.find((user) => bearer === `Bearer ${token(user.id)}`)
    if (!selected) return route.fulfill({ status: 401, json: { error: 'Unauthorized' }, headers })
    const teacher = {
      id: selected.id,
      name: selected.name,
      canRead: true,
      canWrite: true,
      expiresAt: null,
    }
    if (request.url().endsWith('/api/me')) return route.fulfill({ json: { teacher }, headers })
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
  await page.goto(origin)
  await page.getByLabel('Email').fill(users[0].email)
  await page.getByLabel('Password').fill('synthetic-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Alpha Student')).toBeVisible()
  await expect(page.getByText('Beta Student')).toHaveCount(0)
  await page.getByLabel('Attendance for Alpha Student').selectOption('present')
  await page.getByRole('button', { name: 'Save attendance (1)' }).click()
  await expect(page.getByRole('button', { name: 'Retry pending batch' })).toBeVisible()
  await page.getByRole('button', { name: 'Retry pending batch' }).click()
  await expect(page.getByText('1 record saved.')).toBeVisible()
  expect(writes).toBe(1)
  await page.reload()
  await expect(page.getByText('Alpha Student')).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByLabel('Email').fill(users[1].email)
  await page.getByLabel('Password').fill('synthetic-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Beta Student')).toBeVisible()
  await expect(page.getByText('Alpha Student')).toHaveCount(0)
})
