import { expect, test, type Page } from '@playwright/test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'

async function usableLayout(page: Page) {
  const overflow = await page.locator('body *').evaluateAll((elements) =>
    elements
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return (
          (rect.width > innerWidth || rect.left < -1 || rect.right > innerWidth + 1) &&
          !element.closest('table') &&
          !element.closest('pre')
        )
      })
      .map((element) => ({
        tag: element.tagName,
        classes: element.className,
        width: element.getBoundingClientRect().width,
        left: element.getBoundingClientRect().left,
      }))
      .slice(0, 12),
  )
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    JSON.stringify(overflow),
  ).toBe(true)
  const undersized = await page
    .locator('button:visible, select:visible, summary:visible')
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const rect = element.getBoundingClientRect()
          return rect.width < 44 || rect.height < 44
        })
        .map((element) => element.textContent?.trim()),
    )
  expect(undersized).toEqual([])
  expect(
    await page
      .locator('input:visible:not([type=checkbox]), select:visible, textarea:visible')
      .evaluateAll((elements) =>
        elements.every((element) => parseFloat(getComputedStyle(element).fontSize) >= 16),
      ),
  ).toBe(true)
}

test('phone layouts keep every notebook view usable in English and Arabic', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/')
  await usableLayout(page)
  await page.getByRole('button', { name: 'Explore with sample students', exact: true }).click()
  for (const name of ['Attendance', 'Notes', 'Students', 'Summary', 'History & corrections']) {
    await page.getByRole('button', { name, exact: true }).click()
    await usableLayout(page)
  }
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  const longName = 'طالب'.repeat(45)
  await page.getByLabel('Student name').fill(longName)
  await page.getByRole('button', { name: 'Add student', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('saved in this demo')
  await usableLayout(page)
  await page.getByRole('button', { name: 'Notes', exact: true }).click()
  const note = page.getByLabel('Note', { exact: true })
  await note.fill('مسودة مشتركة English draft')
  await page.getByRole('button', { name: 'العربية', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('textarea')).toHaveValue('مسودة مشتركة English draft')
  await usableLayout(page)
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(note).toHaveValue('مسودة مشتركة English draft')
  await page.getByLabel('Tags, separated by commas').fill('مراجعة، قراءة')
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('saved in this demo')
  await page.getByLabel('Filter tag').selectOption('مراجعة')
  await expect(
    page.getByRole('article').filter({ hasText: 'مسودة مشتركة English draft' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'العربية', exact: true }).click()
  for (const name of ['الحضور', 'الملاحظات', 'الطلاب', 'الملخص', 'السجل والتصحيحات']) {
    await page.getByRole('button', { name, exact: true }).click()
    await usableLayout(page)
  }
  await page.getByRole('button', { name: 'الحضور', exact: true }).click()
  await page.getByLabel(`الحضور للطالب ${longName}`).selectOption('late')
  await page.getByRole('button', { name: 'حفظ الحضور (1)', exact: true }).click()
  await expect(page.getByRole('status')).not.toContainText('saved')
  await page.getByRole('button', { name: 'الملاحظات', exact: true }).click()
  for (const size of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size)
    await usableLayout(page)
  }
  await page.getByRole('button', { name: 'السجل والتصحيحات', exact: true }).click()
  const savedNote = page.locator('li').filter({ hasText: 'مسودة مشتركة English draft' })
  await savedNote.getByRole('button', { name: 'تراجع', exact: true }).click()
  await page.getByLabel('السبب', { exact: true }).fill('تصحيح تجريبي')
  await page.getByRole('button', { name: 'إضافة تصحيح', exact: true }).click()
  await expect(savedNote).toContainText('تم التراجع')
  await page.setViewportSize({ width: 320, height: 568 })
  await page.locator('nav button').nth(3).click()
  await expect(page.locator('th[scope=col]').first()).toBeVisible()
  await expect(page.locator('[tabindex="0"]').filter({ has: page.locator('table') })).toHaveCount(1)
  expect(
    await page
      .locator('table')
      .evaluate(
        (table) => table.getBoundingClientRect().width > (table.parentElement?.clientWidth ?? 0),
      ),
  ).toBe(true)
  await usableLayout(page)
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  await usableLayout(page)
  await page.evaluate(() => {
    document.documentElement.style.fontSize = ''
  })
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({
    path: `.artifacts/verification/mobile-arabic-${testInfo.project.name}.png`,
    fullPage: true,
  })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  expect(errors).toEqual([])
})

test('language switching works when preference storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Synthetic storage denial')
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'العربية', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test.describe('isolated local manager', () => {
  let directory: string
  let child: ChildProcess
  let address: string
  test.beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'halaqa-mobile-manager-'))
    child = spawn('bun', ['manager/server.ts'], {
      env: { ...process.env, MANAGER_DIRECTORY: directory, MANAGER_PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    address = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Manager startup timed out')), 15000)
      child.once('error', reject)
      child.stdout?.once('data', (chunk: Buffer) => {
        clearTimeout(timeout)
        resolve(chunk.toString().trim().replace('Local access manager: ', ''))
      })
    })
  })
  test.afterAll(async () => {
    if (child && child.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve))
      child.kill()
      await exited
    }
    if (directory) await rm(directory, { recursive: true, force: true })
  })
  test('manager language and phone layout preserve entered values', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto(address)
    await page
      .getByLabel('GitHub Pages URL (or local development URL)')
      .fill('https://example.test/notebook/')
    await usableLayout(page)
    await page.getByRole('button', { name: 'العربية', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('#site-url')).toHaveValue('https://example.test/notebook/')
    await usableLayout(page)
    await page.getByRole('button', { name: 'English', exact: true }).click()
    await page.getByRole('button', { name: 'Save URL', exact: true }).click()
    await expect(page.locator('#feedback')).toBeVisible()
    await page.getByRole('button', { name: 'العربية', exact: true }).click()
    await expect(page.locator('#feedback')).not.toContainText('saved')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
    await expect(page.locator('#site-url')).toHaveValue('https://example.test/notebook/')
    await usableLayout(page)
    await mkdir('.artifacts/verification', { recursive: true })
    await page.screenshot({
      path: `.artifacts/verification/manager-arabic-${testInfo.project.name}.png`,
      fullPage: true,
    })
  })
})
