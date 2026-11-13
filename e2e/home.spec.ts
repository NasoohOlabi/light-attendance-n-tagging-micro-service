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
  await expect(languageSwitch.locator('svg[aria-hidden="true"]')).toHaveCount(1)
  for (const language of ['العربية', 'English']) {
    const button = languageSwitch.getByRole('button', { name: language, exact: true })
    await button.focus()
    await expect(button).toBeFocused()
    await page.keyboard.press('Enter')
    if (language === 'العربية') {
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
  await page.locator('summary').first().click()
  await expect(page.locator('details').first()).toHaveAttribute('open', '')
  await page.getByRole('button', { name: 'Explore with sample students', exact: true }).click()
  await expect(page).toHaveURL(/page=app/)
  await expect(page.locator('.workspace')).toBeVisible()
  await expect(page).toHaveTitle('Wartaq · Halaqa notebook')
  await expect(page.getByRole('group', { name: 'Language / اللغة' })).toHaveCount(1)
  await page.goBack()
  await expect(page.locator('.wartaq-home')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.locator('.workspace')).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Open your personal access link', exact: true }),
  ).toBeVisible()
  await page.goBack()
  await page.getByRole('button', { name: 'Explore with sample students', exact: true }).click()
  await page.getByRole('button', { name: 'Close session', exact: true }).click()
  await expect(page.locator('.wartaq-home')).toBeVisible()
  await expect(page).not.toHaveURL(/page=app/)
  await page.getByRole('button', { name: 'العربية', exact: true }).click()
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
  await page.getByRole('button', { name: 'استكشف باستخدام طلاب تجريبيين', exact: true }).click()
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
