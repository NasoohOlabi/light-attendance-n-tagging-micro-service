import type { Page } from '@playwright/test'

export async function openProfile(page: Page) {
  const trigger = page.locator('.profile-trigger')
  if ((await trigger.count()) && (await trigger.getAttribute('aria-expanded')) !== 'true')
    await trigger.click()
}

export async function clickAccountAction(page: Page, name: string) {
  const action = page.getByRole('button', { name, exact: true })
  if (!(await action.isVisible())) await openProfile(page)
  await action.click()
  const trigger = page.locator('.profile-trigger')
  if ((await trigger.count()) && (await trigger.getAttribute('aria-expanded')) === 'true')
    await page.keyboard.press('Escape')
}
