import { expect, test } from '@playwright/test'

test('obsolete capability links are scrubbed and never authenticate', async ({ page }) => {
  const external: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url())
  })
  await page.addInitScript(() => sessionStorage.setItem('halaqa-access-v1', 'old-secret'))
  await page.goto('/?access=old-secret#access=old-secret')
  await expect(page).not.toHaveURL(/old-secret/)
  await expect(page.locator('.wartaq-home')).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('halaqa-access-v1'))).toBeNull()
  await page.evaluate(() => {
    location.hash = 'access=another-secret'
  })
  await expect(page).not.toHaveURL(/another-secret/)
  expect(external).toEqual([])
})
