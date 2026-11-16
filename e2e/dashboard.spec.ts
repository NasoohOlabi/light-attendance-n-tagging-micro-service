import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

test('dashboard charts and grouped fuzzy attendance preserve drafts', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore with sample students' }).click()
  await expect(page.getByRole('button', { name: 'Take attendance' })).toBeVisible()
  await expect(page.getByLabel('present: 1')).toBeVisible()
  await expect(page.getByText('1 marked, 1 unmarked')).toBeVisible()
  await page.getByRole('button', { name: 'العربية', exact: true }).click()
  await expect(page.getByRole('button', { name: 'تسجيل الحضور' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await page.getByRole('button', { name: 'Take attendance' }).click()
  await expect(page.locator('details.attendance-group summary')).toHaveCount(1)
  await expect(
    page.getByRole('region', { name: 'Attendance list' }).getByRole('columnheader'),
  ).toHaveText(['Student', 'Level', 'Attendance'])
  expect(
    await page
      .getByLabel('Attendance for Omar')
      .locator('option')
      .evaluateAll((options) => options.map((option) => option.getAttribute('value'))),
  ).toEqual(['', 'present', 'absent', 'excused'])
  if (testInfo.project.name === 'mobile') {
    await mkdir('.artifacts/verification', { recursive: true })
    for (const language of ['en', 'ar']) {
      if (language === 'ar')
        await page.getByRole('button', { name: 'العربية', exact: true }).click()
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 })
        const table = page.getByRole('region', {
          name: language === 'en' ? 'Attendance list' : 'قائمة الحضور',
        })
        await expect(table).toHaveAttribute('tabindex', '0')
        expect(await table.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
          true,
        )
        await table.focus()
        await page.keyboard.press(language === 'en' ? 'ArrowRight' : 'ArrowLeft')
        await expect
          .poll(() => table.evaluate((element) => Math.abs(element.scrollLeft)))
          .toBeGreaterThan(0)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        await page.screenshot({
          path: `.artifacts/verification/attendance-${width}-${language}.png`,
          fullPage: true,
        })
      }
    }
    await page.getByRole('button', { name: 'English', exact: true }).click()
  }
  await page.getByLabel('Attendance for Omar').selectOption('absent')
  await page.locator('details.attendance-group summary').click()
  await page.locator('details.attendance-group summary').click()
  await expect(page.getByLabel('Attendance for Omar')).toHaveValue('absent')
  await page.getByLabel('Find a student').fill('omr')
  await expect(page.getByLabel('Attendance for Omar')).toHaveValue('absent')
  await expect(page.locator('details.attendance-group')).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: 'Attendance list' }).getByRole('columnheader'),
  ).toHaveText(['Student', 'Level', 'Attendance'])
  await page.getByLabel('Find a student').fill('missing')
  await page.getByLabel('Find a student').fill('')
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
    if (language === 'ar') await page.getByRole('button', { name: 'العربية', exact: true }).click()
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 })
      const fields = await snapshot
        .locator('dl > div')
        .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top))
      expect(new Set(fields).size).toBe(1)
    }
  }
  await page.getByRole('button', { name: 'English', exact: true }).click()
  const record = page.locator('li').filter({ hasText: 'Omar' }).filter({ hasText: 'absent' })
  await record.getByRole('button', { name: 'Undo' }).click()
  await page.getByLabel('Reason').fill('Correction')
  await page.getByRole('button', { name: 'Append correction' }).click()
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(page.getByLabel('absent: 0')).toBeVisible()
  await expect(page.getByText('1 marked, 1 unmarked')).toBeVisible()
})
