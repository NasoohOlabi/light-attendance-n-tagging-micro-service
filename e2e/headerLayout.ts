import { expect, type Page } from '@playwright/test'

export async function compactHeader(page: Page, selector: string) {
  const header = page.locator(selector)
  await expect(header).toBeVisible()
  const bounds = await header.boundingBox()
  if (!bounds) throw new Error('Header has no layout bounds')
  const buttons = await header.locator('button').evaluateAll((elements) =>
    elements
      .map((element) => {
        const box = element.getBoundingClientRect()
        return {
          left: box.left,
          right: box.right,
          top: box.top,
          width: box.width,
          height: box.height,
        }
      })
      .sort((a, b) => a.left - b.left),
  )
  const first = buttons[0]
  if (!first) throw new Error('Header has no action buttons')
  expect(first.left - bounds.x).toBeGreaterThanOrEqual(-1)
  expect(first.left - bounds.x).toBeLessThanOrEqual(4)
  for (const [index, button] of buttons.entries()) {
    expect(button.width).toBeGreaterThanOrEqual(44)
    expect(button.height).toBeGreaterThanOrEqual(44)
    expect(Math.abs(button.top - first.top)).toBeLessThanOrEqual(1)
    const previous = buttons[index - 1]
    if (previous) {
      expect(button.left - previous.right).toBeGreaterThanOrEqual(-1)
      expect(button.left - previous.right).toBeLessThanOrEqual(8)
    }
  }
  const logo = header.locator('.wartaq-logo')
  if (await logo.count()) {
    const brand = await logo.boundingBox()
    const last = buttons.at(-1)
    if (!brand || !last) throw new Error('Brand or actions have no layout bounds')
    expect(brand.x).toBeGreaterThanOrEqual(last.right + 8)
    expect(bounds.x + bounds.width - brand.x - brand.width).toBeLessThanOrEqual(4)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
}
