import { clickRecordAction, recordActions } from './recordActions'
import { clickAccountAction } from './profileActions'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { enrollmentSchema, courseSchema } from '../shared/neon'

test.use({ trace: 'off' })
const teacherId = '10000000-0000-4000-8000-000000000001'
const otherAdminId = '10000000-0000-4000-8000-000000000003'
const studentId = '20000000-0000-4000-8000-000000000001'
const secondStudentId = '20000000-0000-4000-8000-000000000002'
const courseA = '30000000-0000-4000-8000-000000000001'
const courseB = '30000000-0000-4000-8000-000000000002'
const enrollA = '40000000-0000-4000-8000-000000000001'
const enrollB = '40000000-0000-4000-8000-000000000002'

async function selectCourse(page: Page, name: string) {
  await page.locator('.workspace-course-switcher summary').click()
  await page.locator('.workspace-course-menu').getByRole('button', { name, exact: true }).click()
}

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
}

async function makeCurrent(page: Page, name: string) {
  await page.getByLabel('Change course').click()
  await page.locator('.workspace-course-menu').getByRole('button', { name, exact: true }).click()
  await page.getByLabel('Change course').click()
  const makeDefault = page.getByRole('button', { name: 'Make default' })
  if (await makeDefault.isVisible()) await makeDefault.click()
  else await page.getByLabel('Change course').click()
}

async function setupCourses(page: Page) {
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
      teacherId: null as string | null,
      teacherName: null as string | null,
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
      teacherId: null as string | null,
      teacherName: null as string | null,
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
        authUserId: otherAdminId,
        email: 'other-admin@example.test',
        name: 'Other Admin',
        profileName: 'Other Admin',
        role: 'administrator',
        active: true,
        expiresAt: null,
        teacherId,
        studentId: null,
      },
      {
        authUserId: teacherId,
        email: 'admin@example.test',
        name: 'Administrator',
        profileName: 'Updated Admin',
        role: 'administrator',
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
          name: 'Updated Admin',
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
      if (index >= 0)
        enrollments[index] = {
          ...enrollments[index],
          ...body,
          teacherName: body.teacherId ? 'Admin' : null,
        }
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
              actor:
                parsed.gradeDecisions.length === 0
                  ? 'deleted-actor'
                  : parsed.gradeDecisions.length === 1
                    ? otherAdminId
                    : teacherId,
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
  const savedToast = page.getByRole('status').filter({ hasText: /^(Saved|تم الحفظ)$/ })
  return { board, courses, enrollments, events, attemptedCourseIds, savedToast }
}

