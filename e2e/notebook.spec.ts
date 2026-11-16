import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const browserErrors = new WeakMap<object, string[]>()
test.beforeEach(async ({ context, page }) => {
  const errors: string[] = []
  browserErrors.set(context, errors)
  const watch = (tab: typeof page) => {
    tab.on('pageerror', (error) => errors.push(error.message))
    tab.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
  }
  watch(page)
  context.on('page', watch)
})
test.afterEach(async ({ context }, testInfo) => {
  const errors = browserErrors.get(context) ?? []
  // The synthetic lost-response test deliberately aborts one network request.
  const unexpected = testInfo.title.includes('lost response')
    ? errors.filter((error) => !error.includes('net::ERR_FAILED'))
    : errors
  expect(unexpected).toEqual([])
})

test('sample notebook supports attendance, notes and corrections without network writes', async ({
  page,
}, testInfo) => {
  await page.route('**/api/auth/**', (route) => route.fulfill({ json: null }))
  const external: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url())
  })
  await page.goto('/')
  await expect(page.locator('.wartaq-home h1')).toBeVisible()
  await page.getByRole('button', { name: 'Explore with sample students' }).click()
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await page.getByLabel('Student name').fill('ليلى')
  await page.getByRole('button', { name: 'Add student' }).click()
  await expect(page.getByRole('status')).toContainText('saved in this demo')
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await page.getByLabel('Attendance for ليلى').selectOption('absent')
  await page.getByRole('button', { name: 'Save attendance (1)' }).click()
  await expect(page.getByRole('status')).toContainText('saved in this demo')
  await page.getByRole('button', { name: 'Summary', exact: true }).click()
  await expect(page.getByRole('meter', { name: 'absent' })).toHaveAttribute(
    'aria-valuetext',
    '50.0%',
  )
  await page.getByRole('button', { name: 'Notes', exact: true }).click()
  await page.getByRole('combobox', { name: 'Student', exact: true }).selectOption({ label: 'ليلى' })
  await page.getByLabel('Tags, separated by commas').fill('مراجعة, قراءة')
  await page.getByLabel('Note', { exact: true }).fill('راجعت السورة اليوم')
  await page.getByRole('button', { name: 'Save note' }).click()
  await page.getByLabel('Filter tag').selectOption('مراجعة')
  await expect(page.getByText('راجعت السورة اليوم')).toBeVisible()
  await expect(page.getByText('Review the last two pages together next session.')).toHaveCount(0)
  if (testInfo.project.name === 'chromium') {
    await mkdir('.artifacts/verification', { recursive: true })
    await page.screenshot({ path: '.artifacts/verification/notebook.png', fullPage: true })
  }
  await page.getByRole('button', { name: 'History & corrections', exact: true }).click()
  const note = page.locator('li').filter({ hasText: 'راجعت السورة اليوم' })
  await note.getByRole('button', { name: 'Undo' }).click()
  await page.getByLabel('Reason').fill('تصحيح')
  await page.getByRole('button', { name: 'Append correction' }).click()
  await expect(note).toContainText('Undone')
  await expect(page.getByText('Correction: تصحيح')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Explore with sample students' })).toBeVisible()
  await page.getByRole('button', { name: 'Explore with sample students' }).click()
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await expect(page.locator('input[value="ليلى"]')).toHaveCount(0)
  expect(external).toEqual([])
})
