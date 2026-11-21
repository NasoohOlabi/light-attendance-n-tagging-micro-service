import { clickAccountAction } from './profileActions'
import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

async function mobileLayout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  const small = await page
    .locator('button:visible, summary:visible, select:visible, a:visible:not(.skip-link)')
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const box = element.getBoundingClientRect()
          return box.width < 44 || box.height < 44
        })
        .map((element) => element.textContent?.trim()),
    )
  expect(small).toEqual([])
  expect(
    await page
      .locator('input:visible:not([type=checkbox]), select:visible, textarea:visible')
      .evaluateAll((elements) =>
        elements.every((element) => parseFloat(getComputedStyle(element).fontSize) >= 16),
      ),
  ).toBe(true)
}

test('public Midad homepage is bilingual, phone friendly and separate from the app', async ({
  page,
}, testInfo) => {
  const external: string[] = []
  const failures: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url())
  })
  page.on('pageerror', (error) => failures.push(error.message))
  await page.goto('/')
  await expect(page.getByText('v0.1.0 · In development')).toHaveCount(0)
  await expect(page.locator('.wartaq-home')).toBeVisible()
  await expect(page.locator('.wartaq-logo')).toHaveText(['وارتق', 'وارتق'])
  await expect(page.locator('.wartaq-logo img')).toHaveCount(0)
  await expect(page.locator('.workspace')).toHaveCount(0)
  await expect(page).toHaveTitle('Wartaq · Quran recitation course')
  await expect(
    page.getByRole('heading', { name: 'Recite with care. Grow with every verse.' }),
  ).toBeVisible()
  await expect(page.getByText(/Course preview:.*placeholders awaiting confirmation/)).toBeVisible()
  await expect(
    page.getByText(
      'Enrollment is not open yet. Registration details will be shared when confirmed.',
    ),
  ).toBeVisible()
  await expect(page.getByRole('group', { name: 'Language / اللغة' })).toHaveCount(1)
  const languageSwitch = page.getByRole('group', { name: 'Language / اللغة' })
  await expect(languageSwitch.getByRole('button')).toHaveCount(1)
  await expect(languageSwitch.getByRole('button').locator('svg[aria-hidden="true"]')).toHaveCount(1)
  await expect(languageSwitch.locator('.theme-select-icon svg')).toBeVisible()
  await expect(languageSwitch.getByRole('button')).toHaveText('')
  await expect(languageSwitch.getByRole('button').locator('svg')).toHaveClass(/lucide/)
  for (const language of ['العربية', 'English']) {
    const button = languageSwitch.getByRole('button', { name: language, exact: true })
    await button.focus()
    await expect(button).toBeFocused()
    await page.keyboard.press('Enter')
    if (language === 'العربية') {
      await expect(page.getByText('v0.1.0 · قيد التطوير')).toHaveCount(0)
      await expect(page).toHaveTitle('وارتق · دورة تلاوة القرآن')
      await expect(
        page.getByRole('heading', { name: 'تلاوة بعناية، ونمو مع كل آية.' }),
      ).toBeVisible()
      await expect(page.getByText(/معلومات أولية بانتظار التأكيد/)).toBeVisible()
    }
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport)
      await mobileLayout(page)
    }
  }
  await page.getByRole('link', { name: 'Course outline', exact: true }).click()
  await expect(page).toHaveURL(/#how-it-works$/)
  await page.reload()
  await expect(page).toHaveURL(/#how-it-works$/)
  await page.getByRole('link', { name: 'Course details', exact: true }).click()
  await expect(page).toHaveURL(/#enrollment$/)
  await page.reload()
  await expect(page).toHaveURL(/#enrollment$/)
  const question = page.locator('summary').first()
  await question.click()
  await expect(question).toHaveCSS('outline-style', 'none')
  await expect(page.locator('details').first()).toHaveAttribute('open', '')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(question).toBeFocused()
  await expect(question).toHaveCSS('text-decoration-line', 'underline')
  await expect(page.getByRole('button', { name: /sample/i })).toHaveCount(0)
  await page.route('**/api/auth/**', (route) => route.fulfill({ json: null }))
  await page.route('**/api/device-accounts', (route) => route.fulfill({ json: { accounts: [] } }))
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.locator('.workspace')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(page.locator('main')).not.toContainText(/notebook/i)
  await expect(page.getByText('v0.1.0 · In development')).toHaveCount(0)
  await mobileLayout(page)
  await page.goBack()
  await expect(page.locator('.wartaq-home')).toBeVisible()
  await expect(page).not.toHaveURL(/page=app/)
  await clickAccountAction(page, 'العربية')
  await mkdir('.artifacts/wartaq-final', { recursive: true })
  await page.setViewportSize({ width: 1440, height: 1040 })
  await page.screenshot({
    path: `.artifacts/wartaq-final/home-desktop-${testInfo.project.name}.png`,
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: `.artifacts/wartaq-final/home-phone-${testInfo.project.name}.png`,
    fullPage: true,
  })
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click()
  await expect(page).toHaveTitle('وارتق')
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible()
  await expect(page.locator('main')).not.toContainText('دفتر')
  await expect(page.getByText('v0.1.0 · قيد التطوير')).toHaveCount(0)
  await mobileLayout(page)
  await page.screenshot({
    path: `.artifacts/wartaq-final/app-phone-${testInfo.project.name}.png`,
    fullPage: true,
  })
  await page.setViewportSize({ width: 1440, height: 1040 })
  await page.screenshot({
    path: `.artifacts/wartaq-final/app-desktop-${testInfo.project.name}.png`,
    fullPage: true,
  })
  expect(external).toEqual([])
  expect(failures).toEqual([])
})

test('phone sign-in fits both languages and themes', async ({ page }, testInfo) => {
  await page.route('**/api/auth/**', (route) => route.fulfill({ json: null }))
  await page.route('**/api/device-accounts', (route) => route.fulfill({ json: { accounts: [] } }))
  await page.goto('/?page=app')
  const form = page.locator('form[aria-busy]')
  for (const language of ['en', 'ar']) {
    if (language === 'ar') await clickAccountAction(page, 'العربية')
    const signIn = form.getByRole('button', {
      name: language === 'ar' ? 'تسجيل الدخول' : 'Sign in',
      exact: true,
    })
    const phone = form.getByLabel(language === 'ar' ? 'رقم الهاتف' : 'Phone number', {
      exact: true,
    })
    const password = form.getByLabel(language === 'ar' ? 'كلمة المرور' : 'Password', {
      exact: true,
    })
    await expect(form.locator('input')).toHaveCount(2)
    await expect(form.getByRole('button')).toHaveCount(1)
    await expect(phone).toHaveAttribute('type', 'tel')
    await expect(phone).toHaveAccessibleDescription(/09.*\+9639/)
    await expect(password).toHaveAttribute('type', 'password')
    await expect(signIn).toBeEnabled()
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 880 })
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme })
        const primary = await signIn.boundingBox()
        const field = await phone.boundingBox()
        if (!primary || !field) throw new Error('Missing sign-in controls')
        expect(primary.width).toBeCloseTo(field.width, 0)
        expect(primary.height).toBeGreaterThanOrEqual(44)
        await mobileLayout(page)
        await page.screenshot({
          path: `.artifacts/verification/sign-in-${language}-${colorScheme}-${width}-${testInfo.project.name}.png`,
        })
      }
    }
  }
})
