import { expect, test } from '@playwright/test'

test.use({ trace: 'off' })

test('recipient signs in, completes setup, and edits personal details', async ({ page }) => {
  let signedIn = false
  let setup = true
  let username = 'student.one'
  let phone = ''
  let birthDate = ''
  const userId = '10000000-0000-4000-8000-000000000001'
  await page.route('**/api/auth/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/sign-in/username')) {
      const body = route.request().postDataJSON()
      expect(body.username).toBe(username)
      signedIn = true
      return route.fulfill({ json: { status: true } })
    }
    if (path.endsWith('/sign-out')) {
      signedIn = false
      return route.fulfill({ json: { success: true } })
    }
    if (!signedIn) return route.fulfill({ json: null })
    const now = new Date().toISOString()
    return route.fulfill({
      json: {
        user: {
          id: userId,
          name: 'Synthetic Student',
          image: null,
          email: 'synthetic@example.test',
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
        session: {
          id: 'session',
          userId,
          token: 'synthetic',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          createdAt: now,
          updatedAt: now,
        },
      },
    })
  })
  await page.route('**/api/me/invitation-profile', async (route) => {
    const body = route.request().postDataJSON()
    username = body.username
    phone = body.phone
    birthDate = body.birthDate
    if (body.newPassword) {
      setup = false
      signedIn = false
    }
    return route.fulfill({ json: { success: true } })
  })
  await page.route('**/api/me', (route) =>
    route.fulfill({
      json: {
        account: {
          role: 'student',
          id: userId,
          name: 'Synthetic Student',
          canRead: true,
          canWrite: false,
          expiresAt: null,
          invitationProfile: {
            username,
            phone: phone || null,
            birthDate: birthDate || null,
            requiresSetup: setup,
          },
        },
      },
    }),
  )
  await page.goto('/?page=app&view=profile&login=username')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill('temporary-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Complete your details' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Profile settings' })).toHaveCount(0)
  await page.getByLabel('Phone').fill('123456789')
  await page.getByLabel('Date of birth').fill('2000-01-01')
  await page.getByLabel('Temporary password').fill('temporary-password')
  await page.getByLabel('New password').fill('personal-password')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Sign in with your new password' }),
  ).toBeVisible()
  await page.getByLabel('Password', { exact: true }).fill('personal-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Personal details' })).toBeVisible()
  await page.getByLabel('Phone').fill('987654321')
  await page.getByLabel('Current password').fill('personal-password')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Details saved' })).toBeVisible()
  expect(phone).toBe('987654321')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('username sign-in is available in Arabic', async ({ page }) => {
  await page.route('**/api/auth/**', (route) => route.fulfill({ json: null }))
  await page.goto('/?page=app')
  await page.getByRole('button', { name: 'العربية', exact: true }).click()
  await page.getByRole('button', { name: 'تسجيل الدخول باسم المستخدم' }).click()
  await expect(page.getByLabel('اسم المستخدم')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
