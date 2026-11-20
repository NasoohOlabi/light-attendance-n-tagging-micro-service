import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { makeEvent } from '../shared/ledger'
import { neonAdminBoardSchema, neonSnapshotSchema } from '../shared/neon'
import { clickAccountAction } from './profileActions'

test.use({ trace: 'off' })
const actorId = '10000000-0000-4000-8000-000000000001'
const courseId = '30000000-0000-4000-8000-000000000001'
const studentIds = [1, 2, 3, 4, 5, 6].map((n) => `20000000-0000-4000-8000-00000000000${n}`)
const scores: (number | null)[] = [2, 10, 100, 0, null]

async function syntheticTables(
  page: Page,
  role: 'administrator' | 'student' = 'administrator',
  courseName = 'Alpha course',
  resultScenario = false,
) {
  const students = (
    resultScenario
      ? ['Zulu', 'Alpha', 'Charlie', 'Delta', 'Echo', 'Foxtrot']
      : ['Zulu', 'Alpha', 'Charlie', 'Delta', 'Echo']
  ).map((firstName, index) => ({
    kind: 'student',
    studentId: studentIds[index],
    name: `${firstName} Family`,
    firstName,
    lastName: index === 4 ? 'Alpha Family' : 'Family',
    group: index === 0 ? '1.0' : String(index + 1),
    active: true,
    teacherId: actorId,
    whatsapp: index === 4 ? null : `00123${index}`,
    location: 'Synthetic location',
    birthYear: index === 4 ? null : 2000 + index,
  }))
  const enrollments = students.map((student, index) => ({
    id: `40000000-0000-4000-8000-00000000000${index + 1}`,
    courseId,
    studentId: student.studentId,
    level: index === 4 ? '' : index === 0 ? '2.00' : String(index + 1),
    practical: resultScenario
      ? ([90.5, 85, 100, 0, null, 0][index] ?? null)
      : (scores[index] ?? null),
    theory: resultScenario ? [90, 85, 100, 0, 100, 0][index] : 100,
    active: index !== 4,
    handbookReceived: index % 2 === 0,
  }))
  students.push({
    kind: 'student',
    studentId: '20000000-0000-4000-8000-000000000007',
    name: 'Historical Family',
    firstName: 'Historical',
    lastName: 'Family',
    group: '',
    active: false,
    teacherId: actorId,
    whatsapp: null,
    location: '',
    birthYear: null,
  })
  const teacher = {
    role: 'administrator',
    id: actorId,
    name: 'Synthetic Admin',
    canRead: true,
    canWrite: true,
    expiresAt: null,
  }
  const board = neonAdminBoardSchema.parse({
    accounts: [],
    teachers: [{ teacherId: actorId, name: 'Synthetic teacher', active: true }],
    students,
  })
  const snapshot = neonSnapshotSchema.parse({
    teacher,
    students,
    enrollments,
    courses: [
      { id: '30000000-0000-4000-8000-000000000002', name: 'Zebra course', open: false },
      { id: courseId, name: courseName, open: true },
    ],
    events: enrollments.flatMap((entry) =>
      resultScenario && entry.studentId === studentIds[5]
        ? []
        : ['2026-11-12', '2026-11-13', '2026-11-14'].map((date, index) =>
            makeEvent('synthetic-table-check', {
              kind: 'attendance',
              studentId: entry.studentId,
              enrollmentId: entry.id,
              date,
              status: resultScenario
                ? entry.studentId === studentIds[2]
                  ? 'absent'
                  : 'present'
                : index === 2
                  ? 'absent'
                  : 'present',
            }),
          ),
    ),
  })
  const writes: string[] = []
  await page.route('**/api/**', async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    if (req.method() !== 'GET') writes.push(path)
    if (path.startsWith('/api/auth/')) {
      const now = new Date().toISOString()
      return route.fulfill({
        json: {
          user: {
            id: actorId,
            name: 'Synthetic user',
            email: 'tables@example.test',
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
          },
          session: {
            id: 'synthetic-session',
            userId: actorId,
            token: 'synthetic',
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            createdAt: now,
            updatedAt: now,
          },
        },
      })
    }
    if (path === '/api/me')
      return route.fulfill({
        json: {
          account:
            role === 'administrator'
              ? teacher
              : {
                  role,
                  id: studentIds[0],
                  name: 'Synthetic student',
                  canRead: true,
                  canWrite: false,
                  expiresAt: null,
                },
        },
      })
    if (path === '/api/notebook') return route.fulfill({ json: snapshot })
    if (path === '/api/admin') return route.fulfill({ json: board })
    if (path === '/api/student/attendance')
      return route.fulfill({
        json: {
          student: { studentId: studentIds[0], name: 'Synthetic student', group: '1.0' },
          attendance: [
            { date: '2026-11-14', status: 'absent', course: 'Zebra course' },
            { date: '2026-11-12', status: 'present', course: 'Alpha course' },
            { date: '2026-11-13', status: 'excused', course: 'Alpha course' },
          ],
        },
      })
    return route.fulfill({ status: 501, json: { error: 'Unexpected synthetic request' } })
  })
  return { writes, snapshot }
}

