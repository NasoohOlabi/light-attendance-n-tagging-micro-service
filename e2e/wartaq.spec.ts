import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

async function checkLayout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  const small = await page
    .locator('.wartaq-drafts button:visible, .wartaq-drafts select:visible')
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const rect = element.getBoundingClientRect()
          return rect.height < 44 || rect.width < 44
        })
        .map((element) => element.textContent?.trim()),
    )
  expect(small).toEqual([])
  expect(
    await page
      .locator(
        '.wartaq-drafts input:visible, .wartaq-drafts select:visible, .wartaq-drafts textarea:visible',
      )
      .evaluateAll((elements) =>
        elements.every((element) => parseFloat(getComputedStyle(element).fontSize) >= 16),
      ),
  ).toBe(true)
}

for (const design of ['a', 'b']) {
  test(`Wartaq ${design} draft supports local bilingual attendance and notes`, async ({
    page,
  }, testInfo) => {
    const external: string[] = []
    const failures: string[] = []
    page.on('pageerror', (error) => failures.push(error.message))
    page.on('request', (request) => {
      if (new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url())
    })
    await page.goto(`/?design=${design}`)
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('.wartaq-drafts')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.getByRole('button', { name: 'English', exact: true }).click()
    if (design === 'a') await page.getByRole('button', { name: 'Notebook', exact: true }).click()
    await checkLayout(page)
    await page.getByRole('button', { name: 'Mark all present', exact: true }).click()
    const selects = page.locator(design === 'a' ? '.a-row select' : '.wb-row select')
    await expect(selects).toHaveCount(6)
    for (const select of await selects.all()) await expect(select).toHaveValue('present')
    await page.getByRole('button', { name: 'Save attendance', exact: true }).click()
    await expect(page.getByRole('status')).toContainText(/Attendance saved/)
    const textarea = page.locator(design === 'a' ? '.a-note textarea' : '.wb-notes textarea')
    await textarea.fill('ملاحظة تجريبية مشتركة English draft')
    await page.getByRole('button', { name: 'العربية', exact: true }).click()
    await expect(textarea).toHaveValue('ملاحظة تجريبية مشتركة English draft')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
    await expect(page.getByRole('status')).not.toContainText('Attendance')
    await page.getByRole('button', { name: 'English', exact: true }).click()
    if (design === 'a') {
      await page.getByRole('button', { name: 'Revision', exact: true }).click()
      await page.getByRole('button', { name: 'Save note', exact: true }).click()
      await expect(page.locator('.a-summary')).toContainText('ملاحظة تجريبية مشتركة English draft')
      await expect(page.locator('.a-summary')).toContainText('Revision')
    } else {
      await page.getByRole('button', { name: 'Add note', exact: true }).click()
      await expect(page.locator('.wb-note-list')).toContainText(
        'ملاحظة تجريبية مشتركة English draft',
      )
      await page.getByRole('searchbox', { name: 'Search for a student' }).fill('no such student')
      await expect(page.getByText('No students found.', { exact: true })).toBeVisible()
      await page.getByRole('searchbox', { name: 'Search for a student' }).fill('')
    }
    for (const language of ['العربية', 'English']) {
      await page.getByRole('button', { name: language, exact: true }).click()
      for (const viewport of [
        { width: 320, height: 568 },
        { width: 390, height: 844 },
        { width: 844, height: 390 },
      ]) {
        await page.setViewportSize(viewport)
        await checkLayout(page)
      }
    }
    await page.getByRole('button', { name: 'العربية', exact: true }).click()
    await page.setViewportSize({ width: 1440, height: 1040 })
    await mkdir('.artifacts/wartaq', { recursive: true })
    await page.screenshot({
      path: `.artifacts/wartaq/${design}-notebook-${testInfo.project.name}.png`,
      fullPage: true,
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({
      path: `.artifacts/wartaq/${design}-mobile-${testInfo.project.name}.png`,
      fullPage: true,
    })
    if (design === 'a') {
      await page.getByRole('button', { name: 'البداية', exact: true }).click()
      await checkLayout(page)
      await page.setViewportSize({ width: 1440, height: 1040 })
      await page.screenshot({
        path: `.artifacts/wartaq/a-welcome-${testInfo.project.name}.png`,
        fullPage: true,
      })
      await page.getByRole('button', { name: 'العناصر', exact: true }).click()
      await page.setViewportSize({ width: 320, height: 568 })
      await checkLayout(page)
    } else {
      for (const name of ['الملاحظات', 'الطلاب', 'الملخص']) {
        await page.getByRole('button', { name, exact: true }).click()
        await checkLayout(page)
      }
    }
    expect(external).toEqual([])
    expect(failures).toEqual([])
  })
}

test('Wartaq review switch keeps language and isolates the real notebook', async ({ page }) => {
  await page.goto('/?design=a')
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await page.getByRole('button', { name: 'B / Midad', exact: true }).click()
  await expect(page).toHaveURL(/design=b/)
  await expect(page.locator('.wartaq-b')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.getByRole('link', { name: 'Return to current notebook' }).click()
  await expect(page.locator('.wartaq-drafts')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Explore with sample students' })).toBeVisible()
})
