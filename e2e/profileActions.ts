import type { Page } from '@playwright/test'

export async function openProfile(page: Page) {
  const closedProfile = page.locator('.profile-trigger[aria-expanded="false"]')
  if (await closedProfile.isVisible()) await closedProfile.click()
}

export async function clickAccountAction(page: Page, name: string) {
  const action = page.getByRole('button', { name, exact: true })
  if (!(await action.isVisible())) await openProfile(page)
  await action.click()
  if (await page.locator('.profile-trigger[aria-expanded="true"]').isVisible())
    await page.keyboard.press('Escape')
}