async function everyColumn(table: Locator, count: number, actions = false, filters = true) {
  await expect(table).toBeVisible()
  const page = table.page()
  const toolbar = page.locator('.table-toolbar')
  const sort = toolbar.getByRole('button', { name: 'Sort options' })
  const filter = toolbar.getByRole('button', { name: 'Filter options' })
  const headers = table.locator('thead th[aria-sort]')
  await expect(headers).toHaveCount(count)
  await expect(table.locator('caption')).toHaveCount(0)
  await expect(filter).toHaveCount(filters ? 1 : 0)
  for (const trigger of await toolbar.locator('.table-control-trigger').all()) {
    const bounds = await trigger.boundingBox()
    expect(bounds?.width).toBeGreaterThanOrEqual(44)
    expect(bounds?.height).toBeGreaterThanOrEqual(44)
  }
  if ((page.viewportSize()?.width ?? 0) <= 1024) {
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 })
      const geometry = await table.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return {
          scroll: element.scrollWidth,
          client: element.clientWidth,
          overflow: [...element.querySelectorAll('*')].flatMap((child) => {
            const rect = child.getBoundingClientRect()
            return rect.width > 0 &&
              rect.height > 0 &&
              (rect.right > bounds.right + 1 || rect.left < bounds.left - 1)
              ? [
                  {
                    tag: child.tagName,
                    className: child.className,
                    left: rect.left,
                    right: rect.right,
                  },
                ]
              : []
          }),
        }
      })
      expect(geometry.scroll, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.client + 1)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true)
    }
    if (await table.evaluate((element) => element.classList.contains('mobile-record-table'))) {
      await expect(table.locator('thead')).toBeHidden()
      await sort.click()
      const labels = await headers.evaluateAll((items) =>
        items.map((item) => item.getAttribute('aria-label')),
      )
      await expect(page.getByLabel('Add column').locator('option:not([disabled])')).toHaveText(
        labels.map((label) => label ?? ''),
      )
      await page.keyboard.press('Escape')
      if (filters) {
        await filter.click()
        await expect(page.getByLabel('Add filter').locator('option:not([disabled])')).toHaveCount(
          count,
        )
        await page.keyboard.press('Escape')
      }
      return
    }
  }
  for (const header of await headers.all()) {
    const button = header.locator('.table-sort')
    const bounds = await button.boundingBox()
    expect(bounds?.width).toBeGreaterThanOrEqual(44)
    expect(bounds?.height).toBeGreaterThanOrEqual(44)
    await button.click()
    await expect(header).toHaveAttribute('aria-sort', 'ascending')
    await button.click()
    await expect(header).toHaveAttribute('aria-sort', 'descending')
    await button.click()
    await expect(header).toHaveAttribute('aria-sort', 'none')
  }
  if (actions) await expect(table.locator('thead th').last().getByRole('button')).toHaveCount(0)
}

async function sortFromToolbar(
  page: Page,
  {
    column,
    descending = false,
    ar = false,
  }: { column: string; descending?: boolean; ar?: boolean },
) {
  await page.getByRole('button', { name: ar ? 'خيارات الفرز' : 'Sort options' }).click()
  if (descending) {
    await page
      .getByRole('button', { name: ar ? 'اتجاه الفرز 1: تصاعدي' : 'Sort direction 1: Ascending' })
      .click()
  } else {
    await page.getByLabel(ar ? 'إضافة عمود' : 'Add column').selectOption(column)
  }
  await page.keyboard.press('Escape')
}

test('whole decimal levels display consistently and retain raw edit values', async ({ page }) => {
  const { writes } = await syntheticTables(page)
  await page.goto('/?page=app&tab=roster')
  await expect(
    page.locator('tbody tr').filter({ hasText: 'Zulu' }).locator('td').nth(4),
  ).toHaveText('1')
  await page.goto(`/?page=app&view=student&student=${studentIds[0]}`)
  await expect(
    page
      .locator('dl div')
      .filter({ has: page.locator('dt', { hasText: /^Level$/ }) })
      .locator('dd'),
  ).toHaveText('1')
  await page.goto(`/?page=app&view=courses&course=${courseId}&courseView=students`)
  const row = page.locator('tbody tr').filter({ hasText: 'Zulu' })
  await expect(row.locator('td').nth(2)).toHaveText('1')
  const input = row.getByLabel('Course level: Zulu Family')
  await expect(input).toHaveValue('2')
  await input.focus()
  await expect(input).toHaveValue('2.00')
  await input.blur()
  await expect(input).toHaveValue('2')
  await page.goto(`/?page=app&view=courses&course=${courseId}&courseView=grades`)
  await expect(
    page.locator('tbody tr').filter({ hasText: 'Zulu' }).locator('td').nth(2),
  ).toHaveText('2')
  await expect(page.getByRole('button', { name: 'Sort by Enrolled' })).toHaveCount(0)
  await expect(page.locator('tbody tr')).toHaveCount(5)
  expect(writes).toEqual([])
})

