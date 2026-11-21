import { expect, test, type Page } from '@playwright/test'

test.use({ trace: 'off' })

async function checkInvitedProfile(page: Page, role: 'teacher' | 'student') {
  let signedIn = false
  let setup = true
  const verifiedPhone = '+12025550110'
  let phone = ''
  let birthDate = ''
  const userId = '10000000-0000-4000-8000-000000000001'
  await page.route('**/api/auth/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/sign-in/phone')) {
      const body = route.request().postDataJSON()
      expect(body.phone).toBe(verifiedPhone)
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
    expect(body).not.toHaveProperty('username')
    if (role === 'teacher') expect(body).not.toHaveProperty('birthDate')
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
          role,
          id: userId,
          name: 'Synthetic Student',
          canRead: true,
          canWrite: role === 'teacher',
          expiresAt: null,
          invitationProfile: {
            verifiedPhone,
            phone: phone || null,
            birthDate: birthDate || null,
            requiresSetup: setup,
          },
        },
      },
    }),
  )
  await page.goto('/?page=app&view=profile&login=phone')
  const phoneInput = page.getByRole('textbox', { name: 'Phone number', exact: true })
  await phoneInput.fill(verifiedPhone)
  await page.getByLabel('Password', { exact: true }).fill('temporary-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Complete your details' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Profile settings' })).toHaveCount(0)
  await expect(page.getByLabel('Username')).toHaveCount(0)
  if (role === 'teacher') {
    await expect(page.locator('input[type=date]')).toHaveCount(0)
    await page.getByRole('button', { name: 'العربية', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'أكمل بياناتك' })).toBeVisible()
    await expect(page.locator('input[type=date]')).toHaveCount(0)
    await page.getByRole('button', { name: 'English', exact: true }).click()
  } else await page.getByLabel('Date of birth').fill('2000-01-01')
  await page.getByLabel('Temporary password').fill('temporary-password')
  await page.getByLabel('New password').fill('personal-password')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Sign in with your new password' }),
  ).toBeVisible()
  await expect(phoneInput).toHaveValue(verifiedPhone)
  await page.getByLabel('Password', { exact: true }).fill('personal-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Personal details' })).toBeVisible()
  if (role === 'teacher') await expect(page.locator('input[type=date]')).toHaveCount(0)
  await page.getByLabel('Phone').fill('987654321')
  await page.getByLabel('Current password').fill('personal-password')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Details saved' })).toBeVisible()
  expect(phone).toBe('987654321')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('invited teacher completes setup and edits contact details without a birthday', ({ page }) =>
  checkInvitedProfile(page, 'teacher'))

test('invited student enters a birthday and edits contact details', ({ page }) =>
  checkInvitedProfile(page, 'student'))

test('phone sign-in is available in Arabic', async ({ page }) => {
  let submitted: unknown
  await page.route('**/api/auth/**', (route) => route.fulfill({ json: null }))
  await page.route('**/api/auth/sign-in/phone', (route) => {
    submitted = route.request().postDataJSON()
    return route.fulfill({ status: 401, json: { error: 'Invalid credentials' } })
  })
  await page.goto('/?page=app')
  await page.getByRole('button', { name: 'العربية', exact: true }).click()
  await page.getByRole('textbox', { name: 'رقم الهاتف', exact: true }).fill('0912345678')
  await page.getByLabel('كلمة المرور', { exact: true }).fill('synthetic-password')
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(submitted).toEqual({ phone: '0912345678', password: 'synthetic-password' })
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
