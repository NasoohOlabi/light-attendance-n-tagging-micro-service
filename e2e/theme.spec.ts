import { expect, test } from '@playwright/test'

test('theme follows the device, persists a choice, and works in the notebook on a phone', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/')
  const theme = page.getByRole('combobox', { name: 'Color theme' })
  await expect(theme).toHaveValue('system')
  await expect(page.locator('.wartaq-home')).toHaveCSS('background-color', 'rgb(16, 43, 49)')
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: `.artifacts/theme-home-desktop-${testInfo.project.name}.png` })
  await page.setViewportSize({ width: 320, height: 700 })
  await theme.selectOption('light')
  await expect(page.locator('.wartaq-home')).toHaveCSS('background-color', 'rgb(245, 250, 252)')
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
  await expect(page.locator('.workspace')).toHaveCSS('background-color', 'rgb(16, 43, 49)')
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
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 43, 49)')
})