test('course creation keeps retry and navigation identities separate', async ({ page }) => {
  const { courses, attemptedCourseIds, savedToast } = await setupCourses(page)
  await page.goto('/?page=app&view=courses')
  await page.getByRole('button', { name: 'Create course' }).click()
  await expect(page.getByRole('region', { name: 'Course list' })).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create course')
  await expect(
    page.getByLabel('Course name').locator('xpath=ancestor::section[1]').getByRole('heading'),
  ).toHaveCount(1)
  await page.getByLabel('Course name').fill('Created course')
  await page.getByRole('button', { name: 'Save course' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(savedToast).toBeHidden()
  await page.getByRole('button', { name: 'Save course' }).click()
  await expect.poll(() => courses.length).toBe(3)
  await expect.poll(() => attemptedCourseIds.length).toBe(2)
  expect(attemptedCourseIds[0]).toBe(attemptedCourseIds[1])
  await expect(savedToast).toHaveText('Saved')
  await expect(page.getByRole('row').filter({ hasText: 'Created course' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: 'Created course' })).toBeVisible()
  await page.getByRole('button', { name: 'Create course' }).click()
  await page.getByLabel('Course name').fill('Another course')
  await page.getByRole('button', { name: 'Save course' }).click()
  await expect.poll(() => courses.length).toBe(4)
  expect(courses[2].id).not.toBe(courses[3].id)
  await expect(page.getByRole('row').filter({ hasText: 'Created course' })).toBeVisible()
  await page.goto(`/?page=app&view=courses&courseView=create&course=${courseA}`)
  await expect(page.getByLabel('Course name')).toHaveValue('')
  await page.getByLabel('Course name').fill('Direct link course')
  await page.getByRole('button', { name: 'Save course' }).click()
  await expect.poll(() => courses.length).toBe(5)
  expect(courses.find((course) => course.id === courseA)?.name).toBe('Course A')
  expect(attemptedCourseIds.at(-1)).not.toBe(courseA)
  const directCourseId = attemptedCourseIds.at(-1)
  await page.goBack()
  await expect(page.getByLabel('Course name')).toHaveValue('')
  await page.getByLabel('Course name').fill('Back navigation course')
  await page.getByRole('button', { name: 'Save course' }).click()
  await expect.poll(() => courses.length).toBe(6)
  expect(attemptedCourseIds.at(-1)).not.toBe(directCourseId)
})

test('course enrollment and same-day attendance stay separate', async ({ page }, testInfo) => {
  await page.clock.install()
  const { board, courses, enrollments, savedToast } = await setupCourses(page)
  const coursePanel = page
    .locator('section.panel')
    .filter({ has: page.locator('.course-list-table') })
  if (testInfo.project.name === 'chromium') {
    await page.goto('/?page=app&view=courses')
    await expect(coursePanel).toBeVisible()
    const panel = await coursePanel.boundingBox()
    const content = await page.getByRole('main').boundingBox()
    if (!panel || !content) throw new Error('Missing course list or workspace content')
    expect(panel.y - content.y).toBeGreaterThanOrEqual(32)
  }
  await page.goto('/?page=app&tab=attendance')
  await makeCurrent(page, 'Course B')
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await selectCourse(page, 'All students')
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
  const level = row.locator('td[data-label="Level"]')
  await expect(level).toHaveText('Roster level')
  await expect(row.getByRole('img', { name: 'Active', exact: true })).toBeVisible()
  await expect(row.getByRole('img', { name: 'Active', exact: true })).toHaveAttribute(
    'title',
    'Active',
  )
  await expectCompactLevel(list)
  await selectCourse(page, 'Course A')
  await expect(level).toHaveText('—')
  await selectCourse(page, 'Course B')
  await expect(level).toHaveText('Advanced')
  await page.reload()
  await expect(level).toHaveText('Advanced')
  await mkdir('.artifacts/verification', { recursive: true })
  if (testInfo.project.name === 'chromium') await page.setViewportSize({ width: 1715, height: 993 })
  await expectCompactLevel(list)
  if (testInfo.project.name === 'mobile') {
    for (const width of [320, 390, 430, 844]) {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 844 })
      await expect(list).toHaveAttribute('tabindex', '0')
      const open = row.getByRole('button', { name: 'Open student' })
      await expect(open).toHaveText('Synthetic Student')
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
  if (testInfo.project.name === 'chromium') {
    await expect(row.locator('.roster-first-name')).toBeVisible()
    await expect(row.locator('.roster-last-name')).toBeVisible()
  }
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
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await makeCurrent(page, 'Course A')
  await expect(attendanceRow.getByRole('cell').nth(1)).toHaveText('—')
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await clickAccountAction(page, 'العربية')
  const arabicList = page.getByRole('region', { name: 'قائمة الطلاب' })
  await expect(arabicList.getByRole('img', { name: 'نشط', exact: true }).first()).toBeVisible()
  await expect(arabicList.getByRole('img', { name: 'نشط', exact: true }).first()).toHaveAttribute(
    'title',
    'نشط',
  )
  await expect(
    arabicList.locator('tbody tr').first().locator('td[data-label="الحالة"]'),
  ).toHaveText('')
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
  const courseList = page.getByRole('region', { name: 'Course list' })
  const wide = testInfo.project.name === 'chromium'
  const firstCourseRow = page.getByRole('row').filter({ hasText: 'Course A' })
  const firstCourseActions = recordActions(firstCourseRow)
  const firstCourseMenu = firstCourseRow.getByRole('group', { name: 'Actions for Course A' })
  const expectActionDivider = async (language: string) => {
    const header = coursePanel.getByRole('columnheader', {
      name: language === 'en' ? 'Actions' : 'الإجراءات',
      exact: true,
    })
    const statusHeader = coursePanel.getByRole('columnheader', {
      name: language === 'en' ? 'Status' : 'الحالة',
    })
    const headerBox = await header.boundingBox()
    const statusBox = await statusHeader.boundingBox()
    const actionBox = await firstCourseRow.getByRole('cell').last().boundingBox()
    if (!headerBox || !statusBox || !actionBox) throw new Error('Missing course table cells')
    expect(headerBox.x).toBeCloseTo(actionBox.x)
    expect(headerBox.width).toBeCloseTo(actionBox.width)
    expect(headerBox.y + headerBox.height).toBeCloseTo(statusBox.y + statusBox.height)
    await expect(header).toHaveCSS(
      'border-bottom',
      await statusHeader.evaluate((cell) => getComputedStyle(cell).borderBottom),
    )
  }
  await expectActionDivider('en')
  if (wide) {
    await expect(recordActions(courseList)).toHaveCount(0)
    const courseBGroup = courseList.getByRole('group', { name: 'Actions for Course B' })
    const icons = courseBGroup.getByRole('button')
    await expect(icons).toHaveCount(6)
    const bounds = await icons.evaluateAll((buttons) =>
      buttons.map((button) => {
        const { left, right, top, width, height } = button.getBoundingClientRect()
        return { left, right, top, width, height }
      }),
    )
    const cell = await courseBGroup.locator('..').boundingBox()
    if (!cell) throw new Error('Missing course action cell')
    expect(
      bounds.every(
        ({ left, right, top, width, height }) =>
          left >= cell.x &&
          right <= cell.x + cell.width &&
          top === bounds[0].top &&
          width >= 44 &&
          height >= 44,
      ),
    ).toBe(true)
    await expect(icons.last()).toHaveAttribute('title', 'Close course')
    await page.screenshot({
      path: '.artifacts/verification/course-list-wide-en.png',
      fullPage: true,
    })
    await courseList.evaluate((list) => (list.style.maxInlineSize = '40rem'))
  }
  await expect(firstCourseActions).toBeVisible()
  await expect(firstCourseMenu).toBeHidden()
  await firstCourseRow.getByRole('cell').nth(1).click({ button: 'right' })
  await expect(firstCourseMenu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(firstCourseActions).toBeFocused()
  if (testInfo.project.name === 'mobile') {
    const cell = firstCourseRow.getByRole('cell').nth(1)
    const box = await cell.boundingBox()
    if (!box) throw new Error('Missing course row')
    const touch = await page.context().newCDPSession(page)
    const point = { x: box.x + box.width - 4, y: box.y + box.height - 4 }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
    await page.waitForTimeout(700)
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(firstCourseMenu).toBeVisible()
    await page.keyboard.press('Escape')
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...point, y: point.y + 30 }],
    })
    await page.waitForTimeout(700)
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(firstCourseMenu).toBeHidden()
    await touch.detach()
  }
  const coursesBeforeOpening = structuredClone(courses)
  await firstCourseActions.press('Enter')
  await expect(firstCourseMenu).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(firstCourseMenu.locator('button:focus')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(firstCourseMenu).toBeHidden()
  await expect(firstCourseActions).toBeFocused()
  await firstCourseActions.click()
  await recordActions(page.getByRole('row').filter({ hasText: 'Course B' })).press('Enter')
  const secondCourseMenu = page.getByRole('group', { name: 'Actions for Course B' })
  await expect(secondCourseMenu).toBeVisible()
  await expect(firstCourseMenu).toBeHidden()
  await page.mouse.click(2, 2)
  await expect(secondCourseMenu).toBeHidden()
  expect(courses).toEqual(coursesBeforeOpening)
  if (wide) await courseList.evaluate((list) => list.style.removeProperty('max-inline-size'))
  await clickRecordAction(firstCourseRow, 'Edit')
  await expect(page.getByRole('heading', { name: 'Edit course' })).toBeVisible()
  await expect(page.getByLabel('Course name')).toHaveValue('Course A')
  await page.getByRole('button', { name: 'Back to courses' }).click()
  if (testInfo.project.name === 'mobile') {
    for (const language of ['en', 'ar']) {
      if (language === 'ar') {
        await clickAccountAction(page, '\u0627\u0644\u0639\u0631\u0628\u064a\u0629')
        await clickAccountAction(page, 'داكن')
      }
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 })
        await expectActionDivider(language)
        const panel = await coursePanel.boundingBox()
        const header = await page.locator('.workspace-rail').boundingBox()
        if (!panel || !header) throw new Error('Missing course list or workspace header')
        expect(panel.y - header.y - header.height).toBeGreaterThanOrEqual(16)
        const actions = page.getByRole('region', {
          name:
            language === 'en'
              ? 'Course list'
              : '\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u062f\u0648\u0631\u0627\u062a',
        })
        const triggers = recordActions(actions)
        await expect(triggers).toHaveCount(2)
        const bounds = await triggers.evaluateAll((buttons) =>
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
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true)
        await page.screenshot({
          path: `.artifacts/verification/course-list-${width}-${language}.png`,
          fullPage: true,
        })
        await firstCourseActions.click()
        const popup = firstCourseRow.getByRole('group', {
          name: language === 'en' ? 'Actions for Course A' : 'إجراءات Course A',
        })
        const menuBounds = await popup.boundingBox()
        if (!menuBounds) throw new Error('Missing course action menu')
        expect(menuBounds.x).toBeGreaterThanOrEqual(0)
        expect(menuBounds.y).toBeGreaterThanOrEqual(0)
        expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(width)
        expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(844)
        expect(
          await popup
            .getByRole('button')
            .evaluateAll((buttons) =>
              buttons.every((button) => button.getBoundingClientRect().height >= 44),
            ),
        ).toBe(true)
        await expect(
          popup.getByRole('button', { name: language === 'en' ? 'Edit' : 'تعديل' }),
        ).toBeVisible()
        await page.screenshot({
          path: `.artifacts/verification/course-menu-${width}-${language}.png`,
        })
        await page.keyboard.press('Escape')
      }
    }
    await clickAccountAction(page, 'English')
    await clickAccountAction(page, 'Device')
  }
  courses.push({ id: '30000000-0000-4000-8000-000000000003', name: 'Created course', open: true })
  await page.reload()
  await clickRecordAction(
    page.getByRole('row').filter({ hasText: 'Created course' }),
    'Manage students',
  )
  await expect(page.getByRole('button', { name: 'Back to courses' })).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Find a student' }).fill('Nw Student')
  const newRow = page.getByRole('row').filter({ hasText: 'New' })
  await newRow.getByLabel('Course level: New Student').fill('Beginner')
  await page.getByRole('searchbox', { name: 'Find a student' }).fill('Synthetic')
  await page.getByRole('searchbox', { name: 'Find a student' }).fill('New')
  await expect(newRow.getByLabel('Course level: New Student')).toHaveValue('Beginner')
  const membershipHeading = page.getByRole('heading', { name: /Manage students/ })
  const headingTop = () =>
    membershipHeading.evaluate((heading) => heading.getBoundingClientRect().top + window.scrollY)
  const beforeSave = await headingTop()
  await newRow.getByRole('switch').click()
  await expect.poll(() => enrollments.length).toBe(3)
  await expect(savedToast).toHaveText('Saved')
  await expect(savedToast).toHaveCSS('position', 'fixed')
  expect(await headingTop()).toBeCloseTo(beforeSave)
  await page.clock.fastForward(4_000)
  await expect(savedToast).toBeHidden()
  await page.reload()
  await expect(newRow.getByLabel('Course level: New Student')).toHaveValue('Beginner')
  await newRow.getByRole('switch').click()
  await expect.poll(() => enrollments[2].active).toBe(false)
  await clickAccountAction(page, 'العربية')
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 844 })
  await newRow.getByRole('switch').click()
  await expect.poll(() => enrollments[2].active).toBe(true)
  await expect(savedToast).toHaveText('تم الحفظ')
  await expect(savedToast).toBeInViewport({ ratio: 1 })
  if (testInfo.project.name === 'mobile') {
    const toast = await savedToast.boundingBox()
    const nav = await page.locator('.workspace-rail nav').boundingBox()
    if (!toast || !nav) throw new Error('Missing save toast or phone navigation')
    expect(toast.y + toast.height).toBeLessThan(nav.y)
  }
  await page.screenshot({
    path: `.artifacts/verification/course-save-${testInfo.project.name}-ar.png`,
  })
  await clickAccountAction(page, 'English')
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
      await expect(table.locator('thead')).toBeHidden()
      await expect(page.getByRole('button', { name: 'العودة للدورات' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'خيارات الفرز' })).toBeVisible()
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
  const coursesNavigation = page.getByRole('button', { name: 'Courses', exact: true })
  await coursesNavigation.click()
  await expect(page.getByRole('heading', { name: 'Courses', exact: true })).toBeVisible()
  await clickRecordAction(page.getByRole('row').filter({ hasText: 'Course A' }), 'Manage students')
  if (testInfo.project.name === 'mobile') {
    await page.setViewportSize({ width: 320, height: 844 })
    const tabs = page.getByRole('navigation', { name: 'Course sections' })
    const links = tabs.getByRole('link')
    await expect(links).toHaveCount(3)
    const boxes = await links.evaluateAll((items) =>
      items.map((item) => {
        const r = item.getBoundingClientRect()
        return { y: r.y, height: r.height }
      }),
    )
    expect(boxes.every((box) => box.height >= 44 && box.y === boxes[0].y)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: '.artifacts/verification/course-membership-320.png',
      fullPage: true,
    })
  }
  const handbook = page.getByRole('checkbox', { name: 'Handbook received: Synthetic Student' })
  const handbookTarget = handbook.locator('..')
  await expect(handbook).toHaveCSS('width', '20px')
  await expect(handbook).toHaveCSS('height', '20px')
  await expect(handbook).toHaveCSS('cursor', 'pointer')
  await expect(handbookTarget).toHaveCSS('width', '44px')
  await expect(handbookTarget).toHaveCSS('height', '44px')
  await expect(handbookTarget).toHaveCSS('cursor', 'pointer')
  await expect(
    page.getByRole('checkbox', { name: 'Handbook received: Quick Student' }),
  ).toBeDisabled()
  await expect(handbook).not.toBeChecked()
  await handbookTarget.click({ position: { x: 4, y: 4 } })
  await expect(handbook).toBeChecked()
  await page.reload()
  await expect(handbook).toBeChecked()
  await handbook.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: `.artifacts/verification/handbook-${testInfo.project.name}.png`,
    fullPage: true,
  })
  await expect(page.getByLabel('Course level: Synthetic Student')).toHaveValue('')
  await page.getByLabel('Course level: Synthetic Student').fill('Draft A')
  await coursesNavigation.click()
  await clickRecordAction(page.getByRole('row').filter({ hasText: 'Course B' }), 'Manage students')
  await expect(page.getByLabel('Handbook received: Synthetic Student')).not.toBeChecked()
  await expect(page.getByLabel('Course level: Synthetic Student')).toHaveValue('Advanced')
  await page.getByLabel('Teacher: Synthetic Student').selectOption(teacherId)
  await page
    .getByRole('row')
    .filter({ hasText: 'Synthetic' })
    .getByRole('button', { name: 'Save level' })
    .click()
  await expect.poll(() => enrollments[1].teacherId).toBe(teacherId)
  expect(enrollments[1].level).toBe('Advanced')
  await page.getByLabel('Course level: Synthetic Student').fill('Updated B')
  await page
    .getByRole('row')
    .filter({ hasText: 'Synthetic' })
    .getByRole('button', { name: 'Save level' })
    .click()
  await expect.poll(() => enrollments[1].level).toBe('Updated B')
  expect(enrollments[1].id).toBe(enrollB)
  await coursesNavigation.click()
  await clickRecordAction(page.getByRole('row').filter({ hasText: 'Course A' }), 'Manage students')
  await expect(page.getByLabel('Course level: Synthetic Student')).toHaveValue('Draft A')
  await page.getByLabel('Course level: Synthetic Student').fill('Intermediate')
  await page
    .getByRole('row')
    .filter({ hasText: 'Synthetic' })
    .getByRole('button', { name: 'Save level' })
    .click()
  await expect.poll(() => enrollments[0].level).toBe('Intermediate')
})

