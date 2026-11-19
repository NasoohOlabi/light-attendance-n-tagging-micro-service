import { expect, test } from '@playwright/test'

import { clickAccountAction } from './profileActions'

test('theme follows the device, persists a choice, and works in the notebook on a phone', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/')
  const theme = page.getByRole('combobox', { name: 'Color theme' })
  await expect(theme).toHaveValue('system')
  await expect(page.locator('.wartaq-home')).toHaveCSS('background-color', 'rgb(24, 26, 27)')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#181a1b')
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: `.artifacts/theme-home-desktop-${testInfo.project.name}.png` })
  await page.setViewportSize({ width: 320, height: 700 })
  await theme.selectOption('light')
  await expect(page.locator('.wartaq-home')).toHaveCSS('background-color', 'rgb(245, 250, 252)')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f5fafc')
  await theme.selectOption('dark')
  await page.reload()
  await expect(theme).toHaveValue('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'العربية', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'المظهر' })).toHaveValue('dark')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  await page.screenshot({ path: `.artifacts/theme-home-arabic-phone-${testInfo.project.name}.png` })
  await page.getByRole('button', { name: /طلاب تجريبيين/ }).click()
  await expect(page.locator('.workspace')).toHaveCSS('background-color', 'rgb(24, 26, 27)')
  await page.screenshot({
    path: `.artifacts/theme-notebook-arabic-phone-${testInfo.project.name}.png`,
  })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: `.artifacts/theme-notebook-desktop-${testInfo.project.name}.png` })
  await page.setViewportSize({ width: 320, height: 700 })
  await page.getByRole('button', { name: 'الملف الشخصي' }).click()
  await page.getByRole('button', { name: 'الجهاز', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('.workspace')).toHaveCSS('background-color', 'rgb(245, 250, 252)')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f5fafc')
})

test('dark attendance uses charcoal surfaces, a blue primary action and red absence tiles', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore with sample students' }).click()
  await page.getByRole('button', { name: /Continue attendance/ }).click()
  const group = page.getByRole('group', { name: 'Attendance for Omar' })
  const absent = group.getByRole('button', { name: 'absent', exact: true })
  await expect(group).toHaveCSS('background-color', 'rgb(45, 48, 50)')
  await absent.press('Space')
  await expect(absent).toHaveAttribute('aria-pressed', 'true')
  await expect(absent).toHaveCSS('color', 'rgb(239, 119, 119)')
  await expect(absent).toHaveCSS('outline-color', 'rgb(131, 185, 225)')
  await page.getByRole('button', { name: 'Save attendance (1)' }).click()
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()

  const navigation = page.locator('.workspace-rail')
  const followup = page.locator('.dashboard-insight')
  const absenceTile = followup.locator('.dashboard-mark-absent')
  for (const language of ['en', 'ar']) {
    if (language === 'ar') await clickAccountAction(page, 'العربية')
    await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr')
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 850 })
      await page.mouse.move(0, 0)
      await expect(width === 320 ? navigation.locator('nav') : navigation).toHaveCSS(
        'background-color',
        'rgb(30, 32, 34)',
      )
      await expect(navigation.locator('button.active')).toHaveCSS(
        'background-color',
        'rgb(54, 57, 60)',
      )
      await expect(page.locator('.dashboard-actions')).toHaveCSS(
        'background-color',
        'rgb(45, 48, 50)',
      )
      await expect(page.locator('.dashboard-primary')).toHaveCSS(
        'background-color',
        'rgb(54, 120, 173)',
      )
      await expect(followup).toHaveCSS('background-color', 'rgb(36, 38, 40)')
      await expect(followup).toHaveCSS('border-top-color', 'rgb(60, 64, 67)')
      await expect(absenceTile).toHaveCSS('background-color', 'rgb(36, 38, 40)')
      await expect(absenceTile).toHaveCSS('border-block-start-color', 'rgb(239, 119, 119)')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({
        path: `.artifacts/verification/dark-attendance-${language}-${width}-${testInfo.project.name}.png`,
        fullPage: true,
      })
    }
  }
})

test('theme controls stay synchronized across tabs and tolerate unavailable storage', async ({
  page,
  context,
}) => {
  await page.goto('/')
  const second = await context.newPage()
  await second.goto('/')
  await page.getByRole('combobox', { name: 'Color theme' }).selectOption('dark')
  await expect(second.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(second.getByRole('combobox', { name: 'Color theme' })).toHaveValue('dark')
  await second.close()
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('Synthetic unavailable storage')
      },
    })
  })
  await page.reload()
  await page.getByRole('combobox', { name: 'Color theme' }).selectOption('light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Explore with sample students', exact: true }).click()
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Device', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('saved dark colors apply before the application module runs', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('halaqa-theme', 'dark'))
  await page.route(/\/assets\/index-[^/]+\.js$/, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: '' }),
  )
  await page.goto('/')
  await expect(page.locator('#root')).toBeEmpty()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(24, 26, 27)')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#181a1b')
})
