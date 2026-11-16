import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { courseSchema } from '../shared/neon'

test.use({ trace: 'off' })
const teacherId = '10000000-0000-4000-8000-000000000001'
const studentId = '20000000-0000-4000-8000-000000000001'
const secondStudentId = '20000000-0000-4000-8000-000000000002'
const courseA = '30000000-0000-4000-8000-000000000001'
const courseB = '30000000-0000-4000-8000-000000000002'
const enrollA = '40000000-0000-4000-8000-000000000001'
const enrollB = '40000000-0000-4000-8000-000000000002'

test('course enrollment and same-day attendance stay separate', async ({ page }, testInfo) => {
  const teacher = {
    role: 'administrator',
    id: teacherId,
    name: 'Admin',
    canRead: true,
    canWrite: true,
    expiresAt: null,
  }
  const students = [
    { kind: 'student', studentId, name: 'Synthetic Student', group: 'Roster level', active: true },
    { kind: 'student', studentId: secondStudentId, name: 'New Student', group: 'A', active: true },
  ]
  const courses = [
    { id: courseA, name: 'Course A' },
    { id: courseB, name: 'Course B' },
  ]
  const enrollments = [
    { id: enrollA, courseId: courseA, studentId, level: '', practical: null, theory: null },
    { id: enrollB, courseId: courseB, studentId, level: 'Advanced', practical: null, theory: null },
  ]
  const events: unknown[] = []
  const attemptedCourseIds: string[] = []
  let dropCourseResponse = true
  await page.route('**/api/auth/**', async (route) => {
    const now = new Date().toISOString()
    await route.fulfill({
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
    })
  })
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.startsWith('/api/auth/')) return route.fallback()
    if (path === '/api/me') return route.fulfill({ json: { account: teacher } })
    if (path === '/api/admin/courses') {
      const course = courseSchema.parse(route.request().postDataJSON())
      attemptedCourseIds.push(course.id)
      const index = courses.findIndex((entry) => entry.id === course.id)
      if (index >= 0) courses[index] = course
      else courses.push(course)
      if (dropCourseResponse) {
        dropCourseResponse = false
        return route.abort('failed')
      }
      return route.fulfill({ json: { saved: true } })
    }
    if (path === '/api/admin/enrollments') {
      const body = route.request().postDataJSON()
      const index = enrollments.findIndex((entry) => entry.id === body.id)
      if (index >= 0) enrollments[index] = body
      else enrollments.push(body)
      return route.fulfill({ json: { saved: true } })
    }
    if (path === '/api/events') events.push(...route.request().postDataJSON().events)
    return route.fulfill({ json: { teacher, students, courses, enrollments, events } })
  })
  await page.goto('/?page=app')
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  const list = page.getByRole('region', { name: 'Student list' })
  const row = list
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'Synthetic Student', exact: true }) })
  await expect(list.getByRole('columnheader')).toHaveText(['Student', 'Level', 'Active', 'Actions'])
  await expect(row.getByRole('cell')).toHaveText([
    'Synthetic Student',
    'Roster level',
    'Active',
    '',
  ])
  const courseFilter = page.getByRole('combobox', { name: 'Course', exact: true })
  await courseFilter.selectOption(courseA)
  await expect(row.getByRole('cell')).toHaveText(['Synthetic Student', '—', 'Active', ''])
  await courseFilter.selectOption(courseB)
  await expect(row.getByRole('cell')).toHaveText(['Synthetic Student', 'Advanced', 'Active', ''])
  await page.reload()
  await expect(row.getByRole('cell')).toHaveText(['Synthetic Student', 'Advanced', 'Active', ''])
  await mkdir('.artifacts/verification', { recursive: true })
  if (testInfo.project.name === 'mobile') {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 })
      await expect(list).toHaveAttribute('tabindex', '0')
      expect(await list.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
      await list.focus()
      await page.keyboard.press('ArrowRight')
      await expect.poll(() => list.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      await page.screenshot({
        path: `.artifacts/verification/student-levels-${width}-en.png`,
        fullPage: true,
      })
    }
  }
  await page.screenshot({
    path: `.artifacts/verification/student-levels-${testInfo.project.name}-en.png`,
    fullPage: true,
  })
  await row.getByRole('button', { name: 'Open student' }).click()
  await expect(page.getByLabel('Attendance for Synthetic Student')).toBeVisible()
  await page.getByRole('button', { name: 'All my students' }).click()
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await page.getByRole('button', { name: 'العربية', exact: true }).click()
  const arabicList = page.getByRole('region', { name: 'قائمة الطلاب' })
  await expect(arabicList.getByRole('columnheader')).toHaveText([
    'الطالب',
    'المستوى',
    'الحالة',
    'الإجراءات',
  ])
  if (testInfo.project.name === 'mobile') {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 })
      await expect(arabicList).toHaveAttribute('tabindex', '0')
      expect(
        await arabicList.evaluate((element) => element.scrollWidth > element.clientWidth),
      ).toBe(true)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      await page.screenshot({
        path: `.artifacts/verification/student-levels-${width}-ar.png`,
        fullPage: true,
      })
    }
  }
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await page.getByRole('button', { name: 'Courses', exact: true }).click()
  await page.getByLabel('Course name').fill('Created course')
  await page.getByRole('button', { name: 'Save course' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Save course' }).click()
  await expect(page.getByRole('status')).toContainText('Saved')
  expect(attemptedCourseIds).toHaveLength(2)
  expect(attemptedCourseIds[0]).toBe(attemptedCourseIds[1])
  expect(courses).toHaveLength(3)
  await expect(page.getByRole('button', { name: 'Courses', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(page.getByRole('combobox', { name: 'Course', exact: true })).toHaveValue(
    courses[2].id,
  )
  await page.getByRole('combobox', { name: 'Student', exact: true }).selectOption(secondStudentId)
  await page.getByLabel('Level', { exact: true }).fill('Beginner')
  await page.getByRole('button', { name: 'Save enrollment' }).click()
  await expect.poll(() => enrollments.length).toBe(3)
  await expect(page.locator('tr').filter({ hasText: 'New Student' })).toContainText('Beginner')
  await page.reload()
  await page.getByRole('button', { name: 'Courses', exact: true }).click()
  await page.getByRole('combobox', { name: 'Course', exact: true }).selectOption(courses[2].id)
  await expect(page.locator('tr').filter({ hasText: 'New Student' })).toContainText('Beginner')
  await page.getByRole('combobox', { name: 'Course', exact: true }).selectOption(courseA)
  await page.getByRole('combobox', { name: 'Student', exact: true }).selectOption(studentId)
  await page.getByLabel('Level', { exact: true }).fill('Intermediate')
  await page.getByLabel('Practical', { exact: true }).fill('0')
  await page.getByLabel('Theory', { exact: true }).fill('100')
  await page.getByRole('button', { name: 'Save enrollment' }).click()
  await expect.poll(() => enrollments[0].level).toBe('Intermediate')
  expect(enrollments[0]).toMatchObject({ practical: 0, theory: 100 })
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await courseFilter.selectOption(courseA)
  await expect(row.getByRole('cell')).toHaveText([
    'Synthetic Student',
    'Intermediate',
    'Active',
    '',
  ])
  await courseFilter.selectOption(courseB)
  await expect(row.getByRole('cell')).toHaveText(['Synthetic Student', 'Advanced', 'Active', ''])
  await courseFilter.selectOption(courseA)
  await page.reload()
  await expect(row.getByRole('cell')).toHaveText([
    'Synthetic Student',
    'Intermediate',
    'Active',
    '',
  ])
  await page.getByRole('button', { name: 'Courses', exact: true }).click()
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({
    path: `.artifacts/verification/courses-${testInfo.project.name}-en.png`,
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await page.getByRole('combobox', { name: 'Course', exact: true }).selectOption(courseA)
  const date = await page.getByLabel('Session date').inputValue()
  events.push({
    id: '50000000-0000-4000-8000-000000000001',
    actor: 'Admin',
    clientTime: new Date().toISOString(),
    receivedAt: '',
    payload: { kind: 'attendance', studentId, enrollmentId: enrollA, date, status: 'late' },
  })
  await page.reload()
  await expect(page.getByLabel('Attendance for Synthetic Student')).toHaveValue('present')
  await page.getByRole('button', { name: 'History & corrections', exact: true }).click()
  const legacyRecord = page.locator('li').filter({ hasText: 'Synthetic Student' })
  await expect(legacyRecord).toContainText('present')
  await legacyRecord.getByText('Record details').click()
  await expect(legacyRecord.locator('pre')).toContainText('"status": "late"')
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await page.getByRole('combobox', { name: 'Course', exact: true }).selectOption(courseB)
  await page.getByLabel('Attendance for Synthetic Student').selectOption('absent')
  await page.getByRole('button', { name: 'Save attendance (1)' }).click()
  await expect.poll(() => events.length).toBe(2)
  await page.getByRole('combobox', { name: 'Course', exact: true }).selectOption(courseA)
  await expect(page.getByLabel('Attendance for Synthetic Student')).toHaveValue('present')
  await page.getByRole('button', { name: 'العربية', exact: true }).click()
  await page.getByRole('button', { name: 'الدورات', exact: true }).click()
  await page.getByRole('combobox', { name: 'الدورة', exact: true }).selectOption(courseA)
  await expect(page.getByLabel('عملي', { exact: true })).toBeVisible()
  await expect(page.getByLabel('نظري', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  if (testInfo.project.name === 'mobile') {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 })
      const navigation = page.locator('.workspace-rail nav')
      const buttons = await navigation.locator('button').evaluateAll((elements) =>
        elements.map((element) => {
          const bounds = element.getBoundingClientRect()
          return { top: bounds.top, width: bounds.width }
        }),
      )
      expect(new Set(buttons.map((button) => button.top)).size).toBe(1)
      expect(buttons.every((button) => button.width >= 44)).toBe(true)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
    }
  }
  await page.screenshot({
    path: `.artifacts/verification/courses-${testInfo.project.name}-ar.png`,
    fullPage: true,
  })
})
