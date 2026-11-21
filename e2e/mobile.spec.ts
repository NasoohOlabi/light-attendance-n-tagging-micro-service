import { mockSyntheticNotebook, openNotebookHistory } from './syntheticNotebook'
import { clickAccountAction } from './profileActions'
import { clickRecordAction } from './recordActions'
import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

async function usableLayout(page: Page) {
  const overflow = await page.locator('body *').evaluateAll((elements) =>
    elements
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return (
          (rect.width > innerWidth || rect.left < -1 || rect.right > innerWidth + 1) &&
          !element.closest('table') &&
          !element.closest('pre')
        )
      })
      .map((element) => ({
        tag: element.tagName,
        classes: element.className,
        width: element.getBoundingClientRect().width,
        left: element.getBoundingClientRect().left,
      }))
      .slice(0, 12),
  )
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    JSON.stringify(overflow),
  ).toBe(true)
  const undersized = await page
    .locator('button:visible, select:visible, summary:visible')
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const rect = element.getBoundingClientRect()
          return rect.width < 44 || rect.height < 44
        })
        .map((element) => element.textContent?.trim()),
    )
  expect(undersized).toEqual([])
  expect(
    await page
      .locator('input:visible:not([type=checkbox]), select:visible, textarea:visible')
      .evaluateAll((elements) =>
        elements.every((element) => parseFloat(getComputedStyle(element).fontSize) >= 16),
      ),
  ).toBe(true)
}

test('phone layouts keep every notebook view usable in English and Arabic', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/')
  await usableLayout(page)
  const longName = 'طالب'.repeat(45)
  await mockSyntheticNotebook(page, { names: ['أحمد', 'Omar', longName] })
  await page.goto('/?page=app')
  for (const name of ['Students', 'Attendance', 'Summary']) {
    await page.getByRole('button', { name, exact: true }).click()
    await usableLayout(page)
  }
  await openNotebookHistory(page)
  await usableLayout(page)
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await usableLayout(page)
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await page.getByRole('button', { name: `Add note for ${longName}`, exact: true }).click()
  const note = page.getByLabel('Note', { exact: true })
  await note.fill('مسودة مشتركة English draft')
  await usableLayout(page)
  await page.keyboard.press('Escape')
  await clickAccountAction(page, 'العربية')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  const row = page.getByRole('row').filter({ hasText: longName })
  const rowNote = row.getByRole('button', { name: /إضافة ملاحظة/ })
  await expect(rowNote).toBeVisible()
  const markBounds = await row.getByRole('group').boundingBox()
  const noteBounds = await rowNote.boundingBox()
  if (!markBounds || !noteBounds) throw new Error('Missing attendance row controls')
  expect(
    Math.abs(markBounds.y + markBounds.height / 2 - noteBounds.y - noteBounds.height / 2),
  ).toBeLessThanOrEqual(2)
  expect(noteBounds.x).toBeGreaterThanOrEqual(markBounds.x + markBounds.width)
  const marks = row.getByRole('group')
  const present = marks.getByRole('button', { name: 'حاضر', exact: true })
  const absent = marks.getByRole('button', { name: 'غائب', exact: true })
  await rowNote.focus()
  await page.keyboard.press('Tab')
  await expect(present).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(absent).toBeFocused()
  await expect(marks.getByRole('button', { pressed: true })).toHaveCount(0)
  await rowNote.click()
  const arabicNote = page.getByLabel('الملاحظة', { exact: true })
  await arabicNote.fill('مسودة مشتركة English draft')
  await usableLayout(page)
  await page.getByRole('button', { name: 'حفظ الملاحظة', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await page
    .getByRole('row')
    .filter({ hasText: longName })
    .getByRole('button', { name: /إضافة ملاحظة/ })
    .click()
  await expect(page.getByRole('dialog').getByText('مسودة مشتركة English draft')).toBeVisible()
  await page.keyboard.press('Escape')
  for (const name of ['الطلاب', 'الحضور', 'الملخص']) {
    await page.getByRole('button', { name, exact: true }).click()
    await usableLayout(page)
  }
  await openNotebookHistory(page, 'ar')
  await usableLayout(page)
  await page.getByRole('button', { name: 'الحضور', exact: true }).click()
  await page
    .getByLabel(`الحضور للطالب ${longName}`)
    .getByRole('button', { name: 'غائب', exact: true })
    .click()
  await page.getByRole('button', { name: 'حفظ الحضور (1)', exact: true }).click()
  await expect(page.getByRole('status')).not.toContainText('saved')
  await page
    .getByRole('row')
    .filter({ hasText: longName })
    .getByRole('button', { name: /إضافة ملاحظة/ })
    .click()
  for (const size of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size)
    await usableLayout(page)
  }
  await page.keyboard.press('Escape')
  await openNotebookHistory(page, 'ar')
  const savedNote = page.locator('li').filter({ hasText: 'مسودة مشتركة English draft' })
  await clickRecordAction(savedNote, 'تراجع')
  await page.getByLabel('السبب', { exact: true }).fill('تصحيح تجريبي')
  await page.getByRole('button', { name: 'إضافة تصحيح', exact: true }).click()
  await expect(savedNote).toContainText('تم التراجع')
  await page.setViewportSize({ width: 320, height: 568 })
  await page.getByRole('button', { name: 'الحضور', exact: true }).click()
  await page.getByRole('button', { name: 'الملخص', exact: true }).click()
  await expect(page.locator('table thead')).toBeHidden()
  await expect(page.getByRole('button', { name: 'خيارات الفرز' })).toBeVisible()
  await expect(page.locator('td[data-label]').first()).toBeVisible()
  await expect(page.locator('[tabindex="0"]').filter({ has: page.locator('table') })).toHaveCount(1)
  expect(
    await page
      .locator('table')
      .evaluate((table) => table.scrollWidth <= (table.parentElement?.clientWidth ?? 0)),
  ).toBe(true)
  await usableLayout(page)
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  await usableLayout(page)
  await page.evaluate(() => {
    document.documentElement.style.fontSize = ''
  })
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({
    path: `.artifacts/verification/mobile-arabic-${testInfo.project.name}.png`,
    fullPage: true,
  })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('button', { name: 'الملف الشخصي' })).toBeVisible()
  await clickAccountAction(page, 'English')
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  expect(errors).toEqual([])
})

test('language switching works when preference storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Synthetic storage denial')
    }
  })
  await page.goto('/')
  await clickAccountAction(page, 'العربية')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  await clickAccountAction(page, 'English')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})
