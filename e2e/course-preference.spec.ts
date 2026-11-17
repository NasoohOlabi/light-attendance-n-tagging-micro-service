import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

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
  const course = page.getByRole('combobox', { name: 'Course', exact: true })
  await expect(course).toHaveValue('')
  await course.selectOption(first)
  const label = page.locator('.workspace-course-name')
  await expect(label).toHaveText('\u0665')
  await expect(label).toHaveAttribute('aria-label', branded)
  await page.goto('/?page=app')
  await expect(course).toHaveValue(first)
  await page.goto('/?page=app&tab=roster')
  await expect(course).toHaveValue('')
  await page.getByRole('button', { name: 'Courses', exact: true }).click()
  await page
    .getByRole('row')
    .filter({ hasText: longName })
    .getByRole('button', { name: 'History' })
    .click()
  await expect(course).toHaveValue(second)
  await page.goto('/?page=app')
  await expect(course).toHaveValue(second)
  await page.goto(`/?page=app&course=${first}`)
  await expect(course).toHaveValue(first)
  await page.goto(`/?page=app&course=${second}`)
  await expect(course).toHaveValue(second)
  await expect(label).toHaveText(longName)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await course.selectOption('')
  await page.goto('/?page=app')
  await expect(course).toHaveValue('')
  await expect(label).toHaveCount(0)
  await page.evaluate(
    ({ account, missing }) =>
      localStorage.setItem(`halaqa-course:${account}`, JSON.stringify(missing)),
    { account, missing },
  )
  await page.goto('/?page=app')
  await expect(course).toHaveValue('')
  await course.selectOption(first)
  await page.evaluate(() => localStorage.setItem('halaqa-language', 'ar'))
  await page.goto('/?page=app')
  await expect(label).toHaveText('\u0665')
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({
    path: `.artifacts/verification/course-preference-ar-${test.info().project.name}.png`,
  })
  await page.locator('.workspace-main select').first().selectOption(third)
  await expect(label).toHaveText('5')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/?page=app&course=${second}`)
  await expect(label).toHaveText(longName)
  expect(
    await page.locator('.workspace-rail').evaluate((rail) => rail.getBoundingClientRect().width),
  ).toBeLessThan(250)
  await page.goto(`/?page=app&course=${fourth}`)
  await expect(label).toHaveText('Tajweed')
  await page.screenshot({
    path: `.artifacts/verification/course-preference-desktop-${test.info().project.name}.png`,
  })
  await page.locator('.profile-trigger').click()
  const menu = await page.locator('.profile-panel').boundingBox()
  expect(menu?.x).toBeGreaterThanOrEqual(0)
  expect(menu ? menu.x + menu.width : Infinity).toBeLessThanOrEqual(1440)
  await page.keyboard.press('Escape')
  await page.evaluate(() => localStorage.setItem('halaqa-language', 'en'))
  userId = otherAccount
  await page.goto('/?page=app')
  await expect(course).toHaveValue('')
  await page.evaluate(
    ({ otherAccount }) => {
      localStorage.setItem(`halaqa-course:${otherAccount}`, '{invalid json')
    },
    { otherAccount },
  )
  await page.goto('/?page=app')
  await expect(course).toHaveValue('')
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
  await expect(course).toHaveValue('')
  await course.selectOption(first)
  await expect(course).toHaveValue(first)
  await expect(label).toHaveText('\u0665')
  await page.goto('/?page=app')
  await expect(course).toHaveValue('')
})