test('grades, attendance, and withdrawal preserve course history', async ({ page }, testInfo) => {
  const { board, enrollments, events } = await setupCourses(page)
  enrollments[0].level = 'Intermediate'
  enrollments[1].level = 'Updated B'
  enrollments[1].teacherId = teacherId
  enrollments[1].teacherName = 'Admin'
  await page.goto(`/?page=app&view=courses&courseView=grades&course=${courseA}`)
  enrollments.push({
    ...enrollments[0],
    id: '40000000-0000-4000-8000-000000000099',
    studentId: secondStudentId,
    active: false,
  })
  await page.reload()
  const missingScores = page.getByRole('button', { name: /Show missing scores/ })
  await expect(missingScores).toBeVisible()
  await missingScores.click()
  await expect(missingScores).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Theory: Synthetic Student')).toBeVisible()
  await expect(page.getByLabel('Theory: New Student')).toHaveCount(0)
  await missingScores.click()
  await expect(missingScores).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByLabel('Theory: New Student')).toBeVisible()
  enrollments.pop()
  await page.reload()
  const originalViewport = page.viewportSize()
  await page.setViewportSize({ width: 1440, height: 900 })
  const compactGradeRow = page.getByRole('row').filter({ hasText: 'Synthetic' })
  const overrideButton = recordActions(compactGradeRow)
  const saveBounds = await compactGradeRow
    .getByRole('button', { name: 'Save grades' })
    .boundingBox()
  const overrideBounds = await overrideButton.boundingBox()
  expect(overrideBounds?.y).toBe(saveBounds?.y)
  await clickRecordAction(compactGradeRow, 'Override result')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Save decision' })).toBeDisabled()
  await dialog.getByLabel('Decision note (required)').fill('   ')
  await expect(dialog.getByRole('button', { name: 'Save decision' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(overrideButton).toBeFocused()
  await clickRecordAction(compactGradeRow, 'Override result')
  const decisionRequests: string[] = []
  await page.route('**/api/admin/enrollments/decision', async (route) => {
    decisionRequests.push(route.request().postDataJSON().requestId)
    if (decisionRequests.length === 1) return route.fulfill({ status: 500 })
    return route.fallback()
  })
  await dialog.getByLabel('Decision note (required)').fill('Reviewed')
  await dialog.getByRole('button', { name: 'Save decision' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Could not save decision')
  await expect(dialog.getByLabel('Decision note (required)')).toHaveValue('Reviewed')
  await dialog.getByRole('button', { name: 'Save decision' }).click()
  await expect(dialog).toBeHidden()
  expect(decisionRequests[0]).toBe(decisionRequests[1])
  await expect(compactGradeRow).toContainText('Effective: Pass')
  await expect(compactGradeRow).toHaveCSS('background-color', 'rgb(234, 247, 237)')
  await expect(compactGradeRow.locator('span.grade-pass').filter({ hasText: /^Pass$/ })).toHaveCSS(
    'color',
    'rgb(23, 101, 44)',
  )
  await page.reload()
  await expect(compactGradeRow).toContainText('Effective: Pass')
  await clickRecordAction(compactGradeRow, 'Override result')
  await page.getByRole('dialog').getByRole('combobox').selectOption('fail')
  await page
    .getByRole('dialog')
    .getByLabel('Decision note (required)')
    .fill('Reviewed failure\nSecond line')
  await page.getByRole('dialog').getByRole('button', { name: 'Save decision' }).click()
  await expect(compactGradeRow).toContainText('Effective: Fail')
  await expect(compactGradeRow).toHaveCSS('background-color', 'rgb(252, 238, 238)')
  await expect(compactGradeRow.locator('span.grade-fail')).toHaveCSS('color', 'rgb(161, 27, 27)')
  await clickRecordAction(compactGradeRow, 'Override result')
  await page.getByRole('dialog').getByRole('combobox').selectOption('calculated')
  await page.getByRole('dialog').getByLabel('Decision note (required)').fill('Restore')
  await page.getByRole('dialog').getByRole('button', { name: 'Save decision' }).click()
  await clickRecordAction(compactGradeRow, 'Override result')
  const storedDecisions = enrollmentSchema.parse(enrollments[0]).gradeDecisions
  const requestCount = decisionRequests.length
  await page.getByRole('dialog').getByText('Decision history').click()
  await expect(page.getByRole('dialog')).toContainText('Reviewed')
  await expect(page.getByRole('dialog')).toContainText('Restore')
  const history = dialog.locator('.decision-history')
  const decisions = history.locator('li')
  await expect(decisions).toHaveCount(3)
  await expect(decisions.nth(0)).toContainText('Calculated')
  await expect(decisions.nth(1)).toContainText('Fail')
  await expect(decisions.nth(1).locator('p')).toHaveText('Reviewed failure\nSecond line')
  await expect(decisions.nth(2)).toContainText('Pass')
  await expect(decisions.nth(2)).toContainText('Administrator name unavailable')
  await expect(decisions.nth(2)).not.toContainText('deleted-actor')
  await expect(decisions.nth(1).getByRole('link', { name: 'Other Admin' })).toHaveAttribute(
    'href',
    `?page=app&view=settings&account=${otherAdminId}`,
  )
  const time = decisions.first().locator('time')
  const timestamp = await time.getAttribute('datetime')
  expect(timestamp).toBeTruthy()
  const formatted = await time.evaluate((element) =>
    new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(element.getAttribute('datetime') ?? ''),
    ),
  )
  await expect(time).toHaveText(formatted)
  const actorLink = decisions.first().getByRole('link', { name: 'Updated Admin' })
  await expect(actorLink).toHaveAttribute('href', `?page=app&view=settings&account=${teacherId}`)
  await expect(decisions.first()).not.toContainText(teacherId)
  expect((await actorLink.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({
    path: `.artifacts/verification/admin-name-link-${testInfo.project.name}.png`,
  })
  board.accounts[0].profileName = '   '
  await actorLink.click()
  await expect(page.locator('.role-account strong')).toHaveText('Updated Admin')
  await expect(page.getByText('admin@example.test')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save role' })).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.role-account strong')).toHaveText('Updated Admin')
  await expect(page.getByText('admin@example.test')).toBeVisible()
  await page.goBack()
  await clickRecordAction(compactGradeRow, 'Override result')
  await page.getByRole('dialog').getByText('Decision history').click()
  const emailFallback = page.getByRole('dialog').getByRole('link', {
    name: 'other-admin@example.test',
  })
  await expect(emailFallback).toHaveAttribute(
    'href',
    `?page=app&view=settings&account=${otherAdminId}`,
  )
  await emailFallback.click()
  await expect(page.getByText('other-admin@example.test')).toBeVisible()
  await expect(page.getByLabel('Role')).toBeVisible()
  board.accounts[0].profileName = 'Other Admin'
  await page.goBack()
  await clickRecordAction(compactGradeRow, 'Override result')
  await page.getByRole('dialog').getByText('Decision history').click()
  expect(enrollmentSchema.parse(enrollments[0]).gradeDecisions).toEqual(storedDecisions)
  expect(decisionRequests).toHaveLength(requestCount)
  await page.screenshot({
    path: `.artifacts/verification/decision-history-desktop-en-${testInfo.project.name}.png`,
  })
  const resultCell = compactGradeRow.locator('td[data-label="Result"]')
  await expect(compactGradeRow.locator('td').first()).toHaveCSS('vertical-align', 'top')
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
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
  await expect(page.getByLabel('Course performance note: Synthetic Student')).toBeVisible()
  expect(
    (await page.getByLabel('Course performance note: Synthetic Student').boundingBox())?.width,
  ).toBeGreaterThanOrEqual(192)
  await clickAccountAction(page, '\u0627\u0644\u0639\u0631\u0628\u064a\u0629')
  await checkGradeSave('حفظ الدرجات')
  await checkGradeOrder('نظري', 'عملي')
  await expect(
    page.getByLabel(
      '\u0645\u0644\u0627\u062d\u0638\u0629 \u0623\u062f\u0627\u0621 \u0627\u0644\u062f\u0648\u0631\u0629: Synthetic Student',
    ),
  ).toBeVisible()
  await page.setViewportSize({ width: 320, height: 844 })
  await checkGradeSave('حفظ الدرجات')
  await checkGradeOrder('نظري', 'عملي')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const arabicOverride = recordActions(compactGradeRow)
  const mobileSaveBounds = await compactGradeRow
    .getByRole('button', { name: 'حفظ الدرجات' })
    .boundingBox()
  const mobileOverrideBounds = await arabicOverride.boundingBox()
  expect(mobileOverrideBounds?.y).toBe(mobileSaveBounds?.y)
  await clickRecordAction(compactGradeRow, 'تعديل النتيجة')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await dialog.locator('.decision-history > summary').click()
  await expect(dialog.locator('.decision-history li')).toHaveCount(3)
  await expect(dialog.getByRole('link', { name: 'Updated Admin' })).toBeVisible()
  const arabicTime = dialog.locator('.decision-history time').first()
  const arabicFormatted = await arabicTime.evaluate((element) =>
    new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(element.getAttribute('datetime') ?? ''),
    ),
  )
  await expect(arabicTime).toHaveText(arabicFormatted)
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({
    path: `.artifacts/verification/admin-name-link-320-ar-dark-${testInfo.project.name}.png`,
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('dialog').getByRole('button', { name: 'إلغاء' }).click()
  await expect(arabicOverride).toBeFocused()
  await clickAccountAction(page, 'English')
  await checkGradeSave('Save grades')
  await checkGradeOrder('Theory', 'Practical')
  await clickRecordAction(compactGradeRow, 'Override result')
  await page.getByRole('dialog').getByLabel('Decision note (required)').fill('x'.repeat(300))
  await page.getByRole('dialog').getByRole('button', { name: 'Save decision' }).click()
  await clickRecordAction(compactGradeRow, 'Override result')
  await page.getByRole('dialog').getByText('Decision history').click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(dialog.locator('.decision-history li').first().locator('p')).toHaveText(
    'x'.repeat(300),
  )
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (value) => document.documentElement.setAttribute('data-theme', value),
        theme,
      )
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      )
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
  }
  expect(await resultCell.evaluate((cell) => cell.scrollWidth <= cell.clientWidth)).toBe(true)
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
  await clickAccountAction(page, '\u0627\u0644\u0639\u0631\u0628\u064a\u0629')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await clickAccountAction(page, 'English')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  for (const width of [390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await clickAccountAction(page, '\u0627\u0644\u0639\u0631\u0628\u064a\u0629')
    await expect(
      page.getByLabel(
        '\u0645\u0644\u0627\u062d\u0638\u0629 \u0623\u062f\u0627\u0621 \u0627\u0644\u062f\u0648\u0631\u0629: Synthetic Student',
      ),
    ).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await clickAccountAction(page, 'English')
  }
  if (originalViewport) await page.setViewportSize(originalViewport)
  await clickRecordAction(compactGradeRow, 'Override result')
  await page.getByRole('dialog').getByRole('combobox').selectOption('calculated')
  await page
    .getByRole('dialog')
    .getByLabel('Decision note (required)')
    .fill('Resume calculated grading')
  await page.getByRole('dialog').getByRole('button', { name: 'Save decision' }).click()
  await expect(page.getByRole('button', { name: 'Close course' })).toBeDisabled()
  await expect(page.getByText('Unavailable', { exact: true })).toBeVisible()
  await page.getByLabel('Minimum attendance %').fill('60')
  await page.getByRole('button', { name: 'Save thresholds' }).click()
  await expect(page.getByLabel('Minimum attendance %')).toHaveValue('60')
  await page.getByLabel('Practical: Synthetic Student').fill('0')
  await page.getByLabel('Theory: Synthetic Student').fill('100')
  await page
    .getByLabel('Course performance note: Synthetic Student')
    .fill('First line\nSecond line')
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
  await expect(page.getByLabel('Course performance note: Synthetic Student')).toHaveValue(
    'First line\nSecond line',
  )
  await page.getByLabel('Course performance note: Synthetic Student').fill('')
  await compactGradeRow.getByRole('button', { name: 'Save grades' }).click()
  await expect.poll(() => enrollments[0].notes).toBe('')
  await page.reload()
  await expect(page.getByLabel('Course performance note: Synthetic Student')).toHaveValue('')
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
  await makeCurrent(page, 'Course A')
  const date = await page.getByLabel('Session date').inputValue()
  events.push({
    id: '50000000-0000-4000-8000-000000000001',
    actor: 'Admin',
    clientTime: new Date().toISOString(),
    receivedAt: '',
    payload: { kind: 'attendance', studentId, enrollmentId: enrollA, date, status: 'late' },
  })
  await page.reload()
  await expect(
    page.getByLabel('Attendance for Synthetic Student').getByRole('button', { pressed: true }),
  ).toHaveAccessibleName('present')
  const historyHeading = page.getByRole('heading', { name: 'History & corrections' })
  await expect(page.locator('.workspace-rail nav').getByText(/History/)).toHaveCount(0)
  await clickAccountAction(page, 'Settings')
  await page.getByRole('button', { name: 'History & corrections', exact: true }).click()
  await expect(historyHeading).toBeVisible()
  await expect(page).toHaveURL(/view=history/)
  await expect(page).toHaveURL(new RegExp(`course=${courseA}`))
  await page.reload()
  await expect(historyHeading).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await page.goForward()
  const legacyRecord = page.locator('li').filter({ hasText: 'Synthetic Student' })
  await expect(legacyRecord).toContainText('present')
  await clickRecordAction(legacyRecord, 'Record details')
  await expect(legacyRecord.locator('pre')).toContainText('"status": "late"')
  await clickRecordAction(legacyRecord, 'Record details')
  await expect(legacyRecord.locator('pre')).toBeHidden()
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await makeCurrent(page, 'Course B')
  await expect(
    page
      .getByRole('region', { name: 'Attendance list' })
      .getByRole('row')
      .filter({ hasText: 'Synthetic Student' })
      .getByRole('cell')
      .nth(2),
  ).toHaveText('Admin')
  await page
    .getByLabel('Attendance for Synthetic Student')
    .getByRole('button', { name: 'absent', exact: true })
    .click()
  await page.getByRole('button', { name: 'Save attendance (1)' }).click()
  await expect.poll(() => events.length).toBe(2)
  await makeCurrent(page, 'Course A')
  await expect(
    page.getByLabel('Attendance for Synthetic Student').getByRole('button', { pressed: true }),
  ).toHaveAccessibleName('present')
  await page.getByRole('button', { name: 'Courses', exact: true }).click()
  const courseRow = page.getByRole('row').filter({ hasText: 'Course A' })
  await clickRecordAction(courseRow, 'Close course')
  await expect(courseRow).toContainText('Closed')
  await clickAccountAction(page, 'العربية')
  await expect(courseRow).toContainText('مغلقة')
  if (testInfo.project.name === 'chromium') {
    await expect(recordActions(courseRow)).toHaveCount(0)
    await expect(courseRow.getByRole('button', { name: 'إعادة فتح الدورة' })).toHaveAttribute(
      'title',
      'إعادة فتح الدورة',
    )
  } else {
    await recordActions(courseRow).click()
  }
  await expect(courseRow.getByRole('button', { name: 'إعادة فتح الدورة' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.screenshot({
    path: `.artifacts/verification/closed-course-${testInfo.project.name}-ar.png`,
    fullPage: true,
  })
  await clickAccountAction(page, 'English')
  await page.reload()
  await expect(courseRow).toContainText('Closed')
  await clickRecordAction(courseRow, 'History')
  await expect(page.getByRole('status').filter({ hasText: 'This course is closed' })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`course=${courseA}`))
  await expect(
    page.locator('li').filter({ hasText: 'Synthetic Student' }).filter({ hasText: 'present' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await expect(page.getByLabel('Attendance for Synthetic Student')).toHaveCount(0)
  await page.getByRole('button', { name: 'Courses', exact: true }).click()
  await clickRecordAction(courseRow, 'Reopen course')
  await expect(courseRow).toContainText('Open')
  await clickRecordAction(courseRow, 'Grades')
  await expect(page.getByLabel('Practical: Synthetic Student')).toHaveValue('0')
  await expect(page.getByLabel('Theory: Synthetic Student')).toHaveValue('100')
  const gradeRow = page.getByRole('row').filter({ hasText: 'Synthetic' })
  const calculatedResult = gradeRow
    .locator('td[data-label="Result"], td[data-label="النتيجة"]')
    .locator('div > span')
    .first()
  await expect(gradeRow).toContainText('100.0%')
  await expect(calculatedResult).toHaveText('Fail')
  await expect(gradeRow).not.toContainText('Practical grade below passing')
  await expect(gradeRow).not.toContainText('Insufficient attendance')
  await expect(gradeRow).toHaveCSS('background-color', 'rgb(252, 238, 238)')
  await expect(page.getByLabel('Practical: Synthetic Student')).toHaveCSS(
    'color',
    'rgb(161, 27, 27)',
  )
  await expect(page.getByLabel('Theory: Synthetic Student')).toHaveCSS('color', 'rgb(23, 101, 44)')
  await page.getByLabel('Practical: Synthetic Student').fill('80')
  await expect(calculatedResult).toHaveText('Pending')
  await expect(gradeRow).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(page.getByLabel('Practical: Synthetic Student')).not.toHaveCSS(
    'color',
    'rgb(23, 101, 44)',
  )
  await expect(gradeRow).not.toContainText('Practical grade below passing')
  await expect(page.getByRole('button', { name: 'Close course' })).toBeDisabled()
  await page.getByLabel('Practical: Synthetic Student').fill('101')
  await expect(page.getByLabel('Practical: Synthetic Student')).not.toHaveCSS(
    'color',
    'rgb(23, 101, 44)',
  )
  await page.getByLabel('Practical: Synthetic Student').fill('80')
  let releaseGradeSave = () => {}
  const heldGradeSave = new Promise<void>((resolve) => {
    releaseGradeSave = resolve
  })
  await page.route(
    '**/api/admin/enrollments/grades',
    async (route) => {
      await heldGradeSave
      await route.fallback()
    },
    { times: 1 },
  )
  await gradeRow.getByRole('button', { name: 'Save grades' }).click()
  await expect(calculatedResult).toHaveText('Pending')
  releaseGradeSave()
  await expect(calculatedResult).toHaveText('Pass')
  await expect.poll(() => enrollments[0].practical).toBe(80)
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
  await expect(calculatedResult).toHaveText('Fail')
  await expect(gradeRow).not.toContainText('Insufficient attendance')
  await expect(gradeRow).not.toContainText('Practical grade below passing')
  await expect(gradeRow.getByText('50.0%')).toHaveCSS('color', 'rgb(161, 27, 27)')
  await clickRecordAction(gradeRow, 'Override result')
  await page.getByRole('dialog').getByRole('combobox').selectOption('pass')
  await page.getByRole('dialog').getByLabel('Decision note (required)').fill('Attendance reviewed')
  await page.getByRole('dialog').getByRole('button', { name: 'Save decision' }).click()
  await expect(gradeRow).toContainText('Calculated: Fail')
  await expect(gradeRow).toContainText('Effective: Pass')
  await expect(gradeRow).toHaveCSS('background-color', 'rgb(234, 247, 237)')
  await expect(gradeRow.getByText('50.0%')).toHaveCSS('color', 'rgb(161, 27, 27)')
  await expect(gradeRow).not.toContainText('Insufficient attendance')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await clickRecordAction(gradeRow, 'Override result')
  await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(25, 59, 66)')
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
  await expect(gradeRow).toHaveCSS('background-color', 'rgb(32, 77, 64)')
  await expect(gradeRow.getByText('50.0%')).toHaveCSS('color', 'rgb(255, 193, 197)')
  await expect(page.getByLabel('Practical: Synthetic Student')).toHaveCSS(
    'color',
    'rgb(181, 239, 210)',
  )
  await page.screenshot({
    path: `.artifacts/verification/grade-pass-dark-${testInfo.project.name}.png`,
    fullPage: true,
  })
  await clickRecordAction(gradeRow, 'Override result')
  await page.getByRole('dialog').getByRole('combobox').selectOption('calculated')
  await page
    .getByRole('dialog')
    .getByLabel('Decision note (required)')
    .fill('Restore calculated attendance')
  await page.getByRole('dialog').getByRole('button', { name: 'Save decision' }).click()
  await expect(gradeRow).toHaveCSS('background-color', 'rgb(88, 47, 53)')
  await clickAccountAction(page, 'العربية')
  await page.setViewportSize({ width: 320, height: 844 })
  await expect(gradeRow).not.toContainText('الحضور أقل من الحد الأدنى')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: `.artifacts/verification/grade-fail-dark-${testInfo.project.name}-ar.png`,
    fullPage: true,
  })
  await clickAccountAction(page, 'English')
  if (originalViewport) await page.setViewportSize(originalViewport)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(gradeRow).toHaveCSS('background-color', 'rgb(252, 238, 238)')
  await page.getByLabel('Practical: Synthetic Student').fill('0')
  await page.getByLabel('Theory: Synthetic Student').fill('0')
  await gradeRow.getByRole('button', { name: 'Save grades' }).click()
  await expect(gradeRow).not.toContainText('Insufficient attendance')
  await expect(gradeRow).not.toContainText('Practical grade below passing')
  await expect(gradeRow).not.toContainText('Theory grade below passing')
  await page.screenshot({
    path: `.artifacts/verification/grade-failure-${testInfo.project.name}-en.png`,
    fullPage: true,
  })
  await clickAccountAction(page, 'العربية')
  await expect(gradeRow).not.toContainText('الحضور أقل من الحد الأدنى')
  await expect(gradeRow).not.toContainText('الدرجة العملية أقل من حد النجاح')
  await expect(gradeRow).not.toContainText('الدرجة النظرية أقل من حد النجاح')
  await page.setViewportSize({ width: 320, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: `.artifacts/verification/grade-failure-${testInfo.project.name}-ar.png`,
    fullPage: true,
  })
  await clickAccountAction(page, 'English')
  await page.getByLabel('Practical: Synthetic Student').fill('80')
  await page.getByLabel('Theory: Synthetic Student').fill('80')
  await gradeRow.getByRole('button', { name: 'Save grades' }).click()
  await page.getByLabel('Minimum attendance %').fill('50')
  await expect(calculatedResult).toHaveText('Pending')
  await expect(gradeRow).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(gradeRow.getByText('50.0%')).not.toHaveCSS('color', 'rgb(161, 27, 27)')
  await expect(page.getByLabel('Practical: Synthetic Student')).not.toHaveCSS(
    'color',
    'rgb(23, 101, 44)',
  )
  await page.getByRole('button', { name: 'Save thresholds' }).click()
  await expect(calculatedResult).toHaveText('Pass')
  await expect(gradeRow).toHaveCSS('background-color', 'rgb(234, 247, 237)')
  await expect(gradeRow.locator('span.grade-pass').filter({ hasText: /^Pass$/ })).toHaveCSS(
    'color',
    'rgb(23, 101, 44)',
  )
  await expect(gradeRow.getByText('50.0%')).toHaveCSS('color', 'rgb(23, 101, 44)')
  await expect(page.getByLabel('Practical: Synthetic Student')).toHaveCSS(
    'color',
    'rgb(23, 101, 44)',
  )
  await page.getByLabel('Course performance note: Synthetic Student').fill('Draft note')
  await expect(calculatedResult).toHaveText('Pending')
  await expect(gradeRow).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await page.getByLabel('Course performance note: Synthetic Student').fill('')
  await expect(calculatedResult).toHaveText('Pass')
  await clickAccountAction(page, 'العربية')
  await expect(page.getByLabel('الحد الأدنى للحضور %')).toHaveValue('50')
  await expect(calculatedResult).toHaveText('ناجح')
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
  await clickRecordAction(courseRow, 'Reopen course')
  await expect(courseRow).toContainText('Open')
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await makeCurrent(page, 'Course A')
  await expect(page.getByLabel('Attendance for Synthetic Student')).toBeVisible()
  await page.getByRole('button', { name: 'Courses', exact: true }).click()
  await clickRecordAction(courseRow, 'Manage students')
  await page.getByRole('switch', { name: 'Enrolled: Synthetic Student' }).click()
  await expect.poll(() => enrollments[0].active).toBe(false)
  await clickAccountAction(page, 'Settings')
  await page.getByRole('button', { name: 'History & corrections', exact: true }).click()
  const presentRecord = page
    .locator('li')
    .filter({ hasText: 'Synthetic Student' })
    .filter({ hasText: 'present' })
  await expect(presentRecord).toBeVisible()
  await clickRecordAction(presentRecord, 'Undo')
  await page.getByLabel('Reason').fill('Correct historical attendance')
  await page.getByRole('button', { name: 'Append correction' }).click()
  await expect(presentRecord).toContainText('Undone')
  expect(events.at(-1)).toMatchObject({
    payload: { kind: 'reversal', targetId: '50000000-0000-4000-8000-000000000001' },
  })
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
              : new URL(route.request().url()).pathname === '/api/admin'
                ? { accounts: [], teachers: [], students: [] }
                : { teacher, students, courses, enrollments, events: historyEvents },
        }),
  )
  await page.goto('/?page=app&tab=roster')
  const rows = page.locator('.roster-table tbody tr'),
    count = page.locator('.workspace-count strong')
  await expect(rows).toHaveCount(3)
  await expect(page.locator('.workspace-course-name')).toHaveText('All students')
  await page.locator('.workspace-course-switcher summary').click()
  await expect(
    page
      .locator('.workspace-course-menu')
      .getByRole('button', { name: 'All students', exact: true }),
  ).toBeVisible()
  await page.locator('.workspace-course-switcher summary').click()
  const historical = rows.filter({ hasText: 'Historical Student' })
  const unassigned = rows.filter({ hasText: 'Unassigned Historical' })
  await expect(unassigned.locator('td[data-label="Courses"]')).toHaveText('None')
  await expect(unassigned.locator('td[data-label="Attendance"]')).toHaveText('Not recorded')
  await expect(historical.locator('td[data-label="Attendance"]')).toContainText('50.0%')
  await expect(historical.locator('td[data-label="Attendance"]')).toContainText(
    'Recorded sessions: 2',
  )
  await historical.getByRole('button', { name: 'Open student' }).click()
  const detail = page.locator('.student-details')
  await expect(detail.getByText('Not provided')).toBeVisible()
  await expect(
    detail.getByText('Recorded sessions', { exact: true }).locator('..').locator('dd'),
  ).toHaveText('2')
  await expect(detail.getByText('50.0%', { exact: true })).toBeVisible()
  await expect(detail.getByRole('button', { name: 'Take attendance' })).toHaveCount(0)
  await expect(
    detail.getByRole('region', { name: 'Attendance history' }).locator('tbody tr'),
  ).toHaveCount(2)
  await page.reload()
  await expect(detail.getByText('50.0%', { exact: true })).toBeVisible()
  await selectCourse(page, 'Synthetic Course')
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
  await selectCourse(page, 'Synthetic Course')
  await expect(rows).toHaveCount(1)
  await expect(count).toHaveText('1')
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await expect(page.getByLabel('Attendance for Historical Student')).toHaveCount(0)
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await selectCourse(page, 'All students')
  await expect(rows).toHaveCount(3)
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(count).toHaveText('1')
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await selectCourse(page, 'All students')
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
  await expect(page.locator('.workspace-rail nav').getByText('السجل')).toHaveCount(0)
  await clickAccountAction(page, 'الإعدادات')
  await page.getByRole('button', { name: 'السجل والتصحيحات' }).click()
  await expect(page.getByRole('heading', { name: 'السجل والتصحيحات' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'ابحث عن طالب' }).fill('Historical Student')
  await expect(page.locator('li').filter({ hasText: 'Historical Student' })).toContainText(
    '2026-01-03',
  )
  await clickRecordAction(page.locator('li').filter({ hasText: 'Historical Student' }), 'تراجع')
  await expect(page.getByLabel('السبب', { exact: true })).toBeVisible()
  await selectCourse(page, 'Closed Course')
  await expect(page.getByLabel('السبب', { exact: true })).toHaveCount(0)
  await expect(page.locator('li').filter({ hasText: 'Historical Student' })).toContainText(
    '2026-01-02',
  )
  await expect(page.getByText('2026-01-03', { exact: false })).toHaveCount(0)
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.screenshot({
    path: `.artifacts/verification/history-settings-${testInfo.project.name}-ar.png`,
  })
  await page.getByRole('button', { name: 'العودة إلى الإعدادات' }).click()
  await expect(page.getByRole('heading', { name: 'الإعدادات', exact: true })).toBeVisible()
  await page.goto(`/?page=app&tab=history&course=${courseB}`)
  await expect(page.getByRole('heading', { name: 'السجل والتصحيحات' })).toBeVisible()
  await expect(page).toHaveURL(/view=history/)
  await expect(page).toHaveURL(new RegExp(`course=${courseB}`))
})