test('every staff table column sorts and filters without writes', async ({ page }, testInfo) => {
  const { writes } = await syntheticTables(page)
  for (const [query, columns, actions] of [
    ['view=courses', 2, true],
    [`view=courses&course=${courseId}&courseView=students`, 7, true],
    [`view=courses&course=${courseId}&courseView=grades`, 8, true],
    ['tab=roster', 7, true],
    [`view=student&student=${studentIds[0]}`, 3, false],
    [`tab=attendance&course=${courseId}`, 4, false],
    [`tab=attendance&course=${courseId}&q=Alpha`, 4, false],
    [`tab=summary&course=${courseId}`, 5, false],
  ] satisfies [string, number, boolean][]) {
    await page.goto(`/?page=app&${query}`)
    await everyColumn(
      page.locator('table').first(),
      columns,
      actions,
      !query.includes('courseView=grades'),
    )
  }
  for (const raw of [
    '{broken',
    JSON.stringify({
      courses: {
        sorting: [{ id: 'removed-column', desc: true }],
        filters: [{ id: 'removed-column', value: 'hidden' }],
      },
    }),
  ]) {
    await page.goto(`/?page=app&view=courses&tables=${encodeURIComponent(raw)}`)
    await expect(page.locator('table tbody tr')).toHaveCount(2)
    await expect(page.locator('thead th[aria-sort="none"]')).toHaveCount(2)
  }
  await page.goto('/?page=app&view=settings')
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('link', { name: 'Students' })
    .click()
  const table = page.locator('table')
  await everyColumn(table, 8, true)
  await page.getByRole('button', { name: 'Filter options' }).click()
  await expect(page.getByRole('dialog', { name: 'Filter options' })).toBeVisible()
  await page.getByLabel('Add filter').selectOption({ label: 'Active' })
  await page.getByLabel('Filter Active', { exact: true }).selectOption({ label: 'Active' })
  await expect(table.locator('tbody tr')).toHaveCount(5)
  await clickAccountAction(page, 'العربية')
  await expect(table.locator('tbody tr')).toHaveCount(5)
  await page.getByRole('button', { name: 'خيارات التصفية' }).click()
  await expect(page.getByLabel('تصفية الحالة', { exact: true })).toHaveValue('1')
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({
    path: `.artifacts/verification/filter-popup-ar-${testInfo.project.name}.png`,
  })
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  }
  expect(writes).toEqual([])
})

test('wide student details show attendance history alongside the overview', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  const { writes } = await syntheticTables(page)
  await page.setViewportSize({ width: 1920, height: 560 })
  await page.goto('/?page=app&tab=roster')
  const student = page.locator('.roster-students-table tbody tr').filter({ hasText: 'Zulu' })
  await student.getByRole('button', { name: 'Open student', exact: true }).click()
  const details = page.locator('.student-details')
  await mkdir('.artifacts/verification', { recursive: true })
  for (const ar of [false, true]) {
    if (ar) await clickAccountAction(page, 'العربية')
    const overview = details.getByRole('heading', {
      name: ar ? 'معلومات الطالب' : 'Student information',
    })
    const history = details.getByRole('region', {
      name: ar ? 'سجل الحضور' : 'Attendance history',
    })
    const rows = history.locator('tbody tr')
    const firstName = details.getByText('Zulu', { exact: true })
    await expect(rows).toHaveCount(3)
    for (const width of [1920, 2560]) {
      await page.setViewportSize({ width, height: 560 })
      await expect(rows.first()).toBeInViewport({ ratio: 1 })
      const misalignment = await firstName.evaluate((value, rtl) => {
        const label = value.previousElementSibling
        if (!label) throw new Error('First name label is missing')
        const range = document.createRange()
        range.selectNodeContents(label)
        const labelBounds = range.getBoundingClientRect()
        range.selectNodeContents(value)
        const valueBounds = range.getBoundingClientRect()
        return rtl ? valueBounds.right - labelBounds.right : valueBounds.left - labelBounds.left
      }, ar)
      expect(Math.abs(misalignment)).toBeLessThan(2)
      const profileBounds = await details.locator('.student-details-overview').boundingBox()
      const titleBounds = await overview.boundingBox()
      const historyBounds = await history.boundingBox()
      if (!profileBounds || !titleBounds || !historyBounds)
        throw new Error('Student details are hidden')
      expect(historyBounds.width).toBeGreaterThan(profileBounds.width * 2)
      expect(historyBounds.y - titleBounds.y).toBeLessThan(80)
      if (ar) expect(historyBounds.x + historyBounds.width).toBeLessThan(profileBounds.x)
      else expect(historyBounds.x).toBeGreaterThan(profileBounds.x + profileBounds.width)
    }
    await expect(
      details.getByRole('button', { name: ar ? 'تعديل الطالب' : 'Edit student' }),
    ).toBeVisible()
    const sort = history.getByRole('button', { name: ar ? 'ترتيب حسب التاريخ' : 'Sort by Date' })
    await sort.click()
    await expect(rows.first().locator('td').first()).toHaveText('2026-11-12')
    await sort.click()
    await expect(rows.first().locator('td').first()).toHaveText('2026-11-14')
    await sort.click()
    await page.screenshot({
      path: `.artifacts/verification/student-detail-wide-${ar ? 'ar' : 'en'}.png`,
    })
  }
  await details.getByRole('button', { name: 'عودة', exact: true }).click()
  await expect(student).toBeVisible()
  expect(writes).toEqual([])
})

