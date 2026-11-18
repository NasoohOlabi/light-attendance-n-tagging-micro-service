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
test('administrator creates one invitation and can safely retry it', async ({
  page,
  baseURL,
}, testInfo) => {
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 800 })
  await mockAuth(page, adminId)
  let posts = 0
  let requestId = ''
  const person = { firstName: 'Ava', lastName: 'Example', role: 'administrator' }
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
      expect(body.people).toEqual([person])
      if (posts === 1) {
        requestId = body.requestId
        return route.abort()
      }
      expect(body.requestId).toBe(requestId)
      return route.fulfill({
        json: {
          invitations: [
            {
              ...person,
              username: 'sample0',
              temporaryPassword: 'Synthetic-password-1',
            },
          ],
        },
      })
    }
    return route.fulfill({ json: { accounts: [], teachers: [], students: [] } })
  })
  await page.goto('/?page=app')
  await expect(page.getByRole('button', { name: 'Take attendance' })).toBeVisible()
  await clickAccountAction(page, 'Settings')
  await page.getByRole('button', { name: 'Create accounts' }).click()
  const main = page.getByRole('main')
  const firstName = page.getByLabel('First name')
  const lastName = page.getByLabel('Last name')
  const role = page.getByRole('combobox', { name: 'Role', exact: true })
  const create = page.getByRole('button', { name: 'Create account', exact: true })
  await page.locator('.skip-link').press('Enter')
  await expect(main).toBeFocused()
  await expect(main).toHaveCSS('outline-style', 'none')
  await firstName.click()
  await page.getByRole('heading', { name: 'Create accounts' }).click()
  await expect(main).toHaveCSS('outline-style', 'none')
  await expect(main.locator('textarea')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Preview rows' })).toHaveCount(0)
  await clickAccountAction(page, 'العربية')
  await page.getByRole('heading', { name: 'إنشاء حسابات' }).click()
  await expect(main).toHaveCSS('outline-style', 'none')
  await expect(main.locator('textarea')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'معاينة الصفوف' })).toHaveCount(0)
  await clickAccountAction(page, 'English')
  await expect(create).toBeDisabled()
  await expect(role).toHaveValue('teacher')
  await firstName.fill(person.firstName)
  await page.keyboard.press('Tab')
  await expect(lastName).toBeFocused()
  await expect(lastName).toHaveCSS('outline-style', 'solid')
  await lastName.fill(person.lastName)
  await role.selectOption(person.role)
  await create.click()
  await expect(page.getByRole('alert')).toContainText('could not be confirmed')
  await page.getByRole('button', { name: 'Retry safely' }).click()
  const invitation = page.getByRole('textbox', { name: 'Ava Example' })
  const copy = page.getByRole('button', { name: 'Copy message' })
  const feedback = page.getByRole('status').filter({ hasText: 'Message copied' })
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: () => Promise.reject(new DOMException('Clipboard denied', 'NotAllowedError')),
    })
  })
  await clickAccountAction(page, 'العربية')
  const arabicCopy = page.getByRole('button', { name: 'نسخ الرسالة' })
  await arabicCopy.click()
  await expect(page.getByRole('status').filter({ hasText: 'انسخها يدوياً' })).toBeVisible()
  await expect(invitation).toBeFocused()
  await expect(invitation).toHaveCSS('direction', 'rtl')
  expect(
    await invitation.evaluate(
      (element) =>
        element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight,
    ),
  ).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const selection = await invitation.evaluate((element) =>
    element instanceof HTMLTextAreaElement
      ? element.value.slice(element.selectionStart, element.selectionEnd)
      : '',
  )
  expect(selection).toBe(await invitation.inputValue())
  await page.evaluate(() => Reflect.deleteProperty(navigator.clipboard, 'writeText'))
  await clickAccountAction(page, 'English')
  const message = await invitation.inputValue()
  expect(message).toContain('Synthetic-password-1')
  expect(message).toContain(`${baseURL}/?page=app&login=username`)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const readClipboard = () =>
    page.evaluate(async () => (await navigator.clipboard.readText()).replaceAll('\r\n', '\n'))
  for (const context of ['first copy', 'repeat copy']) {
    await test.step(context, async () => {
      await page.evaluate(() => navigator.clipboard.writeText('Previous clipboard contents'))
      await copy.click()
      await expect(feedback).toBeInViewport()
      await expect.poll(readClipboard).toBe(message)
      await expect(copy).toBeEnabled()
    })
  }
  await clickAccountAction(page, 'العربية')
  await arabicCopy.click()
  await expect(page.getByRole('status').filter({ hasText: 'تم نسخ الرسالة' })).toBeInViewport()
  await expect.poll(readClipboard).toBe(await invitation.inputValue())
  expect(posts).toBe(2)
  await page.getByRole('button', { name: 'العودة إلى الحسابات' }).click()
  await expect(invitation).toHaveCount(0)
})
