import { clickAccountAction } from './profileActions'
import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

test('profile menu preserves attendance draft and dismisses', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore with sample students' }).click()
  await page.getByRole('button', { name: 'Take attendance' }).click()
  const attendance = page.locator('select[aria-label$=" Omar"]')
  await attendance.selectOption('absent')
  const trigger = page.locator('.profile-trigger')
  await expect(trigger.locator('svg')).toBeVisible()
  await trigger.click()
  await page
    .getByRole('button', { name: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629', exact: true })
    .click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  const menu = await page.locator('.profile-panel').boundingBox()
  expect(menu?.x).toBeGreaterThanOrEqual(0)
  expect(menu ? menu.x + menu.width : Infinity).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0)
  await expect(attendance).toHaveValue('absent')
  await page.keyboard.press('Escape')
  await expect(page.locator('.profile-panel')).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await trigger.click()
  await page.locator('main').click({ position: { x: 5, y: 5 } })
  await expect(page.locator('.profile-panel')).toHaveCount(0)
  await trigger.click()
  await clickAccountAction(page, 'English')
  await clickAccountAction(page, 'Close session')
  await expect(page.getByRole('button', { name: 'Explore with sample students' })).toBeVisible()
})

for (const role of ['administrator', 'teacher', 'student']) {
  test(`${role} can update their own profile and preferences`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    let name = 'Synthetic User'
    let image: string | null = null
    let failNext = false
    const userId = '10000000-0000-4000-8000-000000000001'
    await page.route('**/api/auth/**', async (route) => {
      if (new URL(route.request().url()).pathname.endsWith('/update-user')) {
        if (failNext) {
          failNext = false
          return route.fulfill({ status: 500, json: { message: 'Synthetic failure' } })
        }
        const body = route.request().postDataJSON()
        name = body.name
        if ('image' in body) image = body.image
        return route.fulfill({ json: { status: true } })
      }
      const now = new Date().toISOString()
      return route.fulfill({
        json: {
          user: {
            id: userId,
            name,
            image,
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
    await page.route('**/api/me', (route) =>
      route.fulfill({
        json: {
          account: {
            role,
            id: userId,
            name: 'Synthetic User',
            canRead: true,
            canWrite: role !== 'student',
            expiresAt: null,
          },
        },
      }),
    )
    await page.goto('/?page=app&view=profile')
    await expect(page.getByRole('heading', { name: 'Profile settings' })).toBeVisible()
    await page.getByLabel('Name', { exact: true }).fill('Updated User')
    await page.locator('input[type=file]').setInputFiles({
      name: 'invalid.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image'),
    })
    await expect(page.getByRole('alert')).toContainText('Choose a PNG')
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 2
      canvas.height = 2
      return canvas.toDataURL('image/png').split(',')[1]
    })
    await page.locator('input[type=file]').setInputFiles({
      name: 'portrait.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    })
    await expect(page.locator('.profile-photo img')).toBeVisible()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('status')).toContainText('Profile saved')
    expect(name).toBe('Updated User')
    expect(image).toMatch(/^data:image\/jpeg;base64,/)
    await page.reload()
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Updated User')
    await expect(page.locator('.profile-photo img')).toBeVisible()
    await page.getByRole('button', { name: 'Remove photo' }).click()
    failNext = true
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('alert')).toContainText('Could not save')
    expect(image).not.toBeNull()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('status')).toContainText('Profile saved')
    expect(image).toBeNull()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (role === 'administrator') {
      await mkdir('.artifacts/verification', { recursive: true })
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.screenshot({ path: '.artifacts/verification/profile-settings-desktop.png' })
      await page.getByRole('button', { name: 'Profile', exact: true }).click()
      await page.screenshot({ path: '.artifacts/verification/profile-menu-desktop.png' })
      await page.getByRole('button', { name: 'العربية', exact: true }).click()
      await expect(page.getByRole('button', { name: 'العربية', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await page.getByRole('button', { name: 'داكن', exact: true }).click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await page.setViewportSize({ width: 320, height: 800 })
      await page.screenshot({ path: '.artifacts/verification/profile-menu-arabic-dark-phone.png' })
      await page.keyboard.press('Escape')
      await page.screenshot({
        path: '.artifacts/verification/profile-settings-arabic-dark-phone.png',
      })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
  })
}
