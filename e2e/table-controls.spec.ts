import { clickAccountAction } from './profileActions'
import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

test('table filtering limits bulk attendance and preserves hidden drafts', async ({
  page,
}, testInfo) => {
  await page.route('**/api/auth/**', (route) => route.fulfill({ json: null }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore with sample students' }).click()
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await page.getByLabel('Attendance for Omar').selectOption('absent')
  await page.getByRole('button', { name: 'Filter options' }).first().click()
  await page.getByLabel('Add filter').selectOption({ label: 'Student' })
  const filter = page.getByLabel('Filter Student').first()
  await filter.pressSequentially('no match')
  await expect(filter).toBeFocused()
  await expect(page.getByLabel('Attendance for Omar')).toHaveCount(0)
  await filter.fill('أحمد')
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Mark displayed students present' }).click()
  await page.getByRole('button', { name: 'Filter options' }).first().click()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByLabel('Attendance for Omar')).toHaveValue('absent')
  await expect(page.getByLabel('Attendance for أحمد')).toHaveValue('present')
  await page.getByRole('button', { name: 'Filter options' }).first().click()
  await page.getByLabel('Add filter').selectOption({ label: 'Attendance' })
  await page.getByLabel('Filter Attendance').first().selectOption({ label: 'absent' })
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByLabel('Attendance for Omar')).toBeVisible()
  await expect(page.getByLabel('Attendance for أحمد')).toHaveCount(0)
  await clickAccountAction(page, 'العربية')
  await expect(page.getByLabel('الحضور للطالب Omar')).toBeVisible()
  await clickAccountAction(page, 'English')
  await page.getByRole('button', { name: 'Filter options' }).first().click()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Summary', exact: true }).click()
  const hoverDevice = await page.evaluate(() => matchMedia('(hover: hover)').matches)
  for (const language of ['en', 'ar']) {
    if (language === 'ar') await clickAccountAction(page, 'العربية')
    const header = page.getByRole('columnheader').first()
    const button = header.locator('.table-sort')
    const chevron = button.locator('.table-sort-chevron')
    await page.mouse.move(0, 0)
    await expect(chevron).toHaveCSS('opacity', hoverDevice ? '0' : '1')
    await expect(button).toHaveCSS('cursor', 'pointer')
    const size = await button.evaluate((element) => ({
      width: element.clientWidth,
      height: element.clientHeight,
    }))
    const gap = await button.evaluate((element) => {
      const label = element.querySelector('.table-sort-label')
      const icon = element.querySelector('.table-sort-chevron')
      if (!label || !icon) throw new Error('Sort label and chevron must be present')
      const text = label.getBoundingClientRect()
      const chevron = icon.getBoundingClientRect()
      return getComputedStyle(element).direction === 'rtl'
        ? text.left - chevron.right
        : chevron.left - text.right
    })
    expect(gap).toBeGreaterThanOrEqual(8)
    await button.hover()
    await expect(chevron).toHaveCSS('opacity', '1')
    expect(
      await button.evaluate((element) => ({
        width: element.clientWidth,
        height: element.clientHeight,
      })),
    ).toEqual(size)
    if (language === 'ar') {
      await mkdir('.artifacts/verification', { recursive: true })
      await page.screenshot({
        path: `.artifacts/verification/sort-chevrons-${testInfo.project.name}-ar-hover.png`,
        fullPage: true,
      })
    }
    await page.mouse.move(0, 0)
    await button.focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    await expect(chevron).toHaveCSS('opacity', '1')
    await page.keyboard.press('Enter')
    await expect(header).toHaveAttribute('aria-sort', 'ascending')
    await expect(chevron).toHaveClass(/lucide-chevron-up/)
    await page.keyboard.press('Tab')
    await expect(chevron).toHaveCSS('opacity', '1')
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Enter')
    await expect(header).toHaveAttribute('aria-sort', 'descending')
    await expect(chevron).toHaveClass(/lucide-chevron-down/)
    await page.keyboard.press('Enter')
    await expect(header).toHaveAttribute('aria-sort', 'none')
    await expect(chevron).toHaveClass(/lucide-chevrons-up-down/)
  }
})
