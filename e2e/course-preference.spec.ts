import { expect, test } from '@playwright/test'

const account = '10000000-0000-4000-8000-000000000001'
const otherAccount = '10000000-0000-4000-8000-000000000002'
const first = '30000000-0000-4000-8000-000000000001'
const second = '30000000-0000-4000-8000-000000000002'
const third = '30000000-0000-4000-8000-000000000004'
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
          { id: '30000000-0000-4000-8000-000000000005', name: 'Tajweed', open: true },
        ],
        enrollments: [],
        events: [],
      },
    })
  })
  await page.goto('/?page=app')
  const switcher = page.getByLabel(/Change course/)
  const label = page.locator('.workspace-course-name')
  await switcher.click()
  await page.getByRole('button', { name: branded, exact: true }).click()
  await expect(label).toHaveText('\u0665')
  await expect(page).toHaveURL(new RegExp(`course=${first}`))
  await switcher.click()
  await page.getByRole('button', { name: 'Make default', exact: true }).click()
  await page.goto(`/?page=app&tab=attendance&course=${second}`)
  await expect(label).toHaveText(longName)
  await expect(switcher).toHaveAccessibleDescription(longName)
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`course=${second}`))
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`course=${second}`))
  await switcher.click()
  await expect(page.getByRole('button', { name: longName, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Previous / no course', exact: true }).click()
  await expect(switcher).toBeFocused()
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(page).toHaveURL(/course=none/)
  await page.goto('/?page=app')
  await expect(label).toHaveText('\u0665')
  await page.goto(`/?page=app&tab=roster&course=all`)
  await switcher.click()
  await expect(page.getByRole('button', { name: 'All students', exact: true })).toBeVisible()
  await page.getByRole('button', { name: longName, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`course=${second}`))
  await page.reload()
  await expect(label).toHaveText(longName)
  await page.goBack()
  await expect(page).toHaveURL(/course=all/)
  await page.goForward()
  await expect(label).toHaveText(longName)
  await switcher.click()
  await page.keyboard.press('Escape')
  await expect(switcher).toBeFocused()
  await expect(page.getByRole('button', { name: 'Make default' })).toHaveCount(0)
  await switcher.click()
  await page.locator('main').click({ position: { x: 2, y: 2 } })
  await expect(page.getByRole('button', { name: 'Make default' })).toHaveCount(0)
  await page.goto('/?page=app&tab=attendance&course=30000000-0000-4000-8000-000000000003')
  await expect(label).toHaveText('Choose course')
  await page.goto('/?page=app')
  await expect(label).toHaveText('\u0665')
  await page.getByRole('button', { name: 'Courses', exact: true }).click()
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await expect(label).toHaveText('\u0665')
  for (const language of ['en', 'ar']) {
    await page.evaluate((value) => localStorage.setItem('halaqa-language', value), language)
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/?page=app&tab=attendance&course=${second}`)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      const trigger = page.locator('.workspace-course-switcher summary')
      const triggerBox = await trigger.boundingBox()
      expect(triggerBox?.height).toBeGreaterThanOrEqual(44)
      await trigger.click()
      const menu = page.locator('.workspace-course-menu')
      const box = await menu.boundingBox()
      expect(box?.x).toBeGreaterThanOrEqual(0)
      expect(box ? box.x + box.width : Infinity).toBeLessThanOrEqual(width)
      for (const button of await menu.locator('button').all()) {
        expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44)
      }
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme)
        const background = await menu.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        )
        expect(background).toBe(theme === 'dark' ? 'rgb(23, 59, 64)' : 'rgb(255, 255, 255)')
      }
      await page.keyboard.press('Escape')
    }
  }
  for (const role of ['administrator', 'teacher']) {
    teacher.role = role
    await page.evaluate(() => localStorage.setItem('halaqa-language', 'en'))
    await page.goto('/?page=app&tab=roster&course=none')
    await expect(label).toHaveText('All students')
    await page.getByLabel(/Change course/).click()
    await expect(page.getByRole('button', { name: 'All students', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(
      page.getByRole('button', { name: 'Previous / no course', exact: true }),
    ).toHaveCount(0)
    await page.getByRole('button', { name: 'All students', exact: true }).click()
    await expect(page).toHaveURL(/course=all/)
  }
  teacher.role = 'administrator'
  userId = otherAccount
  await page.goto('/?page=app')
  await expect(label).toHaveText('Choose course')
  await page.evaluate(
    (id) => localStorage.setItem(`halaqa-course:${id}`, '{invalid json'),
    otherAccount,
  )
  await page.goto('/?page=app')
  await expect(label).toHaveText('Choose course')
  await page.evaluate(() => localStorage.setItem('halaqa-language', 'en'))
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
  await page.getByLabel(/Change course/).click()
  await page.getByRole('button', { name: branded, exact: true }).click()
  await page.getByLabel(/Change course/).click()
  await page.getByRole('button', { name: 'Make default' }).click()
  await page.goto('/?page=app')
  await expect(label).toHaveText('Choose course')
})
