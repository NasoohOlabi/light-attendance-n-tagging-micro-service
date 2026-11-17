import { expect, test } from '@playwright/test'
import { clickAccountAction } from './profileActions'

test.use({ trace: 'off' })

test('staff phone links remain usable in both languages', async ({ page }) => {
  const id = '10000000-0000-4000-8000-000000000001'
  const studentId = '20000000-0000-4000-8000-000000000001'
  const teacher = {
    role: 'administrator',
    id,
    name: 'Synthetic Admin',
    canRead: true,
    canWrite: true,
    expiresAt: null,
  }
  const student = {
    kind: 'student',
    studentId,
    name: 'Synthetic Student',
    firstName: 'Synthetic',
    lastName: 'Student',
    whatsapp: '963 912 345 678',
    group: 'A',
    active: true,
    teacherId: id,
    location: null,
    birthYear: null,
  }
  const students = [
    student,
    ...['0912 345 678', null, '1234567', 'invalid 123'].map((whatsapp, index) => ({
      ...student,
      studentId: `20000000-0000-4000-8000-00000000000${index + 2}`,
      name: `Synthetic ${index}`,
      firstName: `Synthetic ${index}`,
      whatsapp,
    })),
  ]
  const writes: string[] = []
  await page.route('**/api/auth/**', async (route) => {
    const now = new Date().toISOString()
    await route.fulfill({
      json: {
        user: {
          id,
          name: 'Synthetic Admin',
          email: 'admin@example.test',
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
        session: {
          id: 'session',
          userId: id,
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
    if (route.request().method() !== 'GET') writes.push(path)
    if (path.startsWith('/api/auth/')) return route.fallback()
    if (path === '/api/me') return route.fulfill({ json: { account: teacher } })
    if (path === '/api/admin')
      return route.fulfill({
        json: {
          accounts: [],
          teachers: [{ teacherId: id, name: 'Synthetic Admin', active: true }],
          students,
        },
      })
    return route.fulfill({
      json: { teacher, students, courses: [], enrollments: [], events: [] },
    })
  })
  await page.goto('/?page=app&tab=roster')
  const check = async () => {
    const link = page.getByRole('link', { name: '+963 912 345 678' })
    await link.scrollIntoViewIfNeeded()
    await expect(link).toHaveAttribute('href', 'tel:+963912345678')
    await expect(link).toHaveAttribute('dir', 'ltr')
    expect(
      await link.evaluate((element) => element.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  }
  await check()
  await page.setViewportSize({ width: 320, height: 844 })
  await check()
  const list = page.getByRole('region', { name: 'Student list' })
  await expect(list.getByRole('link', { name: '0912 345 678' })).toHaveAttribute(
    'href',
    'tel:0912345678',
  )
  await expect(list.getByRole('link', { name: '1234567' })).toHaveAttribute('href', 'tel:1234567')
  await expect(list.getByText('invalid 123')).toBeVisible()
  await expect(list.getByText('Not provided')).toBeVisible()
  await clickAccountAction(page, 'العربية')
  await check()
  await clickAccountAction(page, 'English')
  await list
    .locator(`[data-student-id="${studentId}"]`)
    .getByRole('button', { name: 'Open student' })
    .click()
  await check()
  await clickAccountAction(page, 'العربية')
  await check()
  await clickAccountAction(page, 'English')
  await clickAccountAction(page, 'Settings')
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name: 'Students', exact: true })
    .click()
  await check()
  await clickAccountAction(page, 'العربية')
  await check()
  expect(writes).toEqual([])
})
