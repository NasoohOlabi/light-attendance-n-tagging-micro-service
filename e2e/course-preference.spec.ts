import { clickRecordAction } from './recordActions'
import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { compactHeader } from './headerLayout'

const account = '10000000-0000-4000-8000-000000000001'
const otherAccount = '10000000-0000-4000-8000-000000000002'
const first = '30000000-0000-4000-8000-000000000001'
const second = '30000000-0000-4000-8000-000000000002'
const fourth = '30000000-0000-4000-8000-000000000005'
const third = '30000000-0000-4000-8000-000000000004'
const missing = '30000000-0000-4000-8000-000000000003'
const branded = '\u0648\u0627\u0631\u062a\u0642 \u0665'
const longName = 'A very long course name that should fit safely on a narrow phone screen'

test.use({ trace: 'off' })
test('remembers a validated course per account and keeps the header compact', async ({ page }) => {
  let userId = account
  const teacher = {
    role: 'administrator',
    id: account,
    name: 'Admin',
    canRead: true,
    canWrite: true,
    expiresAt: null,
  }
  await page.route('**/api/auth/**', async (route) => {
    const now = new Date().toISOString()
    await route.fulfill({
      json: {
        user: {
          id: userId,
          name: 'Admin',
          email: 'admin@example.test',
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
        session: {
          id: 'session',
          userId,
          token: 'synthetic',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          createdAt: now,
          updatedAt: now,
        },
      },
    })
  })
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.startsWith('/api/auth/')) return route.fallback()
    if (path === '/api/me') return route.fulfill({ json: { account: teacher } })
    if (path === '/api/admin')
      return route.fulfill({ json: { accounts: [], teachers: [], students: [] } })
    return route.fulfill({
      json: {
        teacher,
        students: [],
        courses: [
          { id: first, name: branded, open: true },
          { id: second, name: longName, open: true },
          { id: third, name: '\u0648\u0627\u0631\u062a\u0642 5', open: true },
          { id: fourth, name: 'Tajweed', open: true },
        ],
        enrollments: [],
        events: [],
      },
    })
  })
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/?page=app')
  const defaultPicker = page.getByRole('combobox', { name: 'Default course', exact: true })
  const rosterPicker = page.getByRole('combobox', { name: 'Course', exact: true })
  const label = page.locator('.workspace-course-name')
  await expect(defaultPicker).toHaveValue('')
  await expect(defaultPicker.locator('option')).toHaveCount(5)
  await page.getByRole('button', { name: 'Take attendance' }).click()
  await expect(page.getByText('Choose an open course to take attendance.')).toBeVisible()
  await page.getByRole('button', { name: 'Go to courses', exact: true }).click()
  const course = page.getByRole('row').filter({ hasText: branded })
  await clickRecordAction(course, 'Make current')
  await expect(course.getByText('Current course', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(defaultPicker).toHaveValue(first)
  await expect(label).toHaveText('\u0665')
  await expect(label).toHaveAttribute('aria-label', branded)
  await page.locator('.profile-trigger').click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await expect(label).toHaveText('\u0665')
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await expect(rosterPicker).toHaveValue(first)
  await rosterPicker.selectOption(second)
  await expect(label).toHaveText(longName)
  await page.reload()
  await expect(rosterPicker).toHaveValue(second)
  await rosterPicker.selectOption('')
  await expect(page).toHaveURL(/course=all/)
  await page.reload()
  await expect(rosterPicker).toHaveValue('')
  await page.goBack()
  await expect(rosterPicker).toHaveValue(second)
  await page.goForward()
  await expect(rosterPicker).toHaveValue('')
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await expect(rosterPicker).toHaveCount(0)
  await expect(defaultPicker).toHaveCount(0)
  await expect(label).toHaveText('\u0665')
  await page.getByRole('button', { name: 'Summary', exact: true }).click()
  await expect(rosterPicker).toHaveCount(0)
  await expect(defaultPicker).toHaveCount(0)
  await expect(label).toHaveText('\u0665')
  await page.getByRole('button', { name: 'Courses', exact: true }).click()
  await clickRecordAction(page.getByRole('row').filter({ hasText: longName }), 'History')
  await expect(label).toHaveText(longName)
  await page.goto('/?page=app')
  await expect(defaultPicker).toHaveValue(first)
  await page.goto(`/?page=app&tab=attendance&course=${second}`)
  await expect(label).toHaveText(longName)
  await page.goto('/?page=app&tab=roster')
  await expect(rosterPicker).toHaveValue(first)
  await page.goto('/?page=app&tab=roster&course=all')
  await expect(rosterPicker).toHaveValue('')
  await page.goto('/?page=app')
  await defaultPicker.selectOption(second)
  await page.goto('/?page=app')
  await expect(defaultPicker).toHaveValue(second)
  await defaultPicker.selectOption('')
  await page.goto('/?page=app')
  await expect(defaultPicker).toHaveValue('')
  await expect(label).toHaveCount(0)
  await page.evaluate(
    ({ account, missing }) =>
      localStorage.setItem(`halaqa-course:${account}`, JSON.stringify(missing)),
    { account, missing },
  )
  await page.goto('/?page=app')
  await expect(defaultPicker).toHaveValue('')
  await defaultPicker.selectOption(first)
  await page.evaluate(() => localStorage.setItem('halaqa-language', 'ar'))
  await page.goto('/?page=app')
  await expect(label).toHaveText('\u0665')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({
    path: `.artifacts/verification/default-course-ar-${test.info().project.name}.png`,
  })
  await page.locator('.workspace-main select').first().selectOption(third)
  await expect(label).toHaveText('5')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/?page=app&tab=attendance&course=${fourth}`)
  await expect(label).toHaveText('Tajweed')
  await page.screenshot({
    path: `.artifacts/verification/default-course-desktop-${test.info().project.name}.png`,
  })
  for (const language of ['en', 'ar']) {
    await page.evaluate((value) => localStorage.setItem('halaqa-language', value), language)
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      for (const course of [third, second]) {
        await page.goto(`/?page=app&tab=attendance&course=${course}`)
        await expect(label).toHaveText(course === third ? '5' : longName)
        await compactHeader(page, '.workspace-brand')
        await page.locator('.profile-trigger').click()
        const menu = await page.locator('.profile-panel').boundingBox()
        expect(menu?.x).toBeGreaterThanOrEqual(0)
        expect(menu ? menu.x + menu.width : Infinity).toBeLessThanOrEqual(width)
        await page.keyboard.press('Escape')
      }
    }
  }
  await page.evaluate(() => localStorage.setItem('halaqa-language', 'en'))
  userId = otherAccount
  await page.goto('/?page=app')
  await expect(defaultPicker).toHaveValue('')
  await page.evaluate(
    ({ otherAccount }) => localStorage.setItem(`halaqa-course:${otherAccount}`, '{invalid json'),
    { otherAccount },
  )
  await page.goto('/?page=app')
  await expect(defaultPicker).toHaveValue('')
  await page.addInitScript(() => {
    const getItem = Storage.prototype.getItem
    const setItem = Storage.prototype.setItem
    Storage.prototype.getItem = function (key) {
      if (key.startsWith('halaqa-course:'))
        throw new DOMException('Storage denied', 'SecurityError')
      return getItem.call(this, key)
    }
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('halaqa-course:'))
        throw new DOMException('Storage denied', 'SecurityError')
      return setItem.call(this, key, value)
    }
  })
  await page.goto('/?page=app')
  await defaultPicker.selectOption(first)
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await expect(label).toHaveText('\u0665')
  await page.goto('/?page=app')
  await expect(defaultPicker).toHaveValue('')
})
