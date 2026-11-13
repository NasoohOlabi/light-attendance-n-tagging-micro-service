import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { z } from 'zod'
import { HEADERS } from '../shared/ledger'
import { encodeAccess } from '../shared/access'

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
  await page.getByLabel('Attendance for ليلى').selectOption('late')
  await page.getByRole('button', { name: 'Save attendance (1)' }).click()
  await expect(page.getByRole('status')).toContainText('saved in this demo')
  await page.getByRole('button', { name: 'Summary', exact: true }).click()
  await expect(page.getByLabel('late: 1')).toBeVisible()
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

test('synthetic provider reconciles an accepted write with a lost response', async ({ page }) => {
  const rows: Record<string, string>[] = []
  const methods: string[] = []
  let posts = 0
  await page.route('https://sheetdb.io/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    methods.push(request.method())
    expect(request.headers().authorization).toBe('Bearer synthetic-test-token')
    if (request.method() === 'GET') {
      await route.fulfill({ json: url.pathname.endsWith('/keys') ? HEADERS : rows })
    } else {
      expect(request.method()).toBe('POST')
      expect(url.searchParams.get('mode')).toBe('RAW')
      const body = z
        .object({ data: z.array(z.record(z.string(), z.string())) })
        .parse(request.postDataJSON())
      rows.push(...body.data)
      posts++
      await route.abort('failed')
    }
  })
  const access = encodeAccess({
    version: 1,
    username: 'Synthetic teacher',
    apiId: 'synthetic',
    token: 'synthetic-test-token',
    sheet: 'Events',
  })
  await page.goto(`/#access=${access}`)
  await expect(page.getByText('Synthetic teacher')).toBeVisible()
  await expect.poll(() => new URL(page.url()).hash).toBe('')
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await page.getByLabel('Student name').fill('Synthetic student')
  await page.getByRole('button', { name: 'Add student' }).click()
  await expect(page.getByText('1 records awaiting confirmation')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('save may already have reached the sheet')
  expect(rows).toHaveLength(1)
  const originalId = rows[0].id
  await page.getByRole('button', { name: 'Retry pending batch' }).click()
  await expect(page.getByRole('status')).toContainText('saved')
  expect(posts).toBe(1)
  expect(rows[0].id).toBe(originalId)
  expect(methods.every((method) => ['GET', 'POST'].includes(method))).toBe(true)
  await page.reload()
  await expect(page.getByText('Synthetic teacher')).toBeVisible()
  await page.getByRole('button', { name: 'Close session' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Explore with sample students' })).toBeVisible()
})

test('storage write failure prevents provider writes', async ({ page }) => {
  let writes = 0
  await page.route('https://sheetdb.io/**', async (route) => {
    if (route.request().method() === 'POST') writes++
    await route.fulfill({ json: [] })
  })
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('halaqa-pending-v1:')) throw new Error('Synthetic storage failure')
      return original.call(this, key, value)
    }
  })
  const access = encodeAccess({
    version: 1,
    username: 'Synthetic teacher',
    apiId: 'synthetic',
    token: 'synthetic-test-token',
    sheet: 'Events',
  })
  await page.goto(`/#access=${access}`)
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await page.getByLabel('Student name').fill('Synthetic student')
  await page.getByRole('button', { name: 'Add student' }).click()
  await expect(page.getByRole('alert').first()).toContainText('Could not persist the pending batch')
  expect(writes).toBe(0)
})

test('corrupted pending storage blocks saves', async ({ page }) => {
  let writes = 0
  await page.route('https://sheetdb.io/**', async (route) => {
    if (route.request().method() === 'POST') writes++
    await route.fulfill({ json: [] })
  })
  await page.addInitScript(() =>
    localStorage.setItem('halaqa-pending-v1:synthetic:Events:Synthetic teacher', 'invalid'),
  )
  const access = encodeAccess({
    version: 1,
    username: 'Synthetic teacher',
    apiId: 'synthetic',
    token: 'synthetic-test-token',
    sheet: 'Events',
  })
  await page.goto(`/#access=${access}`)
  await expect(page.getByRole('alert')).toContainText('saved batch is corrupted')
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await expect(page.getByLabel('Student name')).toBeDisabled()
  expect(writes).toBe(0)
})

test('another tab cannot send while the first save is in flight', async ({ context, page }) => {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let posts = 0
  await context.route('https://sheetdb.io/**', async (route) => {
    if (route.request().method() === 'POST') {
      posts++
      await gate
      await route.fulfill({ json: { created: 1 } })
    } else
      await route.fulfill({
        json: new URL(route.request().url()).pathname.endsWith('/keys') ? HEADERS : [],
      })
  })
  const access = encodeAccess({
    version: 1,
    username: 'Synthetic teacher',
    apiId: 'synthetic',
    token: 'synthetic-test-token',
    sheet: 'Events',
  })
  const second = await context.newPage()
  for (const tab of [page, second]) {
    await tab.goto(`/#access=${access}`)
    await tab.getByRole('button', { name: 'Students', exact: true }).click()
    await tab.getByLabel('Student name').fill('Synthetic student')
  }
  await page.getByRole('button', { name: 'Add student' }).click()
  await expect.poll(() => posts).toBe(1)
  await second.getByRole('button', { name: 'Add student' }).click()
  await expect(second.getByRole('alert')).toContainText('Another tab is saving')
  expect(posts).toBe(1)
  release()
  await expect(page.getByRole('status')).toContainText('saved')
})
