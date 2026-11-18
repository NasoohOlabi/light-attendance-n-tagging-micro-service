import { expect, test } from '@playwright/test'

test.use({ trace: 'off' })

test('account chooser preserves the current session on failed login and cancel', async ({
  page,
}) => {
  const admin = {
    userId: '10000000-0000-4000-8000-000000000001',
    name: 'Synthetic Admin',
    identifier: 'admin@example.test',
  }
  const teacher = {
    userId: '10000000-0000-4000-8000-000000000002',
    name: 'Synthetic Teacher',
    identifier: 'teacher.one',
  }
  let current = admin
  let held = [admin]
  await page.route('**/api/device-accounts**', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { accounts: held } })
    const { userId } = route.request().postDataJSON()
    const selected = held.find((account) => account.userId === userId)
    if (!selected) return route.fulfill({ status: 404 })
    current = selected
    return route.fulfill({ json: { ok: true } })
  })
  await page.route('**/api/auth/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/sign-in/username')) {
      const body = route.request().postDataJSON()
      if (body.password !== 'synthetic-password')
        return route.fulfill({ status: 401, json: { error: 'Invalid credentials' } })
      current = teacher
      held = [admin, teacher]
      return route.fulfill({ json: { user: { id: teacher.userId } } })
    }
    const now = new Date().toISOString()
    return route.fulfill({
      json: {
        user: {
          id: current.userId,
          name: current.name,
          email: 'synthetic@example.test',
          emailVerified: true,
          image: null,
          createdAt: now,
          updatedAt: now,
        },
        session: {
          id: 'session',
          userId: current.userId,
          token: 'secret-session-token',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          createdAt: now,
          updatedAt: now,
        },
      },
    })
  })
  await page.route('**/api/me', (route) =>
    route.fulfill({
      json: {
        account: {
          role: 'teacher',
          id: current.userId,
          name: current.name,
          canRead: true,
          canWrite: true,
          expiresAt: null,
        },
      },
    }),
  )
  await page.route('**/api/notebook**', (route) =>
    route.fulfill({
      json: {
        teacher: {
          role: 'teacher',
          id: current.userId,
          name: current.name,
          canRead: true,
          canWrite: true,
          expiresAt: null,
        },
        students: [],
        events: [],
        courses: [],
        enrollments: [],
      },
    }),
  )
  await page.goto('/?page=app&view=profile')
  await page.locator('.profile-trigger').click()
  await expect(page.getByText('Current account')).toBeVisible()
  await expect(page.locator('.account-choices')).not.toContainText('secret-session-token')
  await page.getByRole('button', { name: 'Sign in to another account' }).click()
  await page.getByLabel('Username').fill('teacher.one')
  await page.getByLabel('Password', { exact: true }).fill('wrong')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('.profile-trigger')).toBeVisible()
  expect(current.userId).toBe(admin.userId)
  await page.locator('.profile-trigger').click()
  await page.getByRole('button', { name: 'Sign in to another account' }).click()
  await page.getByLabel('Username').fill('teacher.one')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.locator('.profile-trigger')).toBeVisible()
  await page.locator('.profile-trigger').click()
  await expect(
    page.getByRole('button', { name: /Synthetic Teacher.*Current account/ }),
  ).toBeDisabled()
  await Promise.all([
    page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame()),
    page.getByRole('button', { name: /Synthetic Admin/ }).click(),
  ])
  const activeAdmin = page.getByRole('button', { name: /Synthetic Admin.*Current account/ })
  await page.locator('.profile-trigger').click()
  await expect(activeAdmin).toBeDisabled()
  await page.reload()
  await page.locator('.profile-trigger').click()
  await expect(activeAdmin).toBeDisabled()
  await page.getByRole('button', { name: 'العربية', exact: true }).click()
  await expect(page.getByRole('button', { name: 'تسجيل الدخول إلى حساب آخر' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Synthetic Admin.*الحساب الحالي/ })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
