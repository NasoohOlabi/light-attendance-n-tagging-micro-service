import { expect, test } from '@playwright/test'
import { neonAdminBoardSchema, neonSnapshotSchema } from '../shared/neon'
import { clickAccountAction } from './profileActions'
import { mkdir } from 'node:fs/promises'

test.use({ trace: 'off' })

const actorId = '10000000-0000-4000-8000-000000000001'
const courseId = '30000000-0000-4000-8000-000000000001'

test('long grades remain navigable in both languages', async ({ page }, testInfo) => {
  const students = Array.from({ length: 30 }, (_, index) => ({
    kind: 'student',
    studentId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    name: `Student ${String(index + 1).padStart(2, '0')}`,
    firstName: `Student ${String(index + 1).padStart(2, '0')}`,
    lastName: '',
    group: '',
    active: true,
    teacherId: actorId,
    whatsapp: null,
    location: '',
    birthYear: null,
  }))
  const teacher = {
    role: 'administrator',
    id: actorId,
    name: 'Admin',
    canRead: true,
    canWrite: true,
    expiresAt: null,
  }
  const enrollments = students.map((student, index) => ({
    id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    courseId,
    studentId: student.studentId,
    level: index === 0 ? '1.0' : '',
    practical: null,
    theory: null,
    active: true,
    handbookReceived: false,
  }))
  const board = neonAdminBoardSchema.parse({
    accounts: [],
    teachers: [{ teacherId: actorId, name: 'Teacher', active: true }],
    students,
  })
  const snapshot = neonSnapshotSchema.parse({
    teacher,
    students,
    enrollments,
    courses: [{ id: courseId, name: 'Course', open: true }],
    events: [],
  })
  let saved = false
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.startsWith('/api/auth/')) {
      const now = new Date().toISOString()
      return route.fulfill({
        json: {
          user: {
            id: actorId,
            name: 'Admin',
            email: 'admin@example.test',
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
          },
          session: {
            id: 'session',
            userId: actorId,
            token: 'synthetic',
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            createdAt: now,
            updatedAt: now,
          },
        },
      })
    }
    if (path === '/api/me') return route.fulfill({ json: { account: teacher } })
    if (path === '/api/notebook') return route.fulfill({ json: snapshot })
    if (path === '/api/admin') return route.fulfill({ json: board })
    if (path === '/api/admin/enrollments/grades') {
      saved = true
      return route.fulfill({ json: { ok: true } })
    }
    return route.fulfill({ status: 501 })
  })
  if (testInfo.project.name === 'chromium') await page.setViewportSize({ width: 1280, height: 600 })
  await page.goto(`/?page=app&view=courses&course=${courseId}&courseView=grades`)
  for (const ar of [false, true]) {
    if (ar) await clickAccountAction(page, 'العربية')
    const region = page.getByRole('region', { name: ar ? 'درجات الدورة' : 'Course grades' })
    await expect(region).toBeVisible()
    const level = region.locator(`td[data-label="${ar ? 'مستوى الدورة' : 'Course level'}"]`).first()
    await expect(level).toHaveText('1')
    const startGap = await level.evaluate((cell, rtl) => {
      const range = document.createRange()
      range.selectNodeContents(cell)
      const value = range.getBoundingClientRect()
      const bounds = cell.getBoundingClientRect()
      const padding = parseFloat(getComputedStyle(cell).paddingInlineStart)
      return Math.abs((rtl ? bounds.right - value.right : value.left - bounds.left) - padding)
    }, ar)
    expect(startGap).toBeLessThan(1)
    const metrics = await region.evaluate((element) => ({
      client: element.clientHeight,
      scroll: element.scrollHeight,
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    if (testInfo.project.name === 'chromium') {
      expect(metrics.scroll).toBeGreaterThan(metrics.client)
      await region.evaluate((element) => {
        element.scrollTop = 0
      })
      await region.scrollIntoViewIfNeeded()
      await region.focus()
      await expect(region).toBeFocused()
      const header = region.locator('thead th').first()
      const before = await header.boundingBox()
      const titleBefore = await page.locator('.grade-title-bar').boundingBox()
      const thresholdsBefore = await page.locator('.grade-title-bar + form').boundingBox()
      const windowBefore = await page.evaluate(() => window.scrollY)
      expect(before?.height).toBeGreaterThan(0)
      await page.keyboard.press('End')
      await expect.poll(() => region.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
      const after = await header.boundingBox()
      expect(after?.height).toBeGreaterThan(0)
      if (!before || !after || !titleBefore || !thresholdsBefore)
        throw new Error('Missing grade layout bounds')
      expect(Math.abs(before.y - after.y)).toBeLessThan(1)
      expect(await page.evaluate(() => window.scrollY)).toBe(windowBefore)
      expect(await page.locator('.grade-title-bar').boundingBox()).toEqual(titleBefore)
      expect(await page.locator('.grade-title-bar + form').boundingBox()).toEqual(thresholdsBefore)
      expect(
        await header.evaluate((element) => getComputedStyle(element).backgroundColor),
      ).not.toBe('rgba(0, 0, 0, 0)')
      await expect(header).toHaveCSS(
        'background-color',
        await region.evaluate((element) => {
          const panel = element.closest('.panel')
          if (!panel) throw new Error('Missing Grades panel')
          return getComputedStyle(panel).backgroundColor
        }),
      )
    } else {
      expect(metrics.scroll).toBe(metrics.client)
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 1)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true)
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 })
        const header = await page.locator('.workspace-rail').boundingBox()
        const panel = await page.locator('section.panel').filter({ has: region }).boundingBox()
        if (!header || !panel) throw new Error('Missing mobile workspace bounds')
        expect(panel.y - (header.y + header.height)).toBeGreaterThanOrEqual(16)
        const row = region.locator('tbody tr').first()
        const layout = await row.evaluate((element) => {
          const cells = [...element.querySelectorAll('td')]
          const bounds = element.getBoundingClientRect()
          const notes = cells[6]?.getBoundingClientRect()
          const theory = cells[4]?.querySelector('input')?.getBoundingClientRect()
          const practical = cells[5]?.querySelector('input')?.getBoundingClientRect()
          if (!notes || !theory || !practical) throw new Error('Missing grade fields')
          return {
            padding: parseFloat(getComputedStyle(element).paddingInlineStart),
            notesWidth: notes.width,
            rowWidth: bounds.width,
            theoryWidth: theory.width,
            theoryCellWidth: cells[4].getBoundingClientRect().width,
            scoreOffset: Math.abs(theory.top - practical.top),
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
          }
        })
        expect(layout.padding).toBeGreaterThanOrEqual(12)
        expect(layout.notesWidth).toBeGreaterThan(layout.rowWidth * 0.8)
        expect(layout.theoryWidth).toBeGreaterThanOrEqual(layout.theoryCellWidth - 1)
        expect(layout.scoreOffset).toBeLessThan(1)
        expect(layout.overflow).toBe(false)
      }
      await page.setViewportSize({ width: 390, height: 844 })
      const firstRow = region.locator('tbody tr').first()
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme })
        await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme)
        await firstRow.evaluate((element) => {
          element.scrollIntoView({ block: 'start', behavior: 'instant' })
        })
        await firstRow.screenshot({
          path: `.artifacts/verification/grade-record-${ar ? 'ar' : 'en'}-${colorScheme}.png`,
        })
      }
      await page.emulateMedia({ colorScheme: 'light' })
    }
    await mkdir('.artifacts/verification', { recursive: true })
    await page.screenshot({
      path: `.artifacts/verification/grades-scroll-${testInfo.project.name}-${ar ? 'ar' : 'en'}.png`,
    })
    const lastRow = region.getByRole('row').filter({ hasText: 'Student 30' })
    await lastRow.getByRole('button', { name: ar ? 'حفظ الدرجات' : 'Save grades' }).click()
    await expect.poll(() => saved).toBe(true)
    saved = false
  }
})
