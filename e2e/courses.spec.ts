import { clickAccountAction } from './profileActions'
import { expect, test, type Locator } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { enrollmentSchema, courseSchema } from '../shared/neon'

test.use({ trace: 'off' })
const teacherId = '10000000-0000-4000-8000-000000000001'
const studentId = '20000000-0000-4000-8000-000000000001'
const secondStudentId = '20000000-0000-4000-8000-000000000002'
const courseA = '30000000-0000-4000-8000-000000000001'
const courseB = '30000000-0000-4000-8000-000000000002'
const enrollA = '40000000-0000-4000-8000-000000000001'
const enrollB = '40000000-0000-4000-8000-000000000002'

async function expectCompactLevel(list: Locator) {
  if (((await list.page().viewportSize())?.width ?? 0) <= 1024) {
    await expect(list.locator('td[data-label]').first()).toBeVisible()
    return
  }
  const geometry = await list.locator('table').evaluate((table) => {
    const headers = [...table.querySelectorAll('thead th')]
    const levelIndex = table.classList.contains('roster-students-table') ? 4 : 1
    const level = table.querySelector(`tbody tr td:nth-child(${levelIndex + 1})`)
    if (!headers[levelIndex] || !level) throw new Error('Student and level columns must be present')
    const textCenter = (element: Element) => {
      const range = document.createRange()
      range.selectNodeContents(element.querySelector('.table-sort-label') ?? element)
      const bounds = range.getBoundingClientRect()
      return (bounds.left + bounds.right) / 2
    }
    return {
      widths: headers.map((header) => header.getBoundingClientRect().width),
      levelIndex,
      levelAlignment: Math.abs(textCenter(headers[levelIndex]) - textCenter(level)),
    }
  })
  expect(geometry.widths[geometry.levelIndex]).toBeLessThanOrEqual(112)
  expect(geometry.widths[0]).toBeGreaterThan(geometry.widths[geometry.levelIndex] * 1.5)
  expect(geometry.levelAlignment).toBeLessThanOrEqual(2)
  if (geometry.widths.length === 4)
    expect(geometry.widths.slice(1).every((width) => width <= 128)).toBe(true)
}

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
    {
      kind: 'student',
      studentId,
      name: 'Synthetic Student',
      firstName: 'Synthetic',
      lastName: 'Student',
      whatsapp: '012 345',
      group: 'Roster level',
      active: true,
    },
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
      notes: '',
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
      notes: '',
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
    if (path === '/api/admin/courses/settings') {
      const body = route.request().postDataJSON()
      const index = courses.findIndex((item) => item.id === body.id)
      if (index >= 0) courses[index] = { ...courses[index], ...body }
      return route.fulfill({ json: { saved: true } })
    }
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
    if (path === '/api/admin/enrollments/decision') {
      const body = route.request().postDataJSON()
      const entry = enrollments.find((item) => item.id === body.id)
      if (entry) {
        const parsed = enrollmentSchema.parse(entry)
        Object.assign(entry, {
          gradeDecisions: [
            ...parsed.gradeDecisions,
            {
              requestId: body.requestId,
              result: body.result,
              note: body.note.trim(),
              actor: 'synthetic-admin',
              at: new Date().toISOString(),
            },
          ],
        })
      }
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
  const row = list.locator(`[data-student-id="${studentId}"]`)
  await expect(
    list.locator('thead th > button.table-sort, thead th:not(:has(button.table-sort))'),
  ).toHaveText([
    'First name',
    'Last name',
    'Phone',
    'Attendance',
    'Level',
    'Courses',
    'Active',
    'Actions',
  ])
  await expect(row.getByRole('cell').nth(4)).toHaveText('Roster level')
  await expect(row.getByRole('img', { name: 'Active', exact: true })).toBeVisible()
  await expect(row.getByRole('img', { name: 'Active', exact: true })).toHaveAttribute(
    'title',
    'Active',
  )
  await expectCompactLevel(list)
  const courseFilter = page.getByRole('combobox', { name: 'Course', exact: true })
  await courseFilter.selectOption(courseA)
  await expect(row.getByRole('cell').nth(4)).toHaveText('—')
  await courseFilter.selectOption(courseB)
  await expect(row.getByRole('cell').nth(4)).toHaveText('Advanced')
  await page.reload()
  await expect(row.getByRole('cell').nth(4)).toHaveText('Advanced')
  await mkdir('.artifacts/verification', { recursive: true })
  if (testInfo.project.name === 'chromium') await page.setViewportSize({ width: 1715, height: 993 })
  await expectCompactLevel(list)
  if (testInfo.project.name === 'mobile') {
    for (const width of [320, 390, 430, 844]) {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 844 })
      await expect(list).toHaveAttribute('tabindex', '0')
      const open = row.getByRole('button', { name: 'Open student' })
      await expect(open.locator('.roster-open-label')).toBeVisible()
      const openBounds = await open.boundingBox()
      expect(openBounds && openBounds.x >= 0 && openBounds.x + openBounds.width <= width).toBe(true)
      expect(await list.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      )
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
  await expect(row.getByRole('cell').nth(0)).toBeVisible()
  await expect(row.getByRole('cell').nth(1)).toBeVisible()
  const phone = row.getByRole('link', { name: '012 345' })
  await expect(phone).toHaveAttribute('dir', 'ltr')
  await expect(phone).toHaveAttribute('href', 'tel:012345')
  await row.getByRole('button', { name: 'Open student' }).click()
  await expect(page.getByRole('heading', { name: 'Student information' })).toBeVisible()
  await expect(
    page.locator('.student-details').getByText('Synthetic', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('.student-details').getByText('Student', { exact: true })).toBeVisible()
  await expect(
    page.locator('.student-details').getByText('012 345', { exact: true }),
  ).toHaveAttribute('dir', 'ltr')
  await page.reload()
  await expect(
    page.locator('.student-details').getByText('012 345', { exact: true }),
  ).toHaveAttribute('dir', 'ltr')
  await page.getByRole('button', { name: 'Take attendance' }).click()
  await expect(page.getByLabel('Attendance for Synthetic Student')).toBeVisible()
  const attendanceRow = page
    .getByRole('region', { name: 'Attendance list' })
    .getByRole('row')
    .filter({ hasText: 'Synthetic Student' })
  await expect(attendanceRow.getByRole('cell').nth(1)).toHaveText('Advanced')
  await expect(attendanceRow.getByRole('cell').first()).toHaveText('Synthetic Student')
  await expectCompactLevel(page.getByRole('region', { name: 'Attendance list' }))
  await page.getByRole('button', { name: 'All my students' }).click()
  await courseFilter.selectOption(courseA)
  await expect(attendanceRow.getByRole('cell').nth(1)).toHaveText('—')
  await page.getByLabel('Find a student').fill('Synthetic')
  await expect(attendanceRow.getByRole('cell').nth(1)).toHaveText('—')
  await expect(attendanceRow.getByRole('cell').first()).toHaveText('Synthetic Student')
  await page.getByLabel('Find a student').fill('')
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await clickAccountAction(page, 'العربية')
  const arabicList = page.getByRole('region', { name: 'قائمة الطلاب' })
  await expect(arabicList.getByRole('img', { name: 'نشط', exact: true }).first()).toBeVisible()
  await expect(arabicList.getByRole('img', { name: 'نشط', exact: true }).first()).toHaveAttribute(
    'title',
    'نشط',
  )
  await expect(arabicList.getByRole('row').nth(1).getByRole('cell').nth(6)).toHaveText('')
  await expectCompactLevel(arabicList)
  await page.screenshot({
    path: `.artifacts/verification/roster-layout-${testInfo.project.name}-ar.png`,
    fullPage: true,
  })
  await expect(
    arabicList.locator('thead th > button.table-sort, thead th:not(:has(button.table-sort))'),
  ).toHaveText([
    'الاسم الأول',
    'اسم العائلة',
    'رقم الهاتف',
    'الحضور',
    'المستوى',
    'الدورات',
    'الحالة',
    'الإجراءات',
  ])
  if (testInfo.project.name === 'mobile') {
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 })
      await expect(arabicList).toHaveAttribute('tabindex', '0')
      expect(
        await arabicList.evaluate((element) => element.scrollWidth <= element.clientWidth),
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
  await clickAccountAction(page, 'English')
  await page.getByRole('button', { name: 'Courses', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Course A' })).toBeVisible()
  if (testInfo.project.name === 'mobile') {
    for (const language of ['en', 'ar']) {
      if (language === 'ar') {
        await clickAccountAction(page, '\u0627\u0644\u0639\u0631\u0628\u064a\u0629')
      }
      for (const width of [320, 390, 430]) {
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
            return {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            }
          }),
        )
        expect(bounds.every((rect) => rect.left >= 0 && rect.right <= width)).toBe(true)
        expect(bounds.every((rect) => rect.width >= 44 && rect.height >= 44)).toBe(true)
        for (const row of [bounds.slice(0, 5), bounds.slice(5)]) {
          expect(new Set(row.map((rect) => rect.top)).size).toBe(1)
          const ordered = row.toSorted((a, b) => a.left - b.left)
          expect(ordered.slice(1).every((rect, index) => rect.left >= ordered[index].right)).toBe(
            true,
          )
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true)
        await page.screenshot({
          path: `.artifacts/verification/course-list-${width}-${language}.png`,
          fullPage: true,
        })
      }
    }
    await clickAccountAction(page, 'English')
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
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 })
      const table = page.getByRole('region', { name: 'Course students' })
      expect(await table.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
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
    await clickAccountAction(page, '\u0627\u0644\u0639\u0631\u0628\u064a\u0629')
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 })
      const table = page.getByRole('region', {
        name: '\u0637\u0644\u0627\u0628 \u0627\u0644\u062f\u0648\u0631\u0629',
      })
      await expect(table.getByRole('columnheader')).toHaveCount(7)
      expect(await table.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
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
    await clickAccountAction(page, 'English')
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
  const originalViewport = page.viewportSize()
  await page.setViewportSize({ width: 1440, height: 900 })
  const compactGradeRow = page.getByRole('row').filter({ hasText: 'Synthetic' })
  await compactGradeRow.getByText('Override result').click()
  await expect(compactGradeRow.getByRole('button', { name: 'Save decision' })).toBeDisabled()
  await compactGradeRow.getByLabel('Decision note (required)').fill('Reviewed')
  await compactGradeRow.getByRole('button', { name: 'Save decision' }).click()
  await expect(compactGradeRow).toContainText('Effective: Pass')
  await page.reload()
  await expect(compactGradeRow).toContainText('Effective: Pass')
  await compactGradeRow.getByText('Override result').click()
  await compactGradeRow.getByRole('combobox').selectOption('calculated')
  await compactGradeRow.getByLabel('Decision note (required)').fill('Restore')
  await compactGradeRow.getByRole('button', { name: 'Save decision' }).click()
  await compactGradeRow.getByText('Decision history').click()
  await expect(compactGradeRow).toContainText('Reviewed')
  await expect(compactGradeRow).toContainText('Restore')
  await compactGradeRow.getByText('Decision history').click()
  await compactGradeRow.getByText('Override result').click()
  const checkGradeOrder = async (theory: string, practical: string) => {
    const headers = page.locator('thead th')
    await expect(headers.nth(4)).toContainText(theory)
    await expect(headers.nth(5)).toContainText(practical)
    await expect(compactGradeRow.locator('td').nth(4)).toHaveAttribute('data-label', theory)
    await expect(compactGradeRow.locator('td').nth(5)).toHaveAttribute('data-label', practical)
  }
  const checkGradeSave = async (label: string) => {
    const button = compactGradeRow.getByRole('button', { name: label })
    await expect(button).toHaveAttribute('title', label)
    await expect(button.locator('svg')).toBeVisible()
    const bounds = await button.boundingBox()
    expect(bounds?.width).toBeGreaterThanOrEqual(44)
    expect(bounds?.height).toBeGreaterThanOrEqual(44)
  }
  await checkGradeSave('Save grades')
  await checkGradeOrder('Theory', 'Practical')
  expect(
    (await page.getByLabel('Practical: Synthetic Student').boundingBox())?.height,
  ).toBeGreaterThanOrEqual(44)
  await expect(page.getByLabel('Notes: Synthetic Student')).toBeVisible()
  expect(
    (await page.getByLabel('Notes: Synthetic Student').boundingBox())?.width,
  ).toBeGreaterThanOrEqual(192)
  await clickAccountAction(page, '\u0627\u0644\u0639\u0631\u0628\u064a\u0629')
  await checkGradeSave('حفظ الدرجات')
  await checkGradeOrder('نظري', 'عملي')
  await expect(
    page.getByLabel('\u0645\u0644\u0627\u062d\u0638\u0627\u062a: Synthetic Student'),
  ).toBeVisible()
  await page.setViewportSize({ width: 320, height: 844 })
  await checkGradeSave('حفظ الدرجات')
  await checkGradeOrder('نظري', 'عملي')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await clickAccountAction(page, 'English')
  await checkGradeSave('Save grades')
  await checkGradeOrder('Theory', 'Practical')
  await compactGradeRow.getByText('Override result').click()
  await compactGradeRow.getByLabel('Decision note (required)').fill('x'.repeat(300))
  await compactGradeRow.getByRole('button', { name: 'Save decision' }).click()
  await compactGradeRow.getByText('Decision history').click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await clickAccountAction(page, '\u0627\u0644\u0639\u0631\u0628\u064a\u0629')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await clickAccountAction(page, 'English')
  await compactGradeRow.getByText('Decision history').click()
  await compactGradeRow.getByText('Override result').click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  for (const width of [390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await clickAccountAction(page, '\u0627\u0644\u0639\u0631\u0628\u064a\u0629')
    await expect(
      page.getByLabel('\u0645\u0644\u0627\u062d\u0638\u0627\u062a: Synthetic Student'),
    ).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await clickAccountAction(page, 'English')
  }
  if (originalViewport) await page.setViewportSize(originalViewport)
  await expect(page.getByRole('button', { name: 'Close course' })).toBeDisabled()
  await expect(page.getByText('Unavailable')).toBeVisible()
  await page.getByLabel('Minimum attendance %').fill('60')
  await page.getByRole('button', { name: 'Save thresholds' }).click()
  await expect(page.getByLabel('Minimum attendance %')).toHaveValue('60')
  await page.getByLabel('Practical: Synthetic Student').fill('0')
  await page.getByLabel('Theory: Synthetic Student').fill('100')
  await page.getByLabel('Notes: Synthetic Student').fill('First line\nSecond line')
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
  await expect(page.getByLabel('Notes: Synthetic Student')).toHaveValue('First line\nSecond line')
  await page.getByLabel('Notes: Synthetic Student').fill('')
  await compactGradeRow.getByRole('button', { name: 'Save grades' }).click()
  await expect.poll(() => enrollments[0].notes).toBe('')
  await page.reload()
  await expect(page.getByLabel('Notes: Synthetic Student')).toHaveValue('')
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
  await clickAccountAction(page, 'العربية')
  await expect(courseRow).toContainText('مغلقة')
  await expect(courseRow.getByRole('button', { name: 'إعادة فتح' })).toBeVisible()
  await page.screenshot({
    path: `.artifacts/verification/closed-course-${testInfo.project.name}-ar.png`,
    fullPage: true,
  })
  await clickAccountAction(page, 'English')
  await page.reload()
  await expect(courseRow).toContainText('Closed')
  await courseRow.getByRole('button', { name: 'History', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'This course is closed' })).toBeVisible()
  await expect(
    page
      .getByRole('combobox', { name: 'Course', exact: true })
      .locator(`option[value="${courseA}"]`),
  ).toHaveCount(0)
  await expect(
    page.locator('li').filter({ hasText: 'Synthetic Student' }).filter({ hasText: 'present' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await expect(page.getByLabel('Attendance for Synthetic Student')).toHaveCount(0)
  await page.getByRole('button', { name: 'Courses', exact: true }).click()
  await courseRow.getByRole('button', { name: 'Reopen', exact: true }).click()
  await expect(courseRow).toContainText('Open')
  await courseRow.getByRole('button', { name: 'Grades' }).click()
  await expect(page.getByLabel('Practical: Synthetic Student')).toHaveValue('0')
  await expect(page.getByLabel('Theory: Synthetic Student')).toHaveValue('100')
  const gradeRow = page.getByRole('row').filter({ hasText: 'Synthetic' })
  await expect(gradeRow).toContainText('100.0%')
  await expect(gradeRow).toContainText('Fail')
  await page.getByLabel('Practical: Synthetic Student').fill('80')
  await expect(gradeRow).toContainText('Pending')
  await expect(page.getByRole('button', { name: 'Close course' })).toBeDisabled()
  await gradeRow.getByRole('button', { name: 'Save grades' }).click()
  await expect(gradeRow).toContainText('Pass')
  events.push({
    id: '50000000-0000-4000-8000-000000000002',
    actor: 'Admin',
    clientTime: new Date().toISOString(),
    receivedAt: '',
    payload: {
      kind: 'attendance',
      studentId,
      enrollmentId: enrollA,
      date: '2026-01-01',
      status: 'absent',
    },
  })
  await page.reload()
  await expect(gradeRow).toContainText('50.0%')
  await expect(gradeRow).toContainText('Fail')
  await page.getByLabel('Minimum attendance %').fill('50')
  await expect(gradeRow).toContainText('Pending')
  await page.getByRole('button', { name: 'Save thresholds' }).click()
  await expect(gradeRow).toContainText('Pass')
  await clickAccountAction(page, 'العربية')
  await expect(page.getByLabel('الحد الأدنى للحضور %')).toHaveValue('50')
  await expect(gradeRow).toContainText('ناجح')
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    const grades = page.getByRole('region', { name: 'درجات الدورة' })
    const bounds = await grades.evaluate((element) => ({
      scroll: element.scrollWidth,
      visible: element.clientWidth,
      table: element.querySelector('table')?.getBoundingClientRect().width ?? 0,
    }))
    expect(bounds.table).toBeLessThanOrEqual(bounds.visible + 1)
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.visible + 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.screenshot({
    path: `.artifacts/verification/grades-${testInfo.project.name}-ar.png`,
    fullPage: true,
  })
  await clickAccountAction(page, 'English')
  await page.getByRole('button', { name: 'Close course', exact: true }).click()
  await expect(
    page.getByRole('status', { exact: false }).filter({ hasText: 'Course closed' }),
  ).toBeVisible()
  await page.reload()
  await expect(page.getByText('Course closed', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Courses', exact: true }).click()
  await expect(courseRow).toContainText('Closed')
  await courseRow.getByRole('button', { name: 'Reopen', exact: true }).click()
  await expect(courseRow).toContainText('Open')
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await page.getByRole('combobox', { name: 'Course', exact: true }).selectOption(courseA)
  await expect(page.getByLabel('Attendance for Synthetic Student')).toBeVisible()
  await page.getByRole('button', { name: 'Courses', exact: true }).click()
  await courseRow.getByRole('button', { name: 'Manage students' }).click()
  await page.getByRole('switch', { name: 'Enrolled: Synthetic Student' }).click()
  await expect.poll(() => enrollments[0].active).toBe(false)
  await page.getByRole('button', { name: 'History & corrections', exact: true }).click()
  await expect(
    page.locator('li').filter({ hasText: 'Synthetic Student' }).filter({ hasText: 'present' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await expect(page.getByLabel('Attendance for Synthetic Student')).toHaveCount(0)
  if (testInfo.project.name === 'mobile') {
    for (const width of [320, 390, 430]) {
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

test('administrator no-course Students includes the complete inactive register', async ({
  page,
}, testInfo) => {
  const teacher = {
    role: 'administrator',
    id: teacherId,
    name: 'Synthetic Admin',
    canRead: true,
    canWrite: true,
    expiresAt: null,
  }
  const students = [
    { kind: 'student', studentId, name: 'Current Student', group: 'Current', active: true },
    {
      kind: 'student',
      studentId: secondStudentId,
      name: 'Historical Student',
      group: 'History',
      active: false,
    },
    {
      kind: 'student',
      studentId: '20000000-0000-4000-8000-000000000003',
      name: 'Unassigned Historical',
      group: '',
      active: false,
    },
  ]
  const courses = [
    { id: courseA, name: 'Synthetic Course', open: true },
    { id: courseB, name: 'Closed Course', open: false },
    { id: '30000000-0000-4000-8000-000000000003', name: 'Third Course', open: true },
    { id: '30000000-0000-4000-8000-000000000004', name: 'Fourth Course', open: true },
    { id: '30000000-0000-4000-8000-000000000005', name: 'Withdrawn Course', open: true },
  ]
  const enrollments = [
    {
      id: enrollA,
      courseId: courseA,
      studentId,
      level: 'Course level',
      active: true,
      practical: null,
      theory: null,
    },
  ]
  for (const [index, course] of courses.entries()) {
    enrollments.push({
      id: `40000000-0000-4000-8000-00000000001${index}`,
      courseId: course.id,
      studentId: secondStudentId,
      level: 'Historical level',
      active: index < 4,
      practical: null,
      theory: null,
    })
  }
  const historyEvents = [
    {
      id: '50000000-0000-4000-8000-000000000011',
      actor: 'Admin',
      clientTime: '2026-01-01T00:00:00.000Z',
      receivedAt: '',
      payload: {
        kind: 'attendance',
        studentId: secondStudentId,
        enrollmentId: '40000000-0000-4000-8000-000000000010',
        date: '2026-01-01',
        status: 'late',
      },
    },
    {
      id: '50000000-0000-4000-8000-000000000012',
      actor: 'Admin',
      clientTime: '2026-01-02T00:00:00.000Z',
      receivedAt: '',
      payload: {
        kind: 'attendance',
        studentId: secondStudentId,
        enrollmentId: '40000000-0000-4000-8000-000000000011',
        date: '2026-01-02',
        status: 'absent',
      },
    },
    {
      id: '50000000-0000-4000-8000-000000000013',
      actor: 'Admin',
      clientTime: '2026-01-03T00:00:00.000Z',
      receivedAt: '',
      payload: {
        kind: 'attendance',
        studentId: secondStudentId,
        date: '2026-01-03',
        status: 'excused',
      },
    },
    {
      id: '50000000-0000-4000-8000-000000000014',
      actor: 'Admin',
      clientTime: '2026-01-04T00:00:00.000Z',
      receivedAt: '',
      payload: {
        kind: 'reversal',
        targetId: '50000000-0000-4000-8000-000000000012',
        reason: 'Correction',
      },
    },
  ]
  await page.route('**/api/auth/**', (route) =>
    route.fulfill({
      json: {
        user: { id: teacherId, name: teacher.name, email: 'synthetic@example.test' },
        session: {
          id: 'synthetic',
          userId: teacherId,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
      },
    }),
  )
  await page.route('**/api/**', (route) =>
    new URL(route.request().url()).pathname.startsWith('/api/auth/')
      ? route.fallback()
      : route.fulfill({
          json:
            new URL(route.request().url()).pathname === '/api/me'
              ? { account: teacher }
              : { teacher, students, courses, enrollments, events: historyEvents },
        }),
  )
  await page.goto('/?page=app&tab=roster')
  const rows = page.locator('.roster-table tbody tr'),
    count = page.locator('.workspace-count strong')
  await expect(rows).toHaveCount(3)
  await expect(page.getByRole('combobox', { name: 'Course', exact: true })).toHaveValue('')
  await expect(page.getByRole('option', { name: 'All students' })).toHaveCount(1)
  const historical = rows.filter({ hasText: 'Historical Student' })
  const unassigned = rows.filter({ hasText: 'Unassigned Historical' })
  await expect(unassigned.getByRole('cell').nth(5)).toHaveText('None')
  await expect(unassigned.getByRole('cell').nth(3)).toHaveText('Not recorded')
  await expect(historical.getByRole('cell').nth(3)).toContainText('50.0%')
  await expect(historical.getByRole('cell').nth(3)).toContainText('Recorded sessions: 2')
  await historical.getByRole('button', { name: 'Open student' }).click()
  const detail = page.locator('.student-details')
  await expect(detail.getByText('Not provided')).toBeVisible()
  await expect(
    detail.getByText('Recorded sessions', { exact: true }).locator('..').locator('dd'),
  ).toHaveText('2')
  await expect(detail.getByText('50.0%', { exact: true })).toBeVisible()
  await expect(detail.getByRole('button', { name: 'Take attendance' })).toHaveCount(0)
  await expect(
    detail.getByRole('region', { name: 'Attendance history' }).getByRole('row'),
  ).toHaveCount(3)
  await page.reload()
  await expect(detail.getByText('50.0%', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Course', exact: true }).selectOption(courseA)
  await expect(
    detail.getByText('Recorded sessions', { exact: true }).locator('..').locator('dd'),
  ).toHaveText('1')
  await expect(detail.getByText('100.0%', { exact: true })).toBeVisible()
  await page.goBack()
  await expect(detail.getByText('50.0%', { exact: true })).toBeVisible()
  await page.goBack()
  await expect(historical).toBeVisible()
  await page.goto('/?page=app&view=student&tab=roster&student=20000000-0000-4000-8000-000000000099')
  await expect(page.getByText('Student unavailable')).toBeVisible()
  await expect(page.locator('.student-details')).toHaveCount(0)
  await page.goBack()
  await unassigned.getByRole('button', { name: 'Open student' }).click()
  await expect(page.locator('.student-details').getByText('No attendance records')).toBeVisible()
  await page.goBack()

  if (testInfo.project.name === 'chromium') {
    await page.setViewportSize({ width: 1200, height: 800 })
    for (const name of ['Synthetic Course', 'Closed Course', 'Third Course', 'Fourth Course'])
      await expect(
        historical.locator('.roster-courses-desktop').getByText(name, { exact: true }),
      ).toBeVisible()
    await expect(historical).not.toContainText('Withdrawn Course')
  }
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    const disclosure = historical.locator('.roster-courses-mobile')
    if (!(await disclosure.evaluate((element) => element.hasAttribute('open'))))
      await disclosure.locator('summary').click()
    for (const name of ['Synthetic Course', 'Closed Course', 'Third Course', 'Fourth Course'])
      await expect(disclosure.getByText(name, { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await expect(count).toHaveText('3')
  await expect(page.getByRole('img', { name: 'Inactive', exact: true })).toHaveCount(2)
  await page.getByLabel('Find a student').fill('Historical')
  await expect(rows).toHaveCount(2)
  await page.getByLabel('Find a student').fill('')
  await page.getByRole('combobox', { name: 'Group', exact: true }).selectOption('History')
  await expect(rows).toHaveCount(1)
  await page.getByRole('combobox', { name: 'Group', exact: true }).selectOption('')
  await page.reload()
  await expect(rows).toHaveCount(3)
  const course = page.getByRole('combobox', { name: 'Course', exact: true })
  await course.selectOption(courseA)
  await expect(rows).toHaveCount(1)
  await expect(count).toHaveText('1')
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await expect(page.getByLabel('Attendance for Historical Student')).toHaveCount(0)
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await expect(course).toHaveValue('')
  await expect(rows).toHaveCount(3)
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(count).toHaveText('1')
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await expect(rows).toHaveCount(3)
  await clickAccountAction(page, 'العربية')
  await expect(
    page.locator('thead th > button.table-sort, thead th:not(:has(button.table-sort))'),
  ).toHaveText([
    'الاسم الأول',
    'اسم العائلة',
    'رقم الهاتف',
    'الحضور',
    'المستوى',
    'الدورات',
    'الحالة',
    'الإجراءات',
  ])
  await historical.getByRole('button', { name: 'فتح الطالب' }).click()
  await expect(page.getByRole('heading', { name: 'معلومات الطالب' })).toBeVisible()
  await expect(page.locator('.student-details').getByText('غير متوفر')).toBeVisible()
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.goBack()
  await expect(page.getByRole('img', { name: 'غير نشط', exact: true })).toHaveCount(2)
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    const disclosure = historical.locator('.roster-courses-mobile')
    if (!(await disclosure.evaluate((element) => element.hasAttribute('open'))))
      await disclosure.locator('summary').click()
    for (const name of ['Synthetic Course', 'Closed Course', 'Third Course', 'Fourth Course'])
      await expect(disclosure.getByText(name, { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({
    path: `.artifacts/verification/full-register-${testInfo.project.name}-ar.png`,
    fullPage: false,
  })
})
