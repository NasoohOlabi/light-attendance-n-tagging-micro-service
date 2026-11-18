import { clickAccountAction, openProfile } from './profileActions'
import { expect, test, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { availablePort } from './availablePort'
import { mkdir } from 'node:fs/promises'
import { compactHeader } from './headerLayout'

test.use({ trace: 'off' })
let auth = ''
let api = ''
const adminId = '10000000-0000-4000-8000-000000000001'
const teacherId = '10000000-0000-4000-8000-000000000002'
const studentUserId = '10000000-0000-4000-8000-000000000003'
const courseId = '40000000-0000-4000-8000-000000000001'
const studentId = '20000000-0000-4000-8000-000000000001'
let server: ChildProcess
let origin = ''
test.beforeAll(async ({ browserName }) => {
  if (browserName !== 'chromium') throw new Error('Chromium required')
  const port = await availablePort()
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
      /* starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Synthetic Vite server did not start')
})
test.afterAll(() => server?.kill())

async function mockAuth(page: Page, id: string, image: string | null = null) {
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
    const now = new Date().toISOString()
    return route.fulfill({
      headers,
      json: {
        user: {
          id,
          name: 'Synthetic User',
          image,
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
  const profileAction = [
    'Sign out',
    'English',
    '\u0627\u0644\u0639\u0631\u0628\u064a\u0629',
    '\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c',
  ].includes(name)
  if (profileAction) {
    await openProfile(page)
    const action = page.getByRole('button', { name, exact: true })
    await expect(action).toBeVisible()
    await page.keyboard.press('Escape')
    return action
  }
  const opensStudent = name === 'Open student' || name === 'فتح الطالب'
  const button = page.getByRole('button', { name, exact: !opensStudent })
  await expect(button).toBeVisible()
  if (opensStudent) {
    await expect(button).toHaveText('Synthetic Student')
  } else await expect(button).toHaveText('')
  await expect(button).toHaveAttribute('title', /\S/)
  await expect(button.locator('svg[aria-hidden="true"]')).toHaveClass(/lucide/)
  const box = await button.boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(44)
  expect(box?.height).toBeGreaterThanOrEqual(44)
  return button
}

test('student sees only their attendance and loses it after access is denied', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await mockAuth(
    page,
    studentUserId,
    'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2244%22 height=%2244%22%3E%3Crect width=%2244%22 height=%2244%22 fill=%22teal%22/%3E%3C/svg%3E',
  )
  const paths: string[] = []
  let denied = false
  await page.route(`${api}/**`, async (route) => {
    if (new URL(route.request().url()).pathname.startsWith('/api/auth/')) return route.fallback()
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
  await expect(page.locator('dl')).toContainText('Roster level')
  await expect(page.locator('dl dd')).toHaveText(['Synthetic Student', 'Synthetic Group'])
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    const fields = await page
      .locator('dl > div')
      .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top))
    expect(new Set(fields).size).toBe(1)
    expect(
      await page.locator('table').evaluate((table) => table.scrollWidth <= table.clientWidth),
    ).toBe(true)
    await expect(page.locator('td[data-label]').first()).toBeVisible()
  }
  await expect(page.getByText('2026-11-12')).toBeVisible()
  await expect(page.locator('tbody').getByText('present', { exact: true })).toBeVisible()
  await expect(page.locator('.profile-trigger img')).toBeVisible()
  await expect
    .poll(() =>
      page
        .locator('.profile-trigger img')
        .evaluate((image) => image instanceof HTMLImageElement && image.naturalWidth),
    )
    .toBe(44)
  await openProfile(page)
  const menuBounds = await page.locator('.profile-panel').boundingBox()
  expect(menuBounds?.x).toBeGreaterThanOrEqual(0)
  expect(menuBounds ? menuBounds.x + menuBounds.width : 999).toBeLessThanOrEqual(320)
  await page.keyboard.press('Escape')
  await compactHeader(page, '.role-header')
  await expect(page.getByRole('button', { name: /Notes|Students|History|Settings/ })).toHaveCount(0)
  await clickAccountAction(page, 'العربية')
  await expect(page.getByRole('heading', { name: 'حضوري' })).toBeVisible()
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    const fields = await page
      .locator('dl > div')
      .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top))
    expect(new Set(fields).size).toBe(1)
  }
  await expect(page.locator('tbody').getByText('حاضر', { exact: true })).toBeVisible()
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

test('administrator assigns roles and creates an assigned student', async ({ page }, testInfo) => {
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
    students: [
      {
        studentId,
        name: 'Synthetic Student',
        firstName: 'Synthetic Student',
        lastName: '',
        group: 'Group A',
        active: true,
        teacherId,
      },
      {
        studentId: '20000000-0000-4000-8000-000000000002',
        name: 'أحمد محمد علي',
        firstName: 'أحمد محمد',
        lastName: 'علي',
        group: 'المستوى الثاني',
        active: false,
        teacherId,
      },
      {
        studentId: '20000000-0000-4000-8000-000000000003',
        name: 'Mononym',
        firstName: 'Mononym',
        lastName: '',
        group: 'Level C',
        active: true,
        teacherId: null,
      },
    ],
  }
  await page.route(`${api}/**`, async (route) => {
    if (new URL(route.request().url()).pathname.startsWith('/api/auth/')) return route.fallback()
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
          courses: [{ id: courseId, name: 'Synthetic course', open: true }],
          enrollments: [
            {
              id: studentId,
              courseId,
              studentId,
              level: 'Group A',
              practical: null,
              theory: null,
              active: true,
            },
          ],
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
    if (req.method() === 'POST') {
      const body = req.postDataJSON()
      posts.push({ path, body })
      if (path === '/api/admin/students' && body.studentId === board.students[1].studentId) {
        board.students[1] = {
          ...board.students[1],
          ...body,
          name: [body.firstName, body.lastName].filter(Boolean).join(' '),
        }
      }
    }
    return route.fulfill({ headers, json: board })
  })
  await page.goto(`${origin}/?page=app`)
  await expect(page.getByRole('button', { name: 'Take attendance' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Accounts' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Accounts' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Add student', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Students', level: 1 })).toBeVisible()
  await expect(page.locator('form.role-editor').getByLabel('First name')).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Notebook' }).getByRole('button', { name: 'Dashboard' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Accounts' })).toHaveCount(0)
  await expect(
    page.locator('thead th > button.table-sort, thead th:not(:has(button.table-sort))'),
  ).toHaveText([
    'First name',
    'Last name',
    'Level',
    'WhatsApp',
    'Location',
    'Birth year',
    'Teacher',
    'Active',
    'Actions',
  ])
  await page.getByRole('button', { name: 'Add student', exact: true }).click()
  await page.locator('form.role-editor').getByLabel('First name').fill('Synthetic Direct')
  await page.locator('form.role-editor').getByLabel('Last name').fill('Student')
  await page.locator('form.role-editor').getByLabel('Level', { exact: true }).fill('Group B')
  await expect(page.locator('form.role-editor').getByLabel('Teacher')).toHaveValue('')
  await expect(
    page.locator('form.role-editor').getByLabel('Teacher').locator('option:checked'),
  ).toHaveText('Unassigned')
  await page.getByRole('button', { name: 'Save student' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved.')
  await expect(page.getByRole('heading', { name: 'Accounts' })).toHaveCount(0)
  expect(posts[0].path).toBe('/api/admin/students')
  expect(posts[0].body).toMatchObject({ teacherId: null })
  posts.length = 0
  await page.getByRole('button', { name: 'Open notebook', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Take attendance' })).toBeVisible()
  await page.goto(`${origin}/?page=app&view=invalid`)
  await page.getByRole('combobox', { name: 'Default course', exact: true }).selectOption(courseId)
  await page.getByRole('button', { name: 'Take attendance' }).click()
  await expect(page.getByLabel('Attendance for Synthetic Student')).toBeVisible()
  await clickAccountAction(page, 'Settings')
  await expect(page).toHaveURL(/view=settings/)
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  const navigation = page.getByRole('navigation', { name: 'Notebook' })
  await navigation.getByRole('button', { name: 'Dashboard' }).click()
  await expect(page.getByRole('button', { name: 'Take attendance' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await navigation.getByRole('button', { name: 'Attendance' }).click()
  await expect(page.getByLabel('Attendance for Synthetic Student')).toBeVisible()
  await page.goBack()
  await navigation.getByRole('button', { name: 'Courses' }).click()
  await expect(page).toHaveURL(/view=courses/)
  await page.goBack()
  await page.getByRole('button', { name: 'Open notebook', exact: true }).click()
  await expect(page.getByLabel('Attendance for Synthetic Student')).toBeVisible()
  await page.goto(`${origin}/?page=app&view=settings&account=${teacherId}`)
  await expect(page.getByText('teacher@example.test')).toBeVisible()
  await expect(page.getByLabel('Role')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Role')).toBeVisible()
  await page.getByRole('button', { name: 'Back to accounts' }).click()
  await expect(page.getByText('admin@example.test')).toHaveCount(0)
  await page.goBack()
  await expect(page.getByLabel('Role')).toBeVisible()
  await page.goto(`${origin}/?page=app&view=settings&account=missing`)
  await expect(page.getByText('Account unavailable')).toBeVisible()
  expect(posts).toHaveLength(0)
  await page.goto(`${origin}/?page=app&view=settings`)
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await page.goto(`${origin}/?page=app&view=administration`)
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.locator('.role-tabs button')).toHaveCount(2)
  const tabColors = await page
    .locator('.role-tabs button')
    .evaluateAll((tabs) => tabs.map((tab) => getComputedStyle(tab).backgroundColor))
  expect(tabColors[0]).not.toBe(tabColors[1])
  await expect(page.getByText('admin@example.test')).toHaveCount(0)
  await expect(page.getByLabel('Role').filter({ visible: true })).toHaveCount(0)
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({
    path: `.artifacts/verification/settings-overview-${testInfo.project.name}.png`,
    fullPage: true,
  })
  const account = page.locator('details').filter({ hasText: 'student@example.test' })
  await account.locator('summary').focus()
  await page.keyboard.press('Enter')
  await expect(account.getByLabel('Role')).toBeVisible()
  await page.screenshot({
    path: `.artifacts/verification/settings-editor-${testInfo.project.name}.png`,
    fullPage: true,
  })
  await page.setViewportSize({ width: 320, height: 844 })
  const lastControl = page.locator('.role-page button:visible').last()
  await lastControl.scrollIntoViewIfNeeded()
  const controlBox = await lastControl.boundingBox()
  const navBox = await page.locator('.workspace-rail nav').boundingBox()
  expect(controlBox && navBox && controlBox.y + controlBox.height <= navBox.y).toBe(true)
  {
    const boxes = await page.locator('.workspace-rail nav button').evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect()
        return { top: box.top, width: box.width, height: box.height }
      }),
    )
    expect(boxes).toHaveLength(7)
    for (const box of boxes) {
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.top).toBe(boxes[0].top)
    }
  }
  await clickAccountAction(page, 'العربية')
  await expect(
    account.getByRole('button', { name: 'إعادة تعيين كلمة المرور', exact: true }),
  ).toBeVisible()
  for (const width of [320, 390, 844]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
    if (width === 320) {
      const boxes = await page.locator('.workspace-rail nav button').evaluateAll((buttons) =>
        buttons.map((button) => {
          const box = button.getBoundingClientRect()
          return { top: box.top, width: box.width, height: box.height }
        }),
      )
      expect(boxes).toHaveLength(7)
      for (const box of boxes) {
        expect(box.width).toBeGreaterThanOrEqual(44)
        expect(box.height).toBeGreaterThanOrEqual(44)
        expect(box.top).toBe(boxes[0].top)
      }
    }
  }
  await page.screenshot({
    path: `.artifacts/verification/settings-editor-ar-${testInfo.project.name}.png`,
    fullPage: true,
  })
  await clickAccountAction(page, 'English')
  await account.getByLabel('Role').selectOption('student')
  await expect(account.locator('select').nth(1).locator(`option[value="${studentId}"]`)).toHaveText(
    'Synthetic Student',
  )
  await account.locator('select').nth(1).selectOption(studentId)
  await account.getByRole('button', { name: 'Save role' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved.')
  expect(posts[0]).toEqual({
    path: '/api/admin/accounts/grant',
    body: { role: 'student', authUserId: studentUserId, studentId, expiresAt: null },
  })
  const teacher = page.locator('details').filter({ hasText: 'teacher@example.test' })
  await teacher.locator('summary').click()
  await teacher.getByLabel('New password').fill('synthetic-password-one')
  await teacher.getByLabel('Confirm password').fill('synthetic-password-two')
  await teacher.getByRole('button', { name: 'Reset password' }).click()
  await expect(teacher.getByRole('alert')).toHaveText(
    'Passwords must match and contain 8 to 128 characters.',
  )
  expect(posts.some((post) => post.path === '/api/admin/accounts/reset-password')).toBe(false)
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
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name: 'Students' })
    .click()
  await expect(page.getByLabel('Role')).toHaveCount(0)
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name: 'Accounts' })
    .click()
  await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)
  await expect(page.getByLabel('Role').filter({ visible: true })).toHaveCount(0)
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name: 'Students' })
    .click()
  const list = page.getByRole('region', { name: 'Student list' })
  await expect(
    list.locator('thead th > button.table-sort, thead th:not(:has(button.table-sort))'),
  ).toHaveText([
    'First name',
    'Last name',
    'Level',
    'WhatsApp',
    'Location',
    'Birth year',
    'Teacher',
    'Active',
    'Actions',
  ])
  await expect(list.locator('th[scope="col"]')).toHaveCount(9)
  const rows = list.locator('tbody tr')
  await expect(rows.nth(0).locator('td')).toHaveText([
    'Synthetic Student',
    '—',
    'Group A',
    '—',
    '—',
    '—',
    'Synthetic Teacher',
    'Active',
    'Edit',
  ])
  await expect(rows.nth(1).locator('td')).toHaveText([
    'أحمد محمد',
    'علي',
    'المستوى الثاني',
    '—',
    '—',
    '—',
    'Synthetic Teacher',
    'Inactive',
    'Edit',
  ])
  await expect(rows.nth(2).locator('td')).toHaveText([
    'Mononym',
    '—',
    'Level C',
    '—',
    '—',
    '—',
    'Unassigned',
    'Active',
    'Edit',
  ])
  await rows.nth(2).getByRole('button', { name: 'Edit' }).click()
  await expect(page.locator('form.role-editor').getByLabel('Teacher')).toHaveValue('')
  await page.locator('form.role-editor').getByLabel('Teacher').selectOption(teacherId)
  await page.getByRole('button', { name: 'Save student' }).click()
  await expect.poll(() => posts.length).toBe(3)
  expect(posts.at(-1)?.body).toMatchObject({ teacherId })
  posts.pop()
  await page.screenshot({
    path: `.artifacts/verification/student-table-${testInfo.project.name}.png`,
    fullPage: true,
  })
  await rows.nth(1).getByRole('button', { name: 'Edit' }).click()
  await expect(page.locator('form.role-editor').getByLabel('First name')).toHaveValue('أحمد محمد')
  await expect(page.locator('form.role-editor').getByLabel('Last name')).toHaveValue('علي')
  await page.locator('form.role-editor').getByLabel('Last name').fill('خالد')
  await page.getByLabel('WhatsApp number').fill('+963 123')
  await page.locator('form.role-editor').getByLabel('Location').fill('Area')
  await page.locator('form.role-editor').getByLabel('Birth year').fill('2000')
  await page.getByRole('button', { name: 'Save student' }).click()
  await expect.poll(() => posts.length).toBe(3)
  expect(posts[2]).toEqual({
    path: '/api/admin/students',
    body: {
      studentId: '20000000-0000-4000-8000-000000000002',
      firstName: 'أحمد محمد',
      lastName: 'خالد',
      group: 'المستوى الثاني',
      active: false,
      teacherId,
      whatsapp: '+963 123',
      location: 'Area',
      birthYear: 2000,
    },
  })
  posts.pop()
  await rows.nth(1).getByRole('button', { name: 'Edit' }).click()
  await expect(page.locator('form.role-editor').getByLabel('First name')).toHaveValue('أحمد محمد')
  await expect(page.locator('form.role-editor').getByLabel('Last name')).toHaveValue('خالد')
  await expect(page.getByLabel('WhatsApp number')).toHaveValue('+963 123')
  await expect(page.locator('form.role-editor').getByLabel('Location')).toHaveValue('Area')
  await expect(page.locator('form.role-editor').getByLabel('Birth year')).toHaveValue('2000')
  if (testInfo.project.name === 'mobile') {
    await page.setViewportSize({ width: 320, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  }
  await page.locator('form.role-editor').screenshot({
    path: `.artifacts/verification/student-profile-${testInfo.project.name}-en.png`,
  })
  await clickAccountAction(page, 'العربية')
  await expect(page.locator('form.role-editor').getByLabel('سنة الميلاد')).toHaveValue('2000')
  await expect(page.locator('form.role-editor').getByLabel('سنة الميلاد')).toHaveAttribute(
    'type',
    'number',
  )
  await page.locator('form.role-editor').screenshot({
    path: `.artifacts/verification/student-profile-${testInfo.project.name}-ar.png`,
  })
  await clickAccountAction(page, 'English')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.setViewportSize({ width: 320, height: 844 })
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await list.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    await expect(rows.nth(0).getByRole('button', { name: 'Edit' })).toBeVisible()
  }
  await clickAccountAction(page, 'العربية')
  await expect(
    page.locator('thead th > button.table-sort, thead th:not(:has(button.table-sort))'),
  ).toHaveText([
    'الاسم الأول',
    'اسم العائلة',
    'المستوى',
    'واتساب',
    'المنطقة',
    'سنة الميلاد',
    'المعلم',
    'الحالة',
    'الإجراءات',
  ])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  await page.screenshot({
    path: `.artifacts/verification/student-table-ar-${testInfo.project.name}.png`,
    fullPage: true,
  })
  await clickAccountAction(page, 'English')
  await page.getByRole('button', { name: 'Add student' }).click()
  await page.locator('form.role-editor').getByLabel('First name').fill('Synthetic New')
  await page.locator('form.role-editor').getByLabel('Last name').fill('Student')
  await page.locator('form.role-editor').getByLabel('Level', { exact: true }).fill('Group B')
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
    firstName: 'Synthetic New',
    lastName: 'Student',
    group: 'Group B',
    teacherId,
    active: true,
    whatsapp: null,
    location: null,
    birthYear: null,
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
  await clickAccountAction(page, 'العربية')
  for (const width of [320, 390, 844]) {
    await page.setViewportSize({ width, height: 844 })
    await compactHeader(page, '.role-header')
  }
  await page.screenshot({
    path: '.artifacts/verification/compact-role-header-ar.png',
    fullPage: true,
  })
  await clickAccountAction(page, 'English')
  await page.getByRole('button', { name: 'Open notebook', exact: true }).click()
  await expect(page.locator('.workspace')).toBeVisible()
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await openProfile(page)
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
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
  await clickAccountAction(page, 'العربية')
  await openProfile(page)
  await expect(page.locator('.profile-panel button').nth(1)).toBeVisible()
  await page.keyboard.press('Escape')
  await utilityIcon(page, 'تسجيل الخروج')
  await utilityIcon(page, 'تحديث')
  await utilityIcon(page, 'فتح الطالب')
  for (const width of [320, 390, 844]) {
    await page.setViewportSize({ width, height: 844 })
    await compactHeader(page, '.workspace-topline')
  }
  await page.screenshot({ path: '.artifacts/verification/utility-icons-ar.png', fullPage: true })
  await clickAccountAction(page, 'English')
  const openStudent = await utilityIcon(page, 'Open student')
  await openStudent.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`student=${studentId}`))
  await expect(page.getByRole('heading', { name: 'Student information' })).toBeVisible()
  await page.getByRole('button', { name: 'Take attendance' }).click()
  await expect(page.getByLabel('Attendance for Synthetic Student')).toBeVisible()
  await clickAccountAction(page, 'Settings')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  board.accounts.splice(1)
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByText('No other accounts.')).toBeVisible()
  await clickAccountAction(page, 'العربية')
  await expect(page.getByText('لا توجد حسابات أخرى.')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  expect(posts).toHaveLength(3)
})
