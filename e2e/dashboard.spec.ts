import { clickAccountAction } from './profileActions'
import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

test('dashboard charts and alphabetic fuzzy attendance preserve drafts', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore with sample students' }).click()
  await expect(page.getByRole('button', { name: 'Take attendance' })).toBeVisible()
  await expect(page.getByLabel('present: 1')).toBeVisible()
  await expect(page.getByText('1 marked, 1 unmarked')).toBeVisible()
  await clickAccountAction(page, 'العربية')
  await expect(page.getByRole('button', { name: 'تسجيل الحضور' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  await clickAccountAction(page, 'English')
  await page.getByRole('button', { name: 'Take attendance' }).click()
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
  expect(
    await page
      .getByLabel('Attendance for Omar')
      .locator('option')
      .evaluateAll((options) => options.map((option) => option.getAttribute('value'))),
  ).toEqual(['', 'present', 'absent', 'excused'])
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
  await page.getByLabel('Attendance for Omar').selectOption('absent')
  await expect(page.getByLabel('Attendance for Omar')).toHaveValue('absent')
  await expect(page.getByLabel('Attendance for Omar')).toHaveValue('absent')
  await page.getByRole('button', { name: 'Save attendance (1)' }).click()
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(page.getByLabel('absent: 1')).toBeVisible()
  await expect(page.getByLabel(/^(early|late):/)).toHaveCount(0)
  await expect(page.getByText('2 marked, 0 unmarked')).toBeVisible()
  await page.getByRole('button', { name: 'History & corrections', exact: true }).click()
  const snapshot = page
    .locator('li')
    .filter({ has: page.locator('dl').filter({ hasText: 'Omar' }) })
    .first()
  await expect(snapshot.locator('dt')).toHaveText(['Student', 'Level', 'Status'])
  await expect(snapshot.locator('dd').first()).toHaveText('Omar')
  for (const language of ['en', 'ar']) {
    if (language === 'ar') await clickAccountAction(page, 'العربية')
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 })
      const fields = await snapshot
        .locator('dl > div')
        .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top))
      expect(new Set(fields).size).toBe(1)
    }
  }
  await clickAccountAction(page, 'English')
  const record = page.locator('li').filter({ hasText: 'Omar' }).filter({ hasText: 'absent' })
  await record.getByRole('button', { name: 'Undo' }).click()
  await page.getByLabel('Reason').fill('Correction')
  await page.getByRole('button', { name: 'Append correction' }).click()
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(page.getByLabel('absent: 0')).toBeVisible()
  await expect(page.getByText('1 marked, 1 unmarked')).toBeVisible()
})

test('recent sessions count present students, including zero-present dates', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore with sample students' }).click()
  const dateInput = page.getByLabel('Session date')
  const firstDate = await dateInput.inputValue()
  const nextDate = new Date(`${firstDate}T00:00:00Z`)
  nextDate.setUTCDate(nextDate.getUTCDate() + 1)
  const secondDate = nextDate.toISOString().slice(0, 10)

  await page.getByRole('button', { name: 'Take attendance' }).click()
  await page.getByLabel('Attendance for Omar').selectOption('absent')
  await page.getByRole('button', { name: 'Save attendance (1)' }).click()
  await page.getByLabel('Session date').fill(secondDate)
  await page.getByLabel('Attendance for Omar').selectOption('excused')
  await page.getByRole('button', { name: 'Save attendance (1)' }).click()
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()

  await expect(page.getByText('Present per date')).toBeVisible()
  await expect(page.getByLabel(`${firstDate}: 1`)).toHaveAttribute('value', '1')
  await expect(page.getByLabel(`${secondDate}: 0`)).toHaveAttribute('value', '0')
  await expect(page.getByLabel('excused: 1')).toBeVisible()
  await expect(page.getByText('1 marked, 1 unmarked')).toBeVisible()
  await page.getByLabel('Session date').fill(firstDate)
  await expect(page.getByLabel(`${secondDate}: 0`)).toHaveCount(0)
  await expect(page.getByLabel('absent: 1')).toBeVisible()
  await page.getByLabel('Session date').fill(secondDate)
  await clickAccountAction(page, 'العربية')
  await expect(page.getByText('عدد الحاضرين في كل يوم')).toBeVisible()
  await expect(page.getByLabel(`${firstDate}: 1`)).toBeVisible()
  await expect(page.getByLabel(`${secondDate}: 0`)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({
    path: `.artifacts/verification/dashboard-present-${testInfo.project.name}-ar.png`,
    fullPage: true,
  })
})

test('assigned sample saves attendance in its sample course', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore assigned teacher sample' }).click()
  await page.getByRole('button', { name: 'Take attendance' }).click()
  await expect(page.getByRole('heading', { name: 'Attendance · Sample course' })).toBeVisible()
  const mark = page.getByRole('region', { name: 'Attendance list' }).getByRole('combobox').first()
  await mark.selectOption('absent')
  await page.getByRole('button', { name: 'Save attendance (1)' }).click()
  await expect(mark).toHaveValue('absent')
  await expect(page.getByRole('status').filter({ hasText: 'saved in this demo' })).toBeVisible()
})
