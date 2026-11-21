import { expect, test, type Locator, type Page } from '@playwright/test'

test.use({ trace: 'off' })

async function expectActionSpacing(save: Locator, signOut: Locator) {
  const saveBox = await save.boundingBox()
  const signOutBox = await signOut.boundingBox()
  if (!saveBox || !signOutBox) throw new Error('Setup actions are missing')
  const separation = Math.max(
    signOutBox.x - (saveBox.x + saveBox.width),
    saveBox.x - (signOutBox.x + signOutBox.width),
    signOutBox.y - (saveBox.y + saveBox.height),
  )
  expect(separation).toBeGreaterThanOrEqual(8)
}

async function checkInvitedProfile(page: Page, role: 'teacher' | 'student', isMobile: boolean) {
  if (isMobile) await page.setViewportSize({ width: 320, height: 680 })
  let signedIn = false
  let setup = true
  let loginCount = 0
  const verifiedPhone = '+12025550110'
  let phone = ''
  const userId = '10000000-0000-4000-8000-000000000001'
  await page.route('**/api/auth/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/sign-in/phone')) {
      const body = route.request().postDataJSON()
      expect(body.phone).toBe(verifiedPhone)
      expect(body.password).toBe(setup ? 'temporary-password' : 'personal-password')
      loginCount += 1
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
    if (setup) {
      expect(body).toEqual({ newPassword: 'personal-password' })
      setup = false
      signedIn = false
    } else {
      expect(body).toEqual({
        username: null,
        phone: '987654321',
        currentPassword: 'personal-password',
      })
      phone = body.phone
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
            username: null,
            verifiedPhone,
            phone: phone || null,
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
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Profile settings' })).toHaveCount(0)
  await expect(page.getByLabel('Username')).toHaveCount(0)
  await expect(page.getByLabel('Phone', { exact: true })).toHaveValue(verifiedPhone)
  await expect(page.getByLabel('Phone', { exact: true })).not.toBeEditable()
  await expect(page.locator('form input:not([readonly])')).toHaveCount(1)
  const save = page.getByRole('button', { name: 'Save details' })
  const signOut = page.getByRole('button', { name: 'Sign out' })
  await expectActionSpacing(save, signOut)
  await page.getByRole('button', { name: 'العربية', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'اختر كلمة مرور جديدة' })).toBeVisible()
  await expect(page.getByLabel('رقم الهاتف')).toHaveValue(verifiedPhone)
  await expect(page.locator('form input:not([readonly])')).toHaveCount(1)
  const arabicSave = page.getByRole('button', { name: 'حفظ البيانات' })
  const arabicSignOut = page.getByRole('button', { name: 'تسجيل الخروج' })
  await expectActionSpacing(arabicSave, arabicSignOut)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await page.getByLabel('New password').fill('personal-password')
  await save.click()
  await expect(page).toHaveURL(/\?page=app$/)
  expect(loginCount).toBe(2)
  await page.goto('/?page=app&view=profile')
  await expect(page.getByRole('heading', { name: 'Personal details' })).toBeVisible()
  await expect(page.locator('input[type=date]')).toHaveCount(0)
  await page.getByLabel('Phone').fill('987654321')
  await page.getByLabel('Current password').fill('personal-password')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Details saved' })).toBeVisible()
  expect(phone).toBe('987654321')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('invited teacher completes setup and edits contact details without a birthday', ({
  page,
  isMobile,
}) => checkInvitedProfile(page, 'teacher', isMobile))

test('invited student completes setup and edits contact details without a birthday', ({
  page,
  isMobile,
}) => checkInvitedProfile(page, 'student', isMobile))

test('username sign-in is available in Arabic', async ({ page }) => {
  const username = '3legacy.user'
  let submitted: unknown
  await page.route('**/api/auth/**', (route) => route.fulfill({ json: null }))
  await page.route('**/api/auth/sign-in/username', (route) => {
    submitted = route.request().postDataJSON()
    return route.fulfill({ status: 401, json: { error: 'Invalid credentials' } })
  })
  await page.goto('/?page=app')
  await page.getByRole('button', { name: 'العربية', exact: true }).click()
  await page.getByLabel('طريقة تسجيل الدخول').selectOption('username')
  await page.getByRole('textbox', { name: 'اسم المستخدم', exact: true }).fill(username)
  await page.getByLabel('كلمة المرور', { exact: true }).fill('synthetic-password')
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(submitted).toEqual({ username, password: 'synthetic-password' })
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
