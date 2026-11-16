import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

test.use({ trace: 'off' })

test('summary counts all dates for the selected course and ignores saved filters', async ({
  page,
}, testInfo) => {
  const teacherId = '10000000-0000-4000-8000-000000000001'
  const studentId = '20000000-0000-4000-8000-000000000001'
  const secondId = '20000000-0000-4000-8000-000000000002'
  const courseA = '30000000-0000-4000-8000-000000000001'
  const courseB = '30000000-0000-4000-8000-000000000002'
  const enrollA = '40000000-0000-4000-8000-000000000001'
  const enrollB = '40000000-0000-4000-8000-000000000002'
  const enrollInactive = '40000000-0000-4000-8000-000000000003'
  const now = new Date().toISOString()
  const teacher = {
    role: 'administrator',
    id: teacherId,
    name: 'Admin',
    canRead: true,
    canWrite: true,
    expiresAt: null,
  }
  const students = [
    { kind: 'student', studentId, name: 'Synthetic Student', group: 'A', active: true },
    { kind: 'student', studentId: secondId, name: 'Former Student', group: 'B', active: false },
  ]
  const courses = [
    { id: courseA, name: 'Course A', open: true },
    { id: courseB, name: 'Course B', open: true },
  ]
  const enrollments = [
    { id: enrollA, courseId: courseA, studentId, active: true },
    { id: enrollB, courseId: courseB, studentId, active: true },
    { id: enrollInactive, courseId: courseA, studentId: secondId, active: false },
  ].map((entry) => ({
    ...entry,
    level: '',
    practical: null,
    theory: null,
    handbookReceived: false,
  }))
  const event = (number: number, payload: object) => ({
    id: `50000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
    actor: 'Admin',
    clientTime: now,
    receivedAt: '',
    payload,
  })
  const events = [
    event(1, {
      kind: 'attendance',
      studentId,
      enrollmentId: enrollA,
      date: '2020-01-01',
      status: 'late',
    }),
    event(2, {
      kind: 'attendance',
      studentId,
      enrollmentId: enrollA,
      date: '2020-01-01',
      status: 'absent',
    }),
    event(3, {
      kind: 'reversal',
      targetId: '50000000-0000-4000-8000-000000000002',
      reason: 'Correction',
    }),
    event(4, {
      kind: 'attendance',
      studentId: secondId,
      enrollmentId: enrollInactive,
      date: '2026-11-01',
      status: 'excused',
    }),
    event(5, {
      kind: 'attendance',
      studentId,
      enrollmentId: enrollB,
      date: '2020-01-01',
      status: 'absent',
    }),
    event(6, { kind: 'attendance', studentId, date: '2019-01-01', status: 'present' }),
    event(7, { kind: 'note', studentId, date: '2020-01-01', tags: ['old'], text: 'Old note' }),
    event(8, { kind: 'note', studentId, date: '2026-11-01', tags: ['new'], text: 'New note' }),
  ]
  await page.route('**/api/auth/**', (route) =>
    route.fulfill({
      json: {
        user: {
          id: teacherId,
          name: 'Admin',
          email: 'admin@example.test',
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
        session: {
          id: 'session',
          userId: teacherId,
          token: 'synthetic',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          createdAt: now,
          updatedAt: now,
        },
      },
    }),
  )
  await page.route('**/api/**', (route) => {
    if (new URL(route.request().url()).pathname.startsWith('/api/auth/')) return route.fallback()
    if (new URL(route.request().url()).pathname === '/api/me')
      return route.fulfill({ json: { account: teacher } })
    return route.fulfill({ json: { teacher, students, courses, enrollments, events } })
  })
  await page.goto(
    `/?page=app&view=notebook&tab=summary&course=${courseA}&from=2026-12-01&to=2020-01-01&date=2026-11-01&q=missing&group=missing&student=${secondId}&all=0`,
  )
  const row = page.getByRole('row', { name: /Synthetic Student/ })
  await expect(row).toContainText('Synthetic Student')
  await expect(row.locator('td')).toHaveText(['1', '0', '0', '2'])
  await expect(page.getByRole('row', { name: /Former Student/ }).locator('td')).toHaveText([
    '0',
    '0',
    '1',
    '0',
  ])
  await expect(page.getByLabel('present: 1')).toBeVisible()
  await expect(page.getByLabel('excused: 1')).toBeVisible()
  await expect(page.getByLabel('Find a student')).toBeHidden()
  await expect(page.locator('label').filter({ hasText: 'All groups' })).toBeHidden()
  await expect(page.getByLabel('From', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('To', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.reload()
  await expect(row.locator('td')).toHaveText(['1', '0', '0', '2'])
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({
    path: `.artifacts/verification/summary-${testInfo.project.name}-en.png`,
    fullPage: true,
  })
  await page.getByRole('button', { name: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629' }).click()
  await expect(row.locator('td')).toHaveText(['1', '0', '0', '2'])
  await page.screenshot({
    path: `.artifacts/verification/summary-${testInfo.project.name}-ar.png`,
    fullPage: true,
  })
  await page.getByRole('button', { name: 'English' }).click()
  await page.getByRole('combobox', { name: 'Course', exact: true }).selectOption(courseB)
  await expect(row.locator('td')).toHaveText(['0', '1', '0', '2'])
  await expect(page.getByRole('row', { name: /Former Student/ })).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Course', exact: true }).selectOption('')
  await expect(row.locator('td')).toHaveText(['1', '0', '0', '2'])
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await expect(page.getByLabel('Find a student')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Group', exact: true })).toBeVisible()
  await expect(page.getByLabel('Session date')).toBeVisible()
})