test('compact roster opens by student name and sorts from its toolbar', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile')
  const { writes } = await syntheticTables(page)
  await page.goto('/?page=app&tab=roster')
  const table = page.locator('.roster-students-table')
  const rows = table.locator('tbody tr')
  for (const ar of [false, true]) {
    if (ar) await clickAccountAction(page, 'العربية')
    const title = page.getByRole('heading', { name: ar ? 'طلابك' : 'Your students' })
    const sort = page.getByRole('button', { name: ar ? 'خيارات الفرز' : 'Sort options' })
    const filter = page.getByRole('button', { name: ar ? 'خيارات التصفية' : 'Filter options' })
    await expect(table.locator('thead')).toBeHidden()
    await expect(table.locator('caption')).toHaveCount(0)
    const first = rows.first()
    const open = first.getByRole('button', {
      name: ar ? 'فتح الطالب: Zulu Family' : 'Open student: Zulu Family',
    })
    await expect(open).toHaveText('Zulu Family')
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 })
      const heading = await title.boundingBox()
      const name = await open.boundingBox()
      const attendance = await first.locator('td[data-label]').nth(3).boundingBox()
      if (!heading || !name || !attendance)
        throw new Error('Roster title or student fields are hidden')
      expect(name.height).toBeGreaterThanOrEqual(44)
      expect(name.y + name.height).toBeLessThanOrEqual(attendance.y)
      for (const control of [sort, filter]) {
        const button = await control.boundingBox()
        if (!button) throw new Error('Roster toolbar control is hidden')
        expect(button.height).toBeGreaterThanOrEqual(44)
        expect(button.width).toBeGreaterThanOrEqual(44)
        expect(button.y).toBeLessThan(heading.y + heading.height)
        if (ar) expect(button.x + button.width).toBeLessThanOrEqual(heading.x)
        else expect(button.x).toBeGreaterThanOrEqual(heading.x + heading.width)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
    }
    if (ar) {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.emulateMedia({ colorScheme: 'dark' })
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await title.evaluate((heading) => heading.closest('section')?.scrollIntoView())
      await mkdir('.artifacts/verification', { recursive: true })
      await page.screenshot({ path: '.artifacts/verification/compact-roster-ar.png' })
    }
    await open.click()
    await expect(
      page.getByRole('heading', { name: ar ? 'معلومات الطالب' : 'Student information' }),
    ).toBeVisible()
    const details = page.locator('.student-details')
    const courses = details.getByRole('heading', { name: ar ? 'الدورات' : 'Courses' })
    const history = details.getByRole('region', { name: ar ? 'سجل الحضور' : 'Attendance history' })
    await expect(history.locator('tbody tr')).toHaveCount(3)
    await expect(history.locator('thead')).toBeHidden()
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 })
      const coursesBounds = await courses.boundingBox()
      const historyBounds = await history.boundingBox()
      if (!coursesBounds || !historyBounds) throw new Error('Student details are hidden')
      expect(historyBounds.y).toBeGreaterThan(coursesBounds.y + coursesBounds.height)
      expect(await history.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
        historyBounds.width + 1,
      )
    }
    await page.goBack()
    await sort.click()
    const columns = page.getByLabel(ar ? 'إضافة عمود' : 'Add column', { exact: true })
    await expect(columns.locator('option:not([disabled])')).toHaveCount(7)
    await columns.selectOption('first')
    await page.keyboard.press('Escape')
    await expect(rows.first().locator('.roster-mobile-open')).toHaveText('Alpha Family')
    await page.reload()
    await expect(rows.first().locator('.roster-mobile-open')).toHaveText('Alpha Family')
    await filter.click()
    const filters = page.getByLabel(ar ? 'إضافة تصفية' : 'Add filter', { exact: true })
    await expect(filters.locator('option:not([disabled])')).toHaveCount(7)
    await filters.selectOption('first')
    await page
      .getByRole('searchbox', { name: ar ? 'تصفية الاسم الأول' : 'Filter First name' })
      .fill('Zlu')
    await page.getByRole('button', { name: ar ? 'إغلاق' : 'Close', exact: true }).click()
    await expect(rows).toHaveCount(1)
    await expect(rows.first().locator('.roster-mobile-open')).toHaveText('Zulu Family')
    await sort.click()
    await page
      .getByRole('button', { name: ar ? 'مسح الفرز والتصفية' : 'Clear sort and filters' })
      .click()
    await page.keyboard.press('Escape')
    await expect(rows).toHaveCount(6)
  }
  expect(writes).toEqual([])
})

test('attendance shares the table toolbar and leads with student names on phones', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile')
  const { writes } = await syntheticTables(page)
  await page.goto(`/?page=app&tab=attendance&course=${courseId}`)
  const table = page.getByRole('region', { name: /Attendance list|قائمة الحضور/ })
  const row = table.locator('tbody tr').first()
  const toolbar = page.locator('.table-toolbar')
  for (const ar of [false, true]) {
    if (ar) await clickAccountAction(page, 'العربية')
    const heading = toolbar.getByRole('heading')
    const title = row.locator('.record-title')
    const level = row.locator('td').nth(1)
    const segments = row.getByRole('group').getByRole('button')
    const note = row.getByRole('button', { name: /Add note for|إضافة ملاحظة للطالب/ })
    await expect(title).toHaveText('Alpha Family')
    await expect(table.locator('thead')).toBeHidden()
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 })
      const titleBox = await heading.boundingBox()
      const nameBox = await title.boundingBox()
      const levelBox = await level.boundingBox()
      if (!titleBox || !nameBox || !levelBox)
        throw new Error('Attendance heading or name is hidden')
      expect(nameBox.y + nameBox.height).toBeLessThanOrEqual(levelBox.y)
      for (const trigger of await toolbar.locator('.table-control-trigger').all()) {
        const bounds = await trigger.boundingBox()
        if (!bounds) throw new Error('Attendance table control is hidden')
        expect(bounds.width).toBeGreaterThanOrEqual(44)
        expect(bounds.height).toBeGreaterThanOrEqual(44)
        expect(
          Math.abs(bounds.y + bounds.height / 2 - titleBox.y - titleBox.height / 2),
        ).toBeLessThan(2)
        if (ar) expect(bounds.x + bounds.width).toBeLessThanOrEqual(titleBox.x)
        else expect(bounds.x).toBeGreaterThanOrEqual(titleBox.x + titleBox.width)
      }
      await expect(segments).toHaveCount(3)
      const noteBox = await note.boundingBox()
      if (!noteBox) throw new Error('Attendance note button is hidden')
      for (const control of [...(await segments.all()), note]) {
        const bounds = await control.boundingBox()
        if (!bounds) throw new Error('Attendance row control is hidden')
        expect(bounds.width).toBeGreaterThanOrEqual(44)
        expect(bounds.height).toBeGreaterThanOrEqual(44)
        expect(
          Math.abs(bounds.y + bounds.height / 2 - noteBox.y - noteBox.height / 2),
        ).toBeLessThan(2)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await toolbar.evaluate((element) => element.closest('section')?.scrollIntoView())
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({ path: '.artifacts/verification/attendance-table-toolbar-ar.png' })
  expect(writes).toEqual([])
})

