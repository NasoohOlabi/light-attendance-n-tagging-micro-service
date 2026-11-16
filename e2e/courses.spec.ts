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
    { id: courseA, name: 'Course A', open: true },
    { id: courseB, name: 'Course B', open: true },
  ]
  const enrollments = [
    {
      id: enrollA,
      courseId: courseA,
      studentId,
      level: '',
      practical: null,
      theory: null,
      active: true,
      handbookReceived: false,
    },
    {
      id: enrollB,
      courseId: courseB,
      studentId,
      level: 'Advanced',
      practical: null,
      theory: null,
      active: true,
      handbookReceived: false,
    },
  ]
  const board = {
    accounts: [
      {
        authUserId: teacherId,
        email: 'admin@example.test',
        name: 'Admin',
        role: 'teacher',
        active: true,
        expiresAt: null,
        teacherId,
        studentId: null,
      },
    ],
    teachers: [{ teacherId, name: 'Admin', active: true }],
    students: students.map((student) => ({
      ...student,
      firstName: student.name.split(' ')[0],
      lastName: student.name.split(' ')[1],
      teacherId,
    })),
  }
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
    if (path === '/api/admin/courses/status') {
      const body = route.request().postDataJSON()
      const course = courses.find((item) => item.id === body.id)
      if (course) course.open = body.open
      return route.fulfill({ json: { saved: true } })
    }
    if (path === '/api/admin/courses') {
      const course = courseSchema.parse(route.request().postDataJSON())
      attemptedCourseIds.push(course.id)
      const index = courses.findIndex((entry) => entry.id === course.id)
      if (index >= 0) courses[index] = { ...course, open: courses[index].open }
      else courses.push(course)
      if (dropCourseResponse) {
        dropCourseResponse = false
        return route.abort('failed')
      }
      return route.fulfill({ json: { saved: true } })
    }
    if (path === '/api/admin') return route.fulfill({ json: board })
    if (path === '/api/admin/enrollments/membership') {
      const body = route.request().postDataJSON()
      const index = enrollments.findIndex((entry) => entry.id === body.id)
      if (index >= 0) enrollments[index] = { ...enrollments[index], ...body }
      else enrollments.push({ ...body, practical: null, theory: null, handbookReceived: false })
      return route.fulfill({ json: { saved: true } })
    }
    if (path === '/api/admin/enrollments/handbook') {
      const body = route.request().postDataJSON()
      const entry = enrollments.find((item) => item.id === body.id)
      if (entry) entry.handbookReceived = body.handbookReceived
      return route.fulfill({ json: { saved: true } })
    }
    if (path === '/api/admin/enrollments/grades') {
      const body = route.request().postDataJSON()
      const index = enrollments.findIndex((entry) => entry.id === body.id)
      enrollments[index] = { ...enrollments[index], ...body }
      return route.fulfill({ json: { saved: true } })
    }
    if (path === '/api/admin/students/enroll') {
      const body = route.request().postDataJSON()
      const student = {
        ...body.student,
        name: `${body.student.firstName} ${body.student.lastName}`,
        kind: 'student',
      }
      students.push(student)
      board.students.push(student)
      enrollments.push({
        ...body.enrollment,
        studentId: student.studentId,
        active: true,
        practical: null,
        theory: null,
        handbookReceived: false,
      })
      return route.fulfill({ json: board })
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
  const attendanceRow = page
    .getByRole('region', { name: 'Attendance list' })
    .getByRole('row')
    .filter({ hasText: 'Synthetic Student' })
  await expect(attendanceRow.getByRole('cell').nth(1)).toHaveText('Advanced')
  await expect(attendanceRow.getByRole('cell').first()).toHaveText('Synthetic Student')
  await page.getByRole('button', { name: 'All my students' }).click()
  await courseFilter.selectOption(courseA)
  await expect(attendanceRow.getByRole('cell').nth(1)).toHaveText('—')
  await page.getByLabel('Find a student').fill('Synthetic')
  await expect(attendanceRow.getByRole('cell').nth(1)).toHaveText('—')
  await expect(attendanceRow.getByRole('cell').first()).toHaveText('Synthetic Student')
  await page.getByLabel('Find a student').fill('')
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
  await expect(page.getByRole('row').filter({ hasText: 'Course A' })).toBeVisible()
  if (testInfo.project.name === 'mobile') {
    for (const language of ['en', 'ar']) {
      if (language === 'ar') {
        await page
          .getByRole('button', { name: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629', exact: true })
          .click()
      }
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 })
        const actions = page
          .getByRole('region', {
            name:
              language === 'en'
                ? 'Course list'
                : '\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u062f\u0648\u0631\u0627\u062a',
          })
          .locator('tbody tr button')
        await expect(actions).toHaveCount(10)
        const bounds = await actions.evaluateAll((buttons) =>
          buttons.map((button) => {
            const rect = button.getBoundingClientRect()
            return { left: rect.left, right: rect.right, height: rect.height }
          }),
        )
        expect(bounds.every((rect) => rect.left >= 0 && rect.right <= width)).toBe(true)
        expect(bounds.every((rect) => rect.height <= 80)).toBe(true)
        await page.screenshot({
          path: `.artifacts/verification/course-list-${width}-${language}.png`,
          fullPage: true,
        })
      }
    }
    await page.getByRole('button', { name: 'English', exact: true }).click()
  }
  await page.getByRole('button', { name: 'Create course' }).click()
  await expect(page.getByRole('region', { name: 'Course list' })).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create course')
  await expect(
    page.getByLabel('Course name').locator('xpath=ancestor::section[1]').getByRole('heading'),
  ).toHaveCount(1)
  await page.getByLabel('Course name').fill('Created course')
  await page.getByRole('button', { name: 'Save course' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Save course' }).click()
  await expect.poll(() => courses.length).toBe(3)
  await expect.poll(() => attemptedCourseIds.length).toBe(2)
  expect(attemptedCourseIds[0]).toBe(attemptedCourseIds[1])
  await expect(page.getByRole('row').filter({ hasText: 'Created course' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: 'Created course' })).toBeVisible()
  await page.getByRole('button', { name: 'Create course' }).click()
  await page.getByLabel('Course name').fill('Another course')
  await page.getByRole('button', { name: 'Save course' }).click()
  await expect.poll(() => courses.length).toBe(4)
  expect(courses[2].id).not.toBe(courses[3].id)
  await expect(page.getByRole('row').filter({ hasText: 'Created course' })).toBeVisible()
  await page
    .getByRole('row')
    .filter({ hasText: 'Created course' })
    .getByRole('button', { name: 'Manage students' })
    .click()
  await page.getByRole('searchbox', { name: 'Find a student' }).fill('New')
  const newRow = page.getByRole('row').filter({ hasText: 'New' })
  await newRow.getByLabel('Course level: New Student').fill('Beginner')
  await page.getByRole('searchbox', { name: 'Find a student' }).fill('Synthetic')
  await page.getByRole('searchbox', { name: 'Find a student' }).fill('New')
  await expect(newRow.getByLabel('Course level: New Student')).toHaveValue('Beginner')
  await newRow.getByRole('switch').click()
  await expect.poll(() => enrollments.length).toBe(3)
  await page.reload()
  await expect(newRow.getByLabel('Course level: New Student')).toHaveValue('Beginner')
  await newRow.getByRole('switch').click()
  await expect.poll(() => enrollments[2].active).toBe(false)
  await newRow.getByRole('switch').click()
  await expect.poll(() => enrollments[2].active).toBe(true)
  if (testInfo.project.name === 'mobile') {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 })
      const table = page.getByRole('region', { name: 'Course students' })
      expect(await table.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
        true,
      )
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      const box = await newRow.getByRole('switch').boundingBox()
      expect(box?.width).toBeGreaterThanOrEqual(44)
      expect(box?.height).toBeGreaterThanOrEqual(44)
      await page.screenshot({
        path: `.artifacts/verification/course-students-${width}-en.png`,
        fullPage: true,
      })
    }
    await page
      .getByRole('button', { name: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629', exact: true })
      .click()
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 })
      const table = page.getByRole('region', {
        name: '\u0637\u0644\u0627\u0628 \u0627\u0644\u062f\u0648\u0631\u0629',
      })
      await expect(table.getByRole('columnheader')).toHaveCount(7)
      expect(await table.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
        true,
      )
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      await page.screenshot({
        path: `.artifacts/verification/course-students-${width}-ar.png`,
        fullPage: true,
      })
    }
    await page.getByRole('button', { name: 'English', exact: true }).click()
  }
  await page.getByRole('button', { name: 'Add new student to this course' }).click()
  await page.reload()
  await expect(page.getByText('Created course')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save role' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: /Manage students/ })).toBeVisible()
  await page.getByRole('button', { name: 'Add new student to this course' }).click()
  await page.getByLabel('First name').fill('Quick')
  await page.getByLabel('Last name').fill('Student')
  await page.getByLabel('Level', { exact: true }).fill('Roster')
  await page.getByLabel('Course level').fill('Course level')
  await page.getByLabel('WhatsApp number').fill('+963 123')
  await page.getByLabel('Location').fill('Area')
  await page.getByLabel('Birth year').fill('2000')
  await page.getByLabel('Teacher').selectOption(teacherId)
  await page.getByRole('button', { name: 'Save student' }).click()
  await expect(page.getByRole('heading', { name: /Manage students/ })).toBeVisible()
  await expect.poll(() => enrollments.length).toBe(4)
  expect(board.students.find((student) => student.firstName === 'Quick')).toMatchObject({
    whatsapp: '+963 123',
    location: 'Area',
    birthYear: 2000,
  })
  await page.getByRole('button', { name: 'Back to courses' }).click()
  await page
    .getByRole('row')
    .filter({ hasText: 'Course A' })
    .getByRole('button', { name: 'Manage students' })
    .click()
  await expect(page.getByLabel('Handbook received: Synthetic Student')).not.toBeChecked()
  await page.getByLabel('Handbook received: Synthetic Student').click()
  await expect(page.getByLabel('Handbook received: Synthetic Student')).toBeChecked()
  await page.reload()
  await expect(page.getByLabel('Handbook received: Synthetic Student')).toBeChecked()
  const handbookBounds = await page.getByLabel('Handbook received: Synthetic Student').boundingBox()
  expect(handbookBounds?.width).toBeGreaterThanOrEqual(44)
  expect(handbookBounds?.height).toBeGreaterThanOrEqual(44)
  await page.getByLabel('Handbook received: Synthetic Student').scrollIntoViewIfNeeded()
  await page.screenshot({
    path: `.artifacts/verification/handbook-${testInfo.project.name}.png`,
    fullPage: true,
  })
  await expect(page.getByLabel('Course level: Synthetic Student')).toHaveValue('')
  await page.getByLabel('Course level: Synthetic Student').fill('Draft A')
  await page.getByRole('button', { name: 'Back to courses' }).click()
  await page
    .getByRole('row')
    .filter({ hasText: 'Course B' })
    .getByRole('button', { name: 'Manage students' })
    .click()
  await expect(page.getByLabel('Handbook received: Synthetic Student')).not.toBeChecked()
  await expect(page.getByLabel('Course level: Synthetic Student')).toHaveValue('Advanced')
  await page.getByLabel('Course level: Synthetic Student').fill('Updated B')
  await page
    .getByRole('row')
    .filter({ hasText: 'Synthetic' })
    .getByRole('button', { name: 'Save level' })
    .click()
  await expect.poll(() => enrollments[1].level).toBe('Updated B')
  expect(enrollments[1].id).toBe(enrollB)
  await page.getByRole('button', { name: 'Back to courses' }).click()
  await page
    .getByRole('row')
    .filter({ hasText: 'Course A' })
    .getByRole('button', { name: 'Manage students' })
    .click()
  await expect(page.getByLabel('Course level: Synthetic Student')).toHaveValue('Draft A')
  await page.getByLabel('Course level: Synthetic Student').fill('Intermediate')
  await page
    .getByRole('row')
    .filter({ hasText: 'Synthetic' })
    .getByRole('button', { name: 'Save level' })
    .click()
  await expect.poll(() => enrollments[0].level).toBe('Intermediate')
  await page.getByRole('button', { name: 'Back to courses' }).click()
  await page
    .getByRole('row')
    .filter({ hasText: 'Course A' })
    .getByRole('button', { name: 'Grades' })
    .click()
  await page.getByLabel('Practical: Synthetic Student').fill('0')
  await page.getByLabel('Theory: Synthetic Student').fill('100')
  await page
    .getByRole('row')
    .filter({ hasText: 'Synthetic' })
    .getByRole('button', { name: 'Save grades' })
    .click()
  await expect.poll(() => enrollments[0].theory).toBe(100)
  expect(enrollments[0]).toMatchObject({
    level: 'Intermediate',
    active: true,
    practical: 0,
    theory: 100,
  })
  await page.reload()
  await expect(page.getByLabel('Practical: Synthetic Student')).toHaveValue('0')
  await page.goBack()
  await page.goForward()
  await expect(page.getByLabel('Theory: Synthetic Student')).toHaveValue('100')
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
  await page.getByRole('button', { name: 'Courses', exact: true }).click()
  const courseRow = page.getByRole('row').filter({ hasText: 'Course A' })
  await courseRow.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(courseRow).toContainText('Closed')
  await page.getByRole('button', { name: 'العربية', exact: true }).click()
  await expect(courseRow).toContainText('مغلقة')
  await expect(courseRow.getByRole('button', { name: 'إعادة فتح' })).toBeVisible()
  await page.screenshot({
    path: `.artifacts/verification/closed-course-${testInfo.project.name}-ar.png`,
    fullPage: true,
  })
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await page.reload()
  await expect(courseRow).toContainText('Closed')
  await courseRow.getByRole('button', { name: 'History', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'This course is closed' })).toBeVisible()
  await expect(
    page
      .getByRole('combobox', { name: 'Course', exact: true })
      .locator(`option[value="${courseA}"]`),
  ).toHaveCount(0)
  await expect(page.locator('li').filter({ hasText: 'Synthetic Student' })).toContainText('present')
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await expect(page.getByLabel('Attendance for Synthetic Student')).toHaveCount(0)
  await page.getByRole('button', { name: 'Courses', exact: true }).click()
  await courseRow.getByRole('button', { name: 'Reopen', exact: true }).click()
  await expect(courseRow).toContainText('Open')
  await courseRow.getByRole('button', { name: 'Grades' }).click()
  await expect(page.getByLabel('Practical: Synthetic Student')).toHaveValue('0')
  await expect(page.getByLabel('Theory: Synthetic Student')).toHaveValue('100')
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await page.getByRole('combobox', { name: 'Course', exact: true }).selectOption(courseA)
  await expect(page.getByLabel('Attendance for Synthetic Student')).toBeVisible()
  await page.getByRole('button', { name: 'Courses', exact: true }).click()
  await courseRow.getByRole('button', { name: 'Manage students' }).click()
  await page.getByRole('switch', { name: 'Enrolled: Synthetic Student' }).click()
  await expect.poll(() => enrollments[0].active).toBe(false)
  await page.getByRole('button', { name: 'History & corrections', exact: true }).click()
  await expect(page.locator('li').filter({ hasText: 'Synthetic Student' })).toContainText('present')
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await expect(page.getByLabel('Attendance for Synthetic Student')).toHaveCount(0)
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
