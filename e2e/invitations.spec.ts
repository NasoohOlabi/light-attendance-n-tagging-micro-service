import { clickAccountAction } from './profileActions'
import { expect, test, type Page } from '@playwright/test'
test.use({ trace: 'off' })
const adminId = '10000000-0000-4000-8000-000000000001'
async function mockAuth(page: Page, id: string) {
  await page.route('**/api/auth/**', async (route) => {
    const now = new Date().toISOString()
    return route.fulfill({
      json: {
        user: {
          id,
          name: 'Synthetic User',
          image: null,
          email: 'synthetic@example.test',
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
        session: {
          id: 'synthetic-session',
          userId: id,
          token: 'opaque-session',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          createdAt: now,
          updatedAt: now,
        },
      },
    })
  })
}
test('administrator previews and creates invitations on a phone', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await mockAuth(page, adminId)
  let posts = 0
  let requestId = ''
  await page.route('**/api/**', async (route) => {
    if (new URL(route.request().url()).pathname.startsWith('/api/auth/')) return route.fallback()
    const req = route.request()
    const path = new URL(req.url()).pathname
    const account = {
      role: 'administrator',
      id: adminId,
      name: 'Synthetic Admin',
      canRead: true,
      canWrite: true,
      expiresAt: null,
    }
    if (path === '/api/me') return route.fulfill({ json: { account } })
    if (path === '/api/notebook')
      return route.fulfill({
        json: { teacher: account, students: [], events: [], courses: [], enrollments: [] },
      })
    if (path === '/api/admin/accounts/invite') {
      posts++
      const body = req.postDataJSON()
      if (posts === 1) {
        requestId = body.requestId
        return route.abort()
      }
      expect(body.requestId).toBe(requestId)
      expect(body.people).toEqual([
        { firstName: 'Ava', lastName: 'Example', role: 'teacher' },
        { firstName: 'Omar', lastName: 'Example', role: 'teacher' },
      ])
      return route.fulfill({
        json: {
          invitations: body.people.map(
            (person: { firstName: string; lastName: string; role: string }, index: number) => ({
              ...person,
              username: `sample${index}`,
              temporaryPassword: 'Synthetic-password-1',
            }),
          ),
        },
      })
    }
    return route.fulfill({ json: { accounts: [], teachers: [], students: [] } })
  })
  await page.goto('/?page=app')
  await expect(page.getByRole('button', { name: 'Take attendance' })).toBeVisible()
  await clickAccountAction(page, 'Settings')
  await page.getByRole('button', { name: 'Create accounts' }).click()
  await page.getByLabel('Paste from spreadsheet').fill('Ava\tExample\nOmar\tExample')
  await page.getByRole('button', { name: 'Preview rows' }).click()
  await expect(page.getByText('Ava Example', { exact: false })).toBeVisible()
  await expect(page.getByText('Omar Example', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Create accounts' }).click()
  await expect(page.getByRole('alert')).toContainText('could not be confirmed')
  await page.getByRole('button', { name: 'Retry safely' }).click()
  await expect(page.getByLabel('Ava Example')).toContainText('Synthetic-password-1')
  await expect(page.getByLabel('Ava Example')).toContainText(`${baseURL}/?page=app&login=username`)
  expect(posts).toBe(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Back to accounts' }).click()
  await expect(page.getByText('Synthetic-password-1')).toHaveCount(0)
})
