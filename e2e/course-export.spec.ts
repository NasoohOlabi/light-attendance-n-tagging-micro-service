import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { unzipSync, strFromU8 } from 'fflate'

test.use({ trace: 'off' })
const admin = '10000000-0000-4000-8000-000000000001'
const student = '20000000-0000-4000-8000-000000000001'
const course = '30000000-0000-4000-8000-000000000001'
const enrollment = '40000000-0000-4000-8000-000000000001'

for (const width of [320, 390, 1280]) {
  for (const ar of [false, true]) {
    test(`downloads saved course workbook at ${width}px ${ar ? 'Arabic' : 'English'}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 })
      const teacher = {
        role: 'administrator',
        id: admin,
        name: 'Admin',
        canRead: true,
        canWrite: true,
        expiresAt: null,
      }
      const students = [
        {
          kind: 'student',
          studentId: student,
          name: 'Synthetic Student',
          firstName: 'Synthetic',
          lastName: 'Student',
          group: 'A',
          active: false,
          teacherId: admin,
        },
        {
          kind: 'student',
          studentId: '20000000-0000-4000-8000-000000000002',
          name: 'Active Student',
          firstName: 'Active',
          lastName: 'Student',
          group: 'A',
          active: true,
          teacherId: admin,
        },
      ]
      const courses = [{ id: course, name: 'Course A', open: true }]
      const enrollments = [
        {
          id: enrollment,
          courseId: course,
          studentId: student,
          level: '',
          practical: 0,
          theory: null,
          active: false,
          handbookReceived: false,
          notes: 'private note',
        },
        {
          id: '40000000-0000-4000-8000-000000000002',
          courseId: course,
          studentId: '20000000-0000-4000-8000-000000000002',
          level: 'A',
          practical: null,
          theory: null,
          active: true,
          handbookReceived: false,
          notes: '',
        },
      ]
      const event = (id: string, payload: object) => ({
        id,
        actor: 'Admin',
        clientTime: '2026-01-01T00:00:00.000Z',
        receivedAt: '',
        payload,
      })
      const events = [
        event('50000000-0000-4000-8000-000000000001', {
          kind: 'attendance',
          studentId: student,
          enrollmentId: enrollment,
          date: '2026-01-01',
          status: 'absent',
        }),
        event('50000000-0000-4000-8000-000000000002', {
          kind: 'reversal',
          targetId: '50000000-0000-4000-8000-000000000001',
          reason: 'Correction',
        }),
        event('50000000-0000-4000-8000-000000000003', {
          kind: 'attendance',
          studentId: student,
          enrollmentId: enrollment,
          date: '2026-01-01',
          status: 'present',
        }),
      ]
      await page.route('**/api/auth/**', (route) =>
        route.fulfill({
          json: {
            user: {
              id: admin,
              name: 'Admin',
              email: 'admin@example.test',
              emailVerified: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            session: {
              id: 'session',
              userId: admin,
              token: 'synthetic',
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        }),
      )
      await page.route('**/api/**', (route) => {
        const path = new URL(route.request().url()).pathname
        if (path.startsWith('/api/auth/')) return route.fallback()
        if (path === '/api/me') return route.fulfill({ json: { account: teacher } })
        if (path === '/api/admin')
          return route.fulfill({ json: { accounts: [], teachers: [], students } })
        return route.fulfill({ json: { teacher, students, courses, enrollments, events } })
      })
      if (ar) await page.addInitScript(() => localStorage.setItem('halaqa-language', 'ar'))
      await page.goto('/?page=app')
      await page.getByRole('button', { name: ar ? 'الدورات' : 'Courses', exact: true }).click()
      await page.getByRole('button', { name: ar ? 'الدرجات' : 'Grades', exact: true }).click()
      const button = page.getByRole('button', { name: ar ? 'تصدير Excel' : 'Export Excel' })
      await expect(button).toBeVisible()
      const grade = page.getByLabel(ar ? 'نظري: Active Student' : 'Theory: Active Student')
      await grade.fill('20')
      await expect(button).toBeDisabled()
      await grade.fill('')
      await expect(button).toBeEnabled()
      const threshold = page.getByLabel(ar ? 'الحد الأدنى للحضور %' : 'Minimum attendance %')
      await threshold.fill('50')
      await expect(button).toBeDisabled()
      await threshold.fill('70')
      await expect(button).toBeEnabled()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      const downloadPromise = page.waitForEvent('download')
      await button.click()
      const download = await downloadPromise
      await mkdir('.artifacts/verification', { recursive: true })
      if ((width === 320 && ar) || (width === 1280 && !ar))
        await page.screenshot({
          path: `.artifacts/verification/course-export-${testInfo.project.name}-${width}-${ar ? 'ar' : 'en'}.png`,
          fullPage: true,
        })
      const path = `.artifacts/verification/course-export-${testInfo.project.name}-${width}-${ar ? 'ar' : 'en'}.xlsx`
      await download.saveAs(path)
      const xml = Object.values(
        unzipSync(new Uint8Array(await (await import('node:fs/promises')).readFile(path))),
      )
        .map((bytes) => strFromU8(bytes))
        .join('\n')
      expect(xml).toContain('Synthetic')
      expect(xml).toContain('100')
      expect(xml).not.toContain('private note')
    })
  }
}
