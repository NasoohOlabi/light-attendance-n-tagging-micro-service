import { clickRecordAction } from './recordActions'
import { clickAccountAction } from './profileActions'
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
  await expect(page.getByRole('button', { name: 'Notes', exact: true })).toHaveCount(0)
  const sessionDate = await page.getByLabel('Session date').inputValue()
  await page.getByLabel('Attendance for ليلى').selectOption('absent')
  const addNote = page.getByRole('button', { name: 'Add note for ليلى', exact: true })
  const dialog = page.getByRole('dialog', { name: 'Note for ليلى' })
  await addNote.click()
  await expect(dialog.locator('time')).toHaveAttribute('datetime', sessionDate)
  await expect(dialog.getByLabel('Note', { exact: true })).toBeFocused()
  await dialog.getByLabel('Note', { exact: true }).fill('Cancelled note')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(addNote).toBeFocused()
  await addNote.click()
  await expect(dialog.getByLabel('Note', { exact: true })).toHaveValue('')
  await dialog.getByLabel('Tags, separated by commas').fill('مراجعة, قراءة')
  await dialog.getByLabel('Note', { exact: true }).fill('راجعت السورة اليوم')
  await dialog.getByRole('button', { name: 'Save note' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByLabel('Attendance for ليلى')).toHaveValue('absent')
  await addNote.click()
  await expect(dialog.getByText('راجعت السورة اليوم')).toBeVisible()
  await expect(dialog.getByText('Review the last two pages together next session.')).toHaveCount(0)
  if (testInfo.project.name === 'chromium') {
    await mkdir('.artifacts/verification', { recursive: true })
    await page.screenshot({ path: '.artifacts/verification/notebook.png', fullPage: true })
  }
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Save attendance (1)' }).click()
  await expect(page.getByRole('status')).toContainText('saved in this demo')
  await page.getByRole('button', { name: 'Summary', exact: true }).click()
  await expect(page.getByRole('meter', { name: 'absent' })).toHaveAttribute(
    'aria-valuetext',
    '50.0%',
  )
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await page.getByLabel('Session date').fill('2001-01-01')
  await addNote.click()
  await expect(dialog.getByText('راجعت السورة اليوم')).toHaveCount(0)
  await dialog.getByLabel('Note', { exact: true }).fill('Earlier session note')
  await dialog.getByRole('button', { name: 'Save note' }).click()
  await expect(dialog).toBeHidden()
  await addNote.click()
  await expect(dialog.getByText('Earlier session note')).toBeVisible()
  await page.keyboard.press('Escape')
  await clickAccountAction(page, 'History & corrections')
  const note = page.locator('li').filter({ hasText: 'راجعت السورة اليوم' })
  await clickRecordAction(note, 'Undo')
  await page.getByLabel('Reason').fill('تصحيح')
  await page.getByRole('button', { name: 'Append correction' }).click()
  await expect(note).toContainText('Undone')
  await expect(page.getByText('Correction: تصحيح')).toBeVisible()
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await page.getByLabel('Session date').fill(sessionDate)
  await addNote.click()
  await expect(dialog.getByText('راجعت السورة اليوم')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Explore with sample students' })).toBeVisible()
  await page.getByRole('button', { name: 'Explore with sample students' }).click()
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await expect(page.locator('input[value="ليلى"]')).toHaveCount(0)
  expect(external).toEqual([])
})