test('course list controls share the heading row at the opposite edge', async ({
  page,
}, testInfo) => {
  const { writes } = await syntheticTables(page)
  await page.goto('/?page=app&view=courses')
  const table = page.locator('.course-list-table')
  const widths = testInfo.project.name === 'mobile' ? [320, 390, 430] : [1280]
  for (const ar of [false, true]) {
    if (ar) await clickAccountAction(page, 'العربية')
    const title = page.getByRole('heading', { name: ar ? 'الدورات' : 'Courses', exact: true })
    const filter = page.getByRole('button', { name: ar ? 'خيارات التصفية' : 'Filter options' })
    const sort = page.getByRole('button', { name: ar ? 'خيارات الفرز' : 'Sort options' })
    const create = page.getByRole('button', { name: ar ? 'إنشاء دورة' : 'Create course' })
    await expect(title).toBeVisible()
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 })
      const heading = await title.boundingBox()
      const createButton = await create.boundingBox()
      if (!heading || !createButton) throw new Error('Courses heading or Create course is hidden')
      for (const trigger of [filter, sort]) {
        const button = await trigger.boundingBox()
        if (!button) throw new Error('Course table control is hidden')
        expect(button.width).toBeGreaterThanOrEqual(44)
        expect(button.height).toBeGreaterThanOrEqual(44)
        expect(button.y).toBeLessThan(heading.y + heading.height)
        expect(button.y + button.height).toBeLessThanOrEqual(createButton.y)
        if (ar) expect(button.x + button.width).toBeLessThanOrEqual(heading.x)
        else expect(button.x).toBeGreaterThanOrEqual(heading.x + heading.width)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
    }
    await expect(table.locator('caption')).toHaveCount(0)
    await sort.click()
    await expect(
      page.getByRole('dialog', { name: ar ? 'خيارات الفرز' : 'Sort options' }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await filter.click()
    await page.getByLabel(ar ? 'إضافة تصفية' : 'Add filter').selectOption('status')
    await page.getByLabel(ar ? 'تصفية الحالة' : 'Filter Status', { exact: true }).selectOption('2')
    await expect(table.locator('tbody tr')).toHaveText(/Zebra course/)
    await page.reload()
    await expect(table.locator('tbody tr')).toHaveCount(1)
    await expect(filter.locator('.table-control-count')).toHaveText('1')
    await filter.click()
    await page.getByRole('button', { name: ar ? 'مسح التصفية' : 'Clear filters' }).click()
    await expect(table.locator('tbody tr')).toHaveCount(2)
    await page.keyboard.press('Escape')
  }
  expect(writes).toEqual([])
})

test('grade sorting is numeric, keeps drafts, and ignores stale filters', async ({
  page,
}, testInfo) => {
  const { writes } = await syntheticTables(page)
  const stale = encodeURIComponent(
    JSON.stringify({ grades: { sorting: [], filters: [{ id: 'first', value: 'missing' }] } }),
  )
  await page.goto(`/?page=app&view=courses&course=${courseId}&courseView=grades&tables=${stale}`)
  const table = page.locator('table')
  await expect(table.locator('.table-filter')).toHaveCount(0)
  await expect(table.getByRole('button', { name: 'Clear sort and filters' })).toHaveCount(0)
  const names = table.locator('tbody tr td:first-child')
  await expect(names).toHaveCount(5)
  await expect(table.locator('caption')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Back to courses' })).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  const header = page.locator('.grade-title-bar')
  const headingBox = await header.getByRole('heading').boundingBox()
  const triggerBox = await header.getByRole('button', { name: 'Sort options' }).boundingBox()
  if (!headingBox || !triggerBox) throw new Error('Missing grade heading or sort control')
  expect(
    Math.abs(headingBox.y + headingBox.height / 2 - triggerBox.y - triggerBox.height / 2),
  ).toBeLessThan(2)
  expect(triggerBox.width).toBeGreaterThanOrEqual(44)
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({
    path: `.artifacts/verification/sort-popup-closed-${testInfo.project.name}.png`,
  })
  const sortTrigger = page.getByRole('button', { name: 'Sort options' })
  await sortTrigger.click()
  await page.screenshot({
    path: `.artifacts/verification/sort-popup-open-${testInfo.project.name}.png`,
  })
  await page.keyboard.press('Escape')
  await expect(sortTrigger).toBeFocused()
  await sortTrigger.click()
  await page
    .getByRole('dialog', { name: 'Sort options' })
    .getByRole('button', { name: 'Close' })
    .click()
  await expect(sortTrigger).toBeFocused()
  await sortTrigger.click()
  await page.mouse.click(2, 2)
  await expect(page.getByRole('button', { name: 'Sort help' })).toBeHidden()
  await sortFromToolbar(page, { column: 'practical' })
  await expect(names).toHaveText(['Delta', 'Zulu', 'Alpha', 'Charlie', 'Echo'])
  await expect(page.locator('.sort-pill').first()).toBeHidden()
  await header.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: `.artifacts/verification/sort-popup-active-closed-${testInfo.project.name}.png`,
  })
  await sortTrigger.click()
  await expect(page.locator('.sort-pill').first()).toBeVisible()
  await page.screenshot({
    path: `.artifacts/verification/sort-popup-active-open-${testInfo.project.name}.png`,
  })
  await page.keyboard.press('Escape')
  await expect(page.locator('.sort-pill').first()).toBeHidden()
  await sortFromToolbar(page, { column: 'practical', descending: true })
  await expect(names).toHaveText(['Charlie', 'Alpha', 'Zulu', 'Delta', 'Echo'])
  await page.getByLabel('Practical: Zulu Family', { exact: true }).fill('90')
  await expect(names).toHaveText(['Charlie', 'Zulu', 'Alpha', 'Delta', 'Echo'])
  await expect(page.getByLabel('Practical: Zulu Family', { exact: true })).toHaveValue('90')
  await page.reload()
  await expect(names).toHaveText(['Charlie', 'Alpha', 'Zulu', 'Delta', 'Echo'])
  await page.goto('/?page=app&view=courses')
  await page.goBack()
  await expect(names).toHaveCount(5)
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({
    path: `.artifacts/verification/table-grades-${testInfo.project.name}.png`,
    fullPage: true,
  })
  expect(writes).toEqual([])
})

