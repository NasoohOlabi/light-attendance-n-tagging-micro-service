import { mockSyntheticNotebook, openNotebookHistory } from './syntheticNotebook'
import { clickRecordAction } from './recordActions'
import { clickAccountAction } from './profileActions'
import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

test('dashboard charts and alphabetic fuzzy attendance preserve drafts', async ({
  page,
}, testInfo) => {
  await mockSyntheticNotebook(page)
  await page.goto('/?page=app')
  await expect(page.getByRole('button', { name: /Continue attendance/i })).toBeVisible()
  await expect(page.getByText('No recorded absences to follow up in this window.')).toBeVisible()
  await expect(page.getByText('1 marked, 1 unmarked')).toBeVisible()
  await clickAccountAction(page, 'العربية')
  await expect(page.getByRole('button', { name: /متابعة/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  await clickAccountAction(page, 'English')
  await page.getByRole('button', { name: /Continue attendance/i }).click()
  await expect(page.locator('details.attendance-group')).toHaveCount(0)
  const names = await page
    .getByRole('region', { name: 'Attendance list' })
    .locator('tbody tr td:first-child')
    .allTextContents()
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')))
  await expect(
    page
      .getByRole('region', { name: 'Attendance list' })
      .locator('thead th > button.table-sort, thead th:not(:has(button.table-sort))'),
  ).toHaveText(['Student', 'Level', 'Teacher', 'Attendance'])
  const mark = page.getByRole('group', { name: 'Attendance for Omar' })
  const absent = mark.getByRole('button', { name: 'absent', exact: true })
  await expect(mark.getByRole('button')).toHaveCount(3)
  for (const name of ['present', 'absent', 'excused']) {
    await expect(mark.getByRole('button', { name, exact: true })).toBeVisible()
  }
  await expect(mark.getByRole('button', { pressed: true })).toHaveCount(0)
  await absent.focus()
  await absent.press('Space')
  await expect(absent).toHaveAttribute('aria-pressed', 'true')
  await absent.press('Space')
  await expect(mark.getByRole('button', { pressed: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Save attendance/ })).toHaveCount(0)
  if (testInfo.project.name === 'mobile') {
    await mkdir('.artifacts/verification', { recursive: true })
    for (const language of ['en', 'ar']) {
      if (language === 'ar') await clickAccountAction(page, 'العربية')
      for (const width of [320, 390, 430, 844]) {
        await page.setViewportSize({ width, height: width === 844 ? 390 : 844 })
        const table = page.getByRole('region', {
          name: language === 'en' ? 'Attendance list' : 'قائمة الحضور',
        })
        expect(await table.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        )
        await expect(table.locator('td[data-label]').first()).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        await page.screenshot({
          path: `.artifacts/verification/attendance-${width}-${language}.png`,
          fullPage: true,
        })
      }
    }
    await clickAccountAction(page, 'English')
  }
  await page
    .getByLabel('Attendance for Omar')
    .getByRole('button', { name: 'absent', exact: true })
    .click()
  await expect(absent).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Save attendance (1)' }).click()
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Omar', exact: true })).toBeVisible()
  await expect(page.getByText('2 marked, 0 unmarked')).toBeVisible()
  await openNotebookHistory(page)
  const record = page.locator('li').filter({ hasText: 'Omar' }).filter({ hasText: 'absent' })
  await clickRecordAction(record, 'Record details')
  await expect(record.locator('pre')).toContainText('"enrollmentId"')
  for (const language of ['en', 'ar']) {
    if (language === 'ar') await clickAccountAction(page, 'العربية')
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
  }
  await clickAccountAction(page, 'English')
  await clickRecordAction(record, 'Undo')
  await page.getByLabel('Reason').fill('Correction')
  await page.getByRole('button', { name: 'Append correction' }).click()
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(page.getByText('No recorded absences to follow up in this window.')).toBeVisible()
  await expect(page.getByText('1 marked, 1 unmarked')).toBeVisible()
})

test('follow-up uses recorded absences through the selected date', async ({ page }) => {
  await mockSyntheticNotebook(page, { role: 'teacher' })
  await page.goto('/?page=app')
  const dateInput = page.getByLabel('Session date')
  const firstDate = await dateInput.inputValue()
  const nextDate = new Date(`${firstDate}T00:00:00Z`)
  nextDate.setUTCDate(nextDate.getUTCDate() + 1)
  const secondDate = nextDate.toISOString().slice(0, 10)

  await page.getByRole('button', { name: /Continue attendance/i }).click()
  await page
    .getByLabel('Attendance for Omar')
    .getByRole('button', { name: 'absent', exact: true })
    .click()
  await page.getByRole('button', { name: 'Save attendance (1)' }).click()
  await page.getByLabel('Session date').fill(secondDate)
  await page
    .getByLabel('Attendance for Omar')
    .getByRole('button', { name: 'excused', exact: true })
    .click()
  await page.getByRole('button', { name: 'Save attendance (1)' }).click()
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  const strip = page.getByRole('list', { name: 'Recent attendance for Omar' })
  await expect(strip.locator('li')).toHaveCount(2)
  await expect(strip.locator('li').nth(0)).toContainText('absent')
  await expect(strip.locator('li').nth(1)).toContainText('excused')
  await expect(page.getByText('1 absence', { exact: true })).toBeVisible()
  await page.getByLabel('Session date').fill(firstDate)
  await expect(strip.locator('li')).toHaveCount(1)
  await page.getByRole('button', { name: 'Omar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Student information' })).toBeVisible()
})
