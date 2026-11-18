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
  const marks = page.getByLabel('Attendance for ليلى')
  const present = marks.getByRole('button', { name: 'present', exact: true })
  const absent = marks.getByRole('button', { name: 'absent', exact: true })
  const excused = marks.getByRole('button', { name: 'excused', exact: true })
  const selected = marks.getByRole('button', { pressed: true })
  const tileBackgrounds = new Set<string>()
  const iconColors = new Set<string>()
  await expect(selected).toHaveCount(0)
  await present.focus()
  await page.keyboard.press('ArrowRight')
  await expect(absent).toBeFocused()
  await expect(selected).toHaveCount(0)
  for (const mark of [present, excused, absent]) {
    await mark.press('Space')
    await expect(mark).toHaveAttribute('aria-pressed', 'true')
    tileBackgrounds.add(await mark.evaluate((button) => getComputedStyle(button).backgroundColor))
    iconColors.add(await mark.locator('svg').evaluate((icon) => getComputedStyle(icon).color))
  }
  expect(tileBackgrounds.size).toBe(3)
  expect([...tileBackgrounds]).not.toContain('rgba(0, 0, 0, 0)')
  expect(iconColors.size).toBe(3)
  await absent.press('Space')
  await expect(selected).toHaveCount(0)
  await absent.press('Space')
  const addNote = page.getByRole('button', { name: 'Add note for ليلى', exact: true })
  await expect(addNote).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(addNote).toHaveCSS('border-top-width', '0px')
  const dialog = page.getByRole('dialog', { name: 'Student note for ليلى' })
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
  await expect(
    page.getByLabel('Attendance for ليلى').getByRole('button', { pressed: true }),
  ).toHaveAccessibleName('absent')
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
  const summaryRow = page.getByRole('row', { name: /ليلى/ })
  await expect(summaryRow.locator('td[data-label="absent"]')).toHaveText('1')
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

test('a teacher can finish a partial session without overwriting exceptions or losing their place', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore with sample students' }).click()
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await page.getByLabel('Student name').fill('Lina')
  await page.getByRole('button', { name: 'Add student', exact: true }).click()
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await page.getByRole('button', { name: /Continue attendance.*2/i }).click()
  const roster = page.getByRole('region', { name: 'Attendance list' })
  const unmarked = page.getByRole('button', { name: /Show unmarked/i })
  if ((await unmarked.getAttribute('aria-pressed')) !== 'true') await unmarked.click()
  await expect(roster.getByLabel('Attendance for أحمد')).toHaveCount(0)
  await unmarked.click()
  const omar = roster.getByRole('button', { name: 'Omar', exact: true })
  await page
    .getByLabel('Attendance for Omar')
    .getByRole('button', { name: 'excused', exact: true })
    .click()
  await omar.click()
  await expect(page.getByRole('heading', { name: 'Student information' })).toBeVisible()
  await page.goBack()
  await expect(omar).toBeFocused()
  await expect(
    page.getByLabel('Attendance for Omar').getByRole('button', { pressed: true }),
  ).toHaveAccessibleName('excused')
  await page.getByRole('button', { name: /Mark 1 unmarked present/i }).click()
  await expect(
    page.getByLabel('Attendance for Lina').getByRole('button', { pressed: true }),
  ).toHaveAccessibleName('present')
  await expect(
    page.getByLabel('Attendance for Omar').getByRole('button', { pressed: true }),
  ).toHaveAccessibleName('excused')
  await expect(
    page.getByLabel('Attendance for أحمد').getByRole('button', { pressed: true }),
  ).toHaveAccessibleName('present')
  const save = page.getByRole('button', { name: 'Save attendance (2)' })
  if (testInfo.project.name === 'mobile') {
    const bounds = await save.boundingBox()
    const nav = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox()
    expect(bounds && nav && bounds.y >= 0 && bounds.y + bounds.height <= nav.y).toBe(true)
  }
  await save.click()
  await expect(page.getByRole('button', { name: /Save attendance/ })).toHaveCount(0)
  const lina = roster.getByRole('row').filter({ has: page.getByLabel('Attendance for Lina') })
  await lina.getByRole('button', { name: 'Correct this mark: Lina', exact: true }).click()
  await page.getByLabel('Reason', { exact: true }).fill('Wrong student selected')
  await page.getByRole('button', { name: 'Append correction' }).click()
  await expect(lina.getByRole('group').getByRole('button', { pressed: true })).toHaveCount(0)
  await expect(
    page.getByLabel('Attendance for Omar').getByRole('button', { pressed: true }),
  ).toHaveAccessibleName('excused')
})