test('result sorting ranks status then average without writes', async ({ page }) => {
  const { writes, snapshot } = await syntheticTables(page, 'administrator', 'Alpha course', true)
  await page.goto(`/?page=app&view=courses&course=${courseId}&courseView=grades`)
  const names = page.locator('table tbody tr td:first-child')
  for (const language of ['en', 'ar']) {
    await expect(page.locator('.profile-trigger')).toBeVisible()
    if (language === 'ar')
      await clickAccountAction(page, '\u0627\u0644\u0639\u0631\u0628\u064a\u0629')
    await page.goto(`/?page=app&view=courses&course=${courseId}&courseView=grades`)
    await sortFromToolbar(page, { column: 'result', ar: language === 'ar' })
    await expect(names).toHaveText(['Echo', 'Foxtrot', 'Delta', 'Charlie', 'Alpha', 'Zulu'])
    await sortFromToolbar(page, { column: 'result', descending: true, ar: language === 'ar' })
    await expect(names).toHaveText(['Zulu', 'Alpha', 'Charlie', 'Delta', 'Foxtrot', 'Echo'])
    await page.reload()
    await expect(names).toHaveText(['Zulu', 'Alpha', 'Charlie', 'Delta', 'Foxtrot', 'Echo'])
    await page
      .getByLabel(
        language === 'ar' ? '\u0639\u0645\u0644\u064a: Zulu Family' : 'Practical: Zulu Family',
        {
          exact: true,
        },
      )
      .fill('91')
    await expect(names).toHaveText(['Alpha', 'Charlie', 'Delta', 'Zulu', 'Foxtrot', 'Echo'])
    await page.reload()
  }
  for (const entry of snapshot.enrollments) {
    if (entry.studentId !== studentIds[1] && entry.studentId !== studentIds[4]) continue
    entry.gradeDecisions.push({
      requestId: crypto.randomUUID(),
      result: entry.studentId === studentIds[1] ? 'fail' : 'pass',
      note: 'Synthetic override sorting check',
      actor: 'Synthetic administrator',
      at: '2026-11-17T14:00:00.000Z',
    })
  }
  await page.reload()
  await expect(names).toHaveText(['Zulu', 'Echo', 'Charlie', 'Alpha', 'Delta', 'Foxtrot'])
  expect(writes).toEqual([])
})

test('grade title and sort fit long course names and navigation returns to courses', async ({
  page,
}) => {
  await syntheticTables(
    page,
    'administrator',
    'A very long synthetic course name without unnecessary spaces Supercalifragilisticexpialidocious',
  )
  await page.goto(`/?page=app&view=courses&course=${courseId}&courseView=grades`)
  await expect(page.locator('table tbody tr')).toHaveCount(5)
  for (const language of ['en', 'ar']) {
    if (language === 'ar') await clickAccountAction(page, 'العربية')
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 })
      const bar = page.locator('.grade-title-bar')
      const bounds = await bar.evaluate((element) => ({
        scroll: element.scrollWidth,
        width: element.clientWidth,
      }))
      expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true)
      await expect(
        bar.getByRole('button', { name: language === 'ar' ? 'خيارات الفرز' : 'Sort options' }),
      ).toBeVisible()
    }
  }
  await clickAccountAction(page, 'English')
  await page.getByRole('button', { name: 'Courses', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Courses', exact: true })).toBeVisible()
  await expect(page.locator('.grade-title-bar')).toHaveCount(0)
})

