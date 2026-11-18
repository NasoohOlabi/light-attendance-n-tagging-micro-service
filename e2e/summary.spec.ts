import { clickAccountAction } from './profileActions'
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
  const courseEmpty = '30000000-0000-4000-8000-000000000003'
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
    { id: courseEmpty, name: 'Empty Course', open: true },
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
    event(9, {
      kind: 'attendance',
      studentId,
      enrollmentId: enrollA,
      date: '2020-01-02',
      status: 'present',
    }),
    ...Array.from({ length: 6 }, (_, index) =>
      event(10 + index, {
        kind: 'attendance',
        studentId,
        enrollmentId: enrollB,
        date: `2021-01-0${index + 1}`,
        status: 'present',
      }),
    ),
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
  await expect(row.locator('td')).toHaveText(['2', '0', '0', '2'])
  await expect(page.getByRole('row', { name: /Former Student/ }).locator('td')).toHaveText([
    '0',
    '0',
    '1',
    '0',
  ])
  await expect(page.getByText('No explicit absences recorded.')).toBeVisible()
  await page.getByText('2026-11-01 \u00b7 Absent: 0, Excused: 1, Recorded: 1').click()
  await expect(page.getByText('Former Student', { exact: true }).first()).toBeVisible()
  await expect(page.getByLabel('Find a student')).toBeHidden()
  await expect(page.locator('label').filter({ hasText: 'All groups' })).toBeHidden()
  await expect(page.getByLabel('From', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('To', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.reload()
  await expect(row.locator('td')).toHaveText(['2', '0', '0', '2'])
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({
    path: `.artifacts/verification/summary-absences-${testInfo.project.name}-en.png`,
    fullPage: true,
  })
  await clickAccountAction(page, '\u0627\u0644\u0639\u0631\u0628\u064a\u0629')
  await expect(row.locator('td')).toHaveText(['2', '0', '0', '2'])
  await expect(
    page
      .getByText(
        '\u0627\u0644\u063a\u064a\u0627\u0628 \u062d\u0633\u0628 \u0627\u0644\u062c\u0644\u0633\u0629',
        { exact: true },
      )
      .first(),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: `.artifacts/verification/summary-absences-${testInfo.project.name}-ar.png`,
    fullPage: true,
  })
  await clickAccountAction(page, 'English')
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await page.getByRole('combobox', { name: 'Default course', exact: true }).selectOption(courseB)
  await page.getByRole('button', { name: 'Summary', exact: true }).click()
  await expect(row.locator('td')).toHaveText(['6', '1', '0', '2'])
  await expect(page.getByRole('row', { name: /Former Student/ })).toHaveCount(0)
  await expect(page.getByText('2020-01-01 \u00b7 Absent: 1, Excused: 0, Recorded: 1')).toBeVisible()
  await page.getByText('Show remaining dates').click()
  await expect(page.getByText('2021-01-01 \u00b7 Absent: 0, Excused: 0, Recorded: 1')).toBeVisible()
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Default course', exact: true })
    .selectOption(courseEmpty)
  await page.getByRole('button', { name: 'Summary', exact: true }).click()
  await expect(page.getByText('No attendance records yet.')).toBeVisible()
  await expect(page.getByRole('meter')).toHaveCount(0)
  await clickAccountAction(page, 'العربية')
  await expect(page.getByText('لا توجد سجلات حضور بعد.')).toBeVisible()
  await clickAccountAction(page, 'English')
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await page.getByRole('combobox', { name: 'Default course', exact: true }).selectOption('')
  await page.getByRole('button', { name: 'Summary', exact: true }).click()
  await expect(row.locator('td')).toHaveText(['1', '0', '0', '2'])
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await expect(page.getByLabel('Find a student')).toBeHidden()
  await expect(page.getByRole('combobox', { name: 'Group', exact: true })).toBeHidden()
  await expect(page.getByLabel('Session date')).toBeHidden()
  await expect(page.getByText('Choose an open course to take attendance.')).toBeVisible()
})
