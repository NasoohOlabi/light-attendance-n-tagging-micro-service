import { expect, test, type Page } from '@playwright/test'
import { clickAccountAction } from './profileActions'

test.use({ trace: 'off' })
const userId = '10000000-0000-4000-8000-000000000001'
const courseId = '30000000-0000-4000-8000-000000000001'
const students = [
  {
    kind: 'student',
    studentId: '20000000-0000-4000-8000-000000000001',
    name: 'Ada Test',
    firstName: 'Ada',
    lastName: 'Test',
    group: '',
    active: true,
  },
  {
    kind: 'student',
    studentId: '20000000-0000-4000-8000-000000000002',
    name: 'Bela Test',
    firstName: 'Bela',
    lastName: 'Test',
    group: '',
    active: true,
  },
]
const courses = [{ id: courseId, name: 'Synthetic Course', open: true }]
const enrollments = [
  {
    id: '40000000-0000-4000-8000-000000000001',
    courseId,
    studentId: students[0].studentId,
    level: '',
    theory: 0,
    practical: 0,
    active: true,
  },
  {
    id: '40000000-0000-4000-8000-000000000002',
    courseId,
    studentId: students[1].studentId,
    level: '',
    theory: null,
    practical: 0,
    active: true,
    gradeDecisions: [
      {
        requestId: '60000000-0000-4000-8000-000000000001',
        result: 'pass',
        note: 'Reviewed',
        actor: userId,
        at: '2026-01-01T00:00:00.000Z',
      },
    ],
  },
]
const events = [
  {
    id: '50000000-0000-4000-8000-000000000001',
    actor: 'Test',
    clientTime: '2026-01-01T00:00:00.000Z',
    receivedAt: '',
    payload: {
      kind: 'attendance',
      studentId: students[0].studentId,
      enrollmentId: enrollments[0].id,
      date: '2026-01-01',
      status: 'present',
    },
  },
]

async function mockNotebook(page: Page, role: 'administrator' | 'teacher', attendance = events) {
  const teacher = { role, id: userId, name: 'Test', canRead: true, canWrite: true, expiresAt: null }
  await page.route('**/api/auth/**', (route) =>
    route.fulfill({
      json: {
        user: { id: userId, name: 'Test', email: 'test@example.test' },
        session: {
          id: 'synthetic',
          userId,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
      },
    }),
  )
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.startsWith('/api/auth/')) return route.fallback()
    return route.fulfill({
      json:
        path === '/api/me'
          ? { account: teacher }
          : path === '/api/admin'
            ? { accounts: [], teachers: [], students }
            : { teacher, students, courses, enrollments, events: attendance },
    })
  })
  await page.goto(`/?page=app&tab=dashboard&course=${courseId}`)
}

test('administrator sees saved gaps and opens the selected course grades', async ({ page }) => {
  await mockNotebook(page, 'administrator')
  const panel = page.getByRole('region', { name: 'Course result readiness' })
  await expect(panel).toBeVisible()
  const missing = panel
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Missing evidence' }) })
  const practice = panel
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Needs practice' }) })
  await expect(missing.getByRole('meter', { name: 'Missing theory score: 1 / 2' })).toBeVisible()
  await expect(missing.getByRole('meter', { name: 'Missing practical score: 0 / 2' })).toBeVisible()
  await expect(missing.getByRole('meter', { name: 'No attendance recorded: 1 / 2' })).toBeVisible()
  await missing.getByText('Show students').first().click()
  await expect(missing.locator('details').first().getByText('Bela Test')).toBeVisible()
  await expect(practice.getByRole('meter', { name: 'Theory below minimum: 1 / 2' })).toBeVisible()
  await practice.getByText('Show students').first().click()
  await expect(practice.locator('details').first()).toContainText('Ada Test — 0')
  await clickAccountAction(page, 'العربية')
  await expect(page.getByRole('region', { name: 'الاستعداد لنتائج الدورة' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  await clickAccountAction(page, 'English')
  await panel.getByRole('button', { name: 'Open grades' }).click()
  await expect(page.getByRole('heading', { name: 'Synthetic Course — Grades' })).toBeVisible()
})

test('teacher does not receive the administrator readiness panel', async ({ page }) => {
  const marks = [
    ['absent', 'present', 'absent', 'absent', 'present', 'absent', 'absent'],
    ['present', 'absent', 'excused', '', 'absent', '', 'present'],
  ].flatMap((statuses, studentIndex) =>
    statuses.flatMap((status, index) =>
      status
        ? [
            {
              ...events[0],
              id: `50000000-0000-4000-8000-${String(studentIndex * 10 + index + 1).padStart(12, '0')}`,
              payload: {
                ...events[0].payload,
                studentId: students[studentIndex].studentId,
                enrollmentId: enrollments[studentIndex].id,
                status,
                date: `2026-01-0${index + 1}`,
              },
            },
          ]
        : [],
    ),
  )
  await mockNotebook(page, 'teacher', marks)
  await page.getByLabel('Session date').fill('2026-01-07')
  const outreach = page.locator('.dashboard-followups > li')
  await expect(outreach).toHaveCount(2)
  await expect(outreach.first()).toContainText('Ada Test')
  await expect(outreach.first()).toContainText('4 absences')
  await expect(outreach.last()).toContainText('2 absences')
  const days = outreach.last().locator('time')
  await expect(days).toHaveCount(6)
  await expect(days.first()).toHaveAttribute('datetime', '2026-01-02')
  await expect(outreach.last().getByText('Unmarked', { exact: true })).toHaveCount(2)
  await expect(outreach.last().getByText('excused', { exact: true })).toHaveCount(1)
  await expect(page.getByRole('region', { name: 'Course result readiness' })).toHaveCount(0)
  await page.setViewportSize({ width: 320, height: 844 })
  await clickAccountAction(page, 'العربية')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: `.artifacts/verification/outreach-${test.info().project.name}-ar.png`,
    fullPage: true,
  })
})