test('student portal dates sort chronologically and combine course/status filters', async ({
  page,
}) => {
  const { writes } = await syntheticTables(page, 'student')
  await page.goto('/?page=app')
  await expect(
    page
      .locator('dl div')
      .filter({ has: page.locator('dt', { hasText: /^Roster level$/ }) })
      .locator('dd'),
  ).toHaveText('1')
  const table = page.locator('table')
  await everyColumn(table, 3)
  await sortFromToolbar(page, { column: 'date' })
  await expect(table.locator('tbody tr td:nth-child(2)')).toHaveText([
    '2026-11-12',
    '2026-11-13',
    '2026-11-14',
  ])
  await page.getByRole('button', { name: 'Filter options' }).click()
  await page.getByLabel('Add filter').selectOption({ label: 'Course' })
  await page.getByLabel('Filter Course', { exact: true }).fill('Alpha')
  await page.getByLabel('Add filter').selectOption({ label: 'Status' })
  await page.getByLabel('Filter Status', { exact: true }).selectOption({ label: 'present' })
  await page.getByRole('button', { name: 'Remove filter Status' }).click()
  await page.getByLabel('Add filter').selectOption({ label: 'Status' })
  await page.getByLabel('Filter Status', { exact: true }).selectOption({ label: 'present' })
  await expect(table.locator('tbody tr')).toHaveCount(1)
  await expect(table.locator('tbody')).toContainText('2026-11-12')
  await page.reload()
  await expect(table.locator('tbody tr')).toHaveCount(1)
  await page.getByRole('button', { name: 'Sort options' }).click()
  await page.getByRole('button', { name: 'Reset sort', exact: true }).click()
  await page.getByRole('button', { name: 'Filter options' }).click()
  await expect(page.getByLabel('Filter Course', { exact: true })).toHaveValue('Alpha')
  await expect(
    page.getByLabel('Filter Status', { exact: true }).locator('option:checked'),
  ).toHaveText('present')
  await expect(table.locator('tbody tr')).toHaveCount(1)
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(table.locator('tbody tr')).toHaveCount(3)
  expect(writes).toEqual([])
})

