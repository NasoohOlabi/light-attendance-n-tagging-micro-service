import { expect, test } from '@playwright/test'
import { createHttp } from '../telegram/runtime/http'

const origin = 'https://telegram-worker.example'
const code = '12345678'
const handler = createHttp({ callback: async () => code }, () => true)

test('link page fits the viewport and copies the code under the worker CSP', async ({
  page,
  context,
}, testInfo) => {
  await page.setViewportSize({
    width: testInfo.project.name === 'mobile' ? 320 : 1280,
    height: 800,
  })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
  await page.route(origin + '/callback', async (route) => {
    const response = await handler(new Request(route.request().url()))
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    })
  })
  await page.goto(origin + '/callback')
  await expect(page.getByText(code, { exact: true })).toHaveCount(1)
  await expect(page.locator('[lang="ar"]').first()).toHaveCSS('direction', 'rtl')
  await expect(page.getByRole('link')).toHaveAttribute('href', 'https://t.me/WartaqBot?start=link')
  const card = await page.locator('main').boundingBox()
  expect(card?.width).toBeLessThan(650)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: testInfo.outputPath('telegram-link.png'), fullPage: true })
  await page.getByRole('button', { name: /copy/i }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(code)
  await expect(page.getByRole('status')).toContainText('Copied.')
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: async () => {
        throw new DOMException('Denied', 'NotAllowedError')
      },
    })
  })
  await page.getByRole('button', { name: /copy/i }).click()
  await expect(page.getByRole('status')).toContainText('Copy the selected code')
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(code)
})