test('multi-sort priority, URL state, and reset', async ({ page }, testInfo) => {
  const { writes } = await syntheticTables(page)
  await page.goto(`/?page=app&view=courses&course=${courseId}&courseView=grades`)
  const table = page.locator('table')
  const names = table.locator('tbody tr td:first-child')
  const last = table.getByRole('button', { name: 'Sort by Last name', exact: true })
  const first = table.getByRole('button', { name: 'Sort by First name', exact: true })
  const desktop = testInfo.project.name === 'chromium'
  const startMultiSort = async () => {
    if (desktop) {
      await last.click()
      await expect(last).toHaveCSS('outline-style', 'none')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Shift+Tab')
      await expect(last).not.toHaveCSS('outline-style', 'none')
      await first.click({ modifiers: ['Shift'] })
    } else {
      await sortFromToolbar(page, { column: 'last' })
      await sortFromToolbar(page, { column: 'first' })
    }
  }
  await startMultiSort()
  await expect(page.locator('.sort-pill').first()).toBeHidden()
  await page.getByRole('button', { name: 'Sort options' }).click()
  await expect(
    page.getByRole('button', { name: 'Reorder First name' }),
  ).toHaveAccessibleDescription(/Press Space/)
  await page.getByRole('button', { name: 'Sort help' }).click()
  await expect(page.getByText('Keyboard: Space to grab and drop', { exact: false })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('Keyboard: Space to grab and drop', { exact: false })).toBeHidden()
  await expect(names).toHaveText(['Echo', 'Alpha', 'Charlie', 'Delta', 'Zulu'])
  if (desktop) {
    await expect(last.locator('.table-sort-priority')).toHaveText('1')
    await expect(first.locator('.table-sort-priority')).toHaveText('2')
    await expect(first.locator('..')).not.toHaveAttribute('aria-sort')
  }
  await page.reload()
  await expect(names).toHaveText(['Echo', 'Alpha', 'Charlie', 'Delta', 'Zulu'])
  await page.getByRole('button', { name: 'Sort options' }).click()
  await page
    .locator('.sort-toolbar')
    .evaluate((element) => element.scrollIntoView({ block: 'center' }))
  const source = await page.getByRole('button', { name: 'Reorder First name' }).boundingBox()
  const target = await page.locator('.sort-pill').first().boundingBox()
  if (!source || !target) throw new Error('Missing sort pills')
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 })
  await expect(page.locator('.sort-pill').first()).toContainText('First name')
  await page.screenshot({
    path: `.artifacts/verification/sort-pills-drag-${testInfo.project.name}.png`,
  })
  const feedback = await page.locator('[data-dnd-dragging]').boundingBox()
  if (!feedback) throw new Error('Missing drag preview')
  expect(Math.abs(feedback.y - target.y)).toBeLessThan(4)
  expect(Math.abs(feedback.x - (target.x + target.width / 2 - source.width / 2))).toBeLessThan(4)
  await page.mouse.up()
  await expect(page.locator('.sort-pill').first()).toContainText('First name')
  await expect(names).toHaveText(['Alpha', 'Charlie', 'Delta', 'Echo', 'Zulu'])
  await page.reload()
  await page.getByRole('button', { name: 'Sort options' }).click()
  await expect(page.locator('.sort-pill').first()).toContainText('First name')
  await page.getByRole('button', { name: 'Reset sort' }).click()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await startMultiSort()
  await page.getByRole('button', { name: 'Sort options' }).click()
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({
    path: `.artifacts/verification/multi-sort-${testInfo.project.name}.png`,
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Sort direction 2: Ascending' }).click()
  await expect(names).toHaveText(['Echo', 'Zulu', 'Delta', 'Charlie', 'Alpha'])
  const grip = page.getByRole('button', { name: 'Reorder First name' })
  await grip.focus()
  const currentPill = await grip.locator('..').boundingBox()
  const precedingPill = await page.locator('.sort-pill').first().boundingBox()
  if (!currentPill || !precedingPill) throw new Error('Missing keyboard sort targets')
  await page.keyboard.press('Space')
  await expect(grip.locator('..')).toHaveClass(/is-dragging/)
  await page.keyboard.press(
    Math.abs(currentPill.y - precedingPill.y) > currentPill.height / 2
      ? 'ArrowUp'
      : currentPill.x > precedingPill.x
        ? 'ArrowLeft'
        : 'ArrowRight',
  )
  await expect(page.locator('.sort-pill').first()).toContainText('First name')
  await page.keyboard.press('Space')
  await expect(page.locator('.sort-pill').first()).toContainText('First name')
  await expect(names).toHaveText(['Zulu', 'Echo', 'Delta', 'Charlie', 'Alpha'])
  await page.getByRole('button', { name: 'Remove sort 2' }).click()
  await page.getByLabel('Add column').selectOption('last')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  if (desktop) await first.click()
  await page.getByRole('button', { name: 'Sort options' }).click()
  if (!desktop) await page.getByRole('button', { name: 'Reset sort', exact: true }).click()
  await expect(page.locator('.sort-pill')).toHaveCount(0)
  await page.getByRole('button', { name: 'Reset sort', exact: true }).click()
  await expect(table.locator('.table-filter')).toHaveCount(0)
  await expect(names).toHaveText(['Zulu', 'Alpha', 'Charlie', 'Delta', 'Echo'])
  await page.reload()
  await expect(names).toHaveText(['Zulu', 'Alpha', 'Charlie', 'Delta', 'Echo'])
  const state = {
    grades: {
      filters: [{ id: 'first', value: 'missing' }],
      sorting: [
        { id: 'first', desc: false },
        { id: 'first', desc: true },
        { id: 'enrolled', desc: false },
        { id: 'unknown', desc: false },
      ],
    },
  }
  const url = new URL(page.url())
  url.searchParams.set('tables', JSON.stringify(state))
  await page.goto(url.toString())
  await expect(names).toHaveText(['Alpha', 'Charlie', 'Delta', 'Echo', 'Zulu'])
  await page.getByRole('button', { name: 'Sort options' }).click()
  await expect(page.locator('.sort-pill')).toHaveCount(1)
  await expect(page.locator('.sort-pill').first()).toContainText('First name')
  await page.getByLabel('Add column').selectOption('last')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await clickAccountAction(page, '\u0627\u0644\u0639\u0631\u0628\u064a\u0629')
  await page.getByRole('button', { name: 'خيارات الفرز' }).click()
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
    await page.screenshot({
      path: `.artifacts/verification/sort-popup-open-ar-${testInfo.project.name}-${width}.png`,
      fullPage: true,
    })
    await page.keyboard.press('Escape')
    await page.screenshot({
      path: `.artifacts/verification/sort-popup-closed-ar-${testInfo.project.name}-${width}.png`,
      fullPage: true,
    })
    await page.getByRole('button', { name: 'خيارات الفرز' }).click()
  }
  const rtlGrip = page.getByRole('button', { name: 'ترتيب اسم العائلة' })
  await expect(rtlGrip).toHaveAccessibleDescription(/اضغط مسافة/)
  await rtlGrip.focus()
  await page.keyboard.press('Space')
  await expect(rtlGrip.locator('..')).toHaveClass(/is-dragging/)
  await page.keyboard.press('ArrowUp')
  await expect(page.locator('.sort-pill').first()).not.toContainText('الاسم الأول')
  await page.keyboard.press('Escape')
  await expect(rtlGrip).toBeFocused()
  await expect(page.locator('.sort-pill').first()).toContainText('الاسم الأول')
  await page.keyboard.press('Space')
  await expect(rtlGrip.locator('..')).toHaveClass(/is-dragging/)
  await page.keyboard.press('ArrowUp')
  await expect(page.locator('.sort-pill').first()).not.toContainText('الاسم الأول')
  await page.keyboard.press('Space')
  await expect(rtlGrip).toBeFocused()
  await page.reload()
  await page.getByRole('button', { name: 'خيارات الفرز' }).click()
  await expect(page.locator('.sort-pill').first()).not.toContainText('الاسم الأول')
  await page
    .locator('.sort-toolbar')
    .evaluate((element) => element.scrollIntoView({ block: 'center' }))
  const firstGrip = page.locator('.sort-pill').first().locator('.sort-grip')
  const touchSource = await firstGrip.boundingBox()
  const touchTarget = await page.locator('.sort-pill').last().boundingBox()
  if (!touchSource || !touchTarget) throw new Error('Missing touch targets')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true })
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: touchSource.x + touchSource.width / 2, y: touchSource.y + touchSource.height / 2 },
    ],
  })
  await expect(firstGrip.locator('..')).toHaveClass(/is-dragging/)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: touchTarget.x + touchTarget.width / 2, y: touchTarget.y + touchTarget.height / 2 },
    ],
  })
  await expect(page.locator('.sort-pill').first()).toContainText('الاسم الأول')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.locator('.sort-pill').first()).toContainText('الاسم الأول')
  await page.reload()
  await page.getByRole('button', { name: 'خيارات الفرز' }).click()
  await expect(page.locator('.sort-pill').first()).toContainText('الاسم الأول')
  await cdp.detach()
  expect(writes).toEqual([])
})
