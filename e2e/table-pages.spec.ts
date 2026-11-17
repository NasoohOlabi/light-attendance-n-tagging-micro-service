import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { makeEvent } from '../shared/ledger'
import { neonAdminBoardSchema, neonSnapshotSchema } from '../shared/neon'
import { clickAccountAction } from './profileActions'

test.use({ trace: 'off' })
const actorId = '10000000-0000-4000-8000-000000000001'
const courseId = '30000000-0000-4000-8000-000000000001'
const studentIds = [1, 2, 3, 4, 5].map((n) => `20000000-0000-4000-8000-00000000000${n}`)
const scores: (number | null)[] = [2, 10, 100, 0, null]

async function syntheticTables(page: Page, role: 'administrator' | 'student' = 'administrator') {
  const students = ['Zulu', 'Alpha', 'Charlie', 'Delta', 'Echo'].map((firstName, index) => ({
    kind: 'student',
    studentId: studentIds[index],
    name: `${firstName} Family`,
    firstName,
    lastName: 'Family',
    group: String(index + 1),
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
    level: index === 4 ? '' : String(index + 1),
    practical: scores[index] ?? null,
    theory: 100,
    active: index !== 4,
    handbookReceived: index % 2 === 0,
  }))
  students.push({
    kind: 'student',
    studentId: '20000000-0000-4000-8000-000000000006',
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
      { id: courseId, name: 'Alpha course', open: true },
    ],
    events: enrollments.flatMap((entry) =>
      ['2026-11-12', '2026-11-13', '2026-11-14'].map((date, index) =>
        makeEvent('synthetic-table-check', {
          kind: 'attendance',
          studentId: entry.studentId,
          enrollmentId: entry.id,
          date,
          status: index === 2 ? 'absent' : 'present',
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
          student: { studentId: studentIds[0], name: 'Synthetic student', group: '1' },
          attendance: [
            { date: '2026-11-14', status: 'absent', course: 'Zebra course' },
            { date: '2026-11-12', status: 'present', course: 'Alpha course' },
            { date: '2026-11-13', status: 'excused', course: 'Alpha course' },
          ],
        },
      })
    return route.fulfill({ status: 501, json: { error: 'Unexpected synthetic request' } })
  })
  return { writes }
}

async function everyColumn(table: Locator, count: number, actions = false) {
  await expect(table).toBeVisible()
  const page = table.page()
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
  }
  const headers = table.locator('thead th[aria-sort]')
  await expect(headers).toHaveCount(count)
  await expect(table.locator('.table-filter')).toHaveCount(count)
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

test('every staff table column sorts and filters without writes', async ({ page }) => {
  const { writes } = await syntheticTables(page)
  for (const [query, columns, actions] of [
    ['view=courses', 2, true],
    [`view=courses&course=${courseId}&courseView=students`, 6, true],
    [`view=courses&course=${courseId}&courseView=grades`, 8, true],
    ['tab=roster', 7, true],
    [`view=student&student=${studentIds[0]}`, 3, false],
    [`tab=attendance&course=${courseId}`, 3, false],
    [`tab=attendance&course=${courseId}&q=Alpha`, 3, false],
    [`tab=summary&course=${courseId}`, 5, false],
  ] satisfies [string, number, boolean][]) {
    await page.goto(`/?page=app&${query}`)
    await everyColumn(page.locator('table').first(), columns, actions)
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
    .getByRole('button', { name: 'Students' })
    .click()
  const table = page.locator('table')
  await everyColumn(table, 8, true)
  await page.getByLabel('Filter Active', { exact: true }).selectOption({ label: 'Active' })
  await expect(table.locator('tbody tr')).toHaveCount(5)
  await clickAccountAction(page, 'العربية')
  await expect(table.locator('tbody tr')).toHaveCount(5)
  await expect(page.getByLabel('تصفية الحالة')).toHaveValue('1')
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  }
  expect(writes).toEqual([])
})

test('grade sorting is numeric with blanks last and draft/filter state survives', async ({
  page,
}, testInfo) => {
  const { writes } = await syntheticTables(page)
  await page.goto(`/?page=app&view=courses&course=${courseId}&courseView=grades`)
  const table = page.locator('table')
  const names = table.locator('tbody tr td:first-child')
  const practical = page.getByRole('button', { name: 'Sort by Practical', exact: true })
  await practical.click()
  await expect(names).toHaveText(['Delta', 'Zulu', 'Alpha', 'Charlie', 'Echo'])
  await practical.click()
  await expect(names).toHaveText(['Charlie', 'Alpha', 'Zulu', 'Delta', 'Echo'])
  await page.getByLabel('Practical: Zulu Family', { exact: true }).fill('90')
  await expect(names).toHaveText(['Charlie', 'Zulu', 'Alpha', 'Delta', 'Echo'])
  await page.getByLabel('Filter First name', { exact: true }).fill('Zulu')
  await page.getByLabel('Filter Practical', { exact: true }).fill('90')
  await expect(names).toHaveText(['Zulu'])
  await page.getByLabel('Filter First name', { exact: true }).fill('no match')
  await expect(names).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear sort and filters' }).click()
  await expect(names).toHaveCount(5)
  await expect(page.getByLabel('Practical: Zulu Family', { exact: true })).toHaveValue('90')
  await page.getByLabel('Filter Attendance', { exact: true }).fill('66.7')
  await expect(names).toHaveCount(5)
  await page.getByRole('button', { name: 'Clear sort and filters' }).click()
  await page.getByLabel('Filter First name', { exact: true }).fill('Alpha')
  await page.reload()
  await expect(names).toHaveText(['Alpha'])
  await page.goto('/?page=app&view=courses')
  await page.goBack()
  await expect(names).toHaveText(['Alpha'])
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({
    path: `.artifacts/verification/table-grades-${testInfo.project.name}.png`,
    fullPage: true,
  })
  expect(writes).toEqual([])
})

test('student portal dates sort chronologically and combine course/status filters', async ({
  page,
}) => {
  const { writes } = await syntheticTables(page, 'student')
  await page.goto('/?page=app')
  const table = page.locator('table')
  await everyColumn(table, 3)
  await page.getByRole('button', { name: 'Sort by Date', exact: true }).click()
  await expect(table.locator('tbody tr td:nth-child(2)')).toHaveText([
    '2026-11-12',
    '2026-11-13',
    '2026-11-14',
  ])
  await page.getByLabel('Filter Course', { exact: true }).fill('Alpha')
  await page.getByLabel('Filter Status', { exact: true }).selectOption({ label: 'present' })
  await expect(table.locator('tbody tr')).toHaveCount(1)
  await expect(table.locator('tbody')).toContainText('2026-11-12')
  await page.reload()
  await expect(table.locator('tbody tr')).toHaveCount(1)
  await page.getByRole('button', { name: 'Clear sort and filters' }).click()
  await expect(table.locator('tbody tr')).toHaveCount(3)
  expect(writes).toEqual([])
})

test('multi-sort priority, URL state, and filter-preserving reset', async ({ page }, testInfo) => {
  await syntheticTables(page)
  await page.goto(`/?page=app&view=courses&course=${courseId}&courseView=grades`)
  const table = page.locator('table')
  const names = table.locator('tbody tr td:first-child')
  const enrolled = table.getByRole('button', { name: 'Sort by Enrolled', exact: true })
  const first = table.getByRole('button', { name: 'Sort by First name', exact: true })
  await enrolled.click()
  await expect(enrolled).toHaveCSS('outline-style', 'none')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(enrolled).not.toHaveCSS('outline-style', 'none')
  await first.click({ modifiers: ['Shift'] })
  await expect(names).toHaveText(['Echo', 'Alpha', 'Charlie', 'Delta', 'Zulu'])
  await expect(enrolled.locator('.table-sort-priority')).toHaveText('1')
  await expect(first.locator('.table-sort-priority')).toHaveText('2')
  await expect(first.locator('..')).not.toHaveAttribute('aria-sort')
  await page.reload()
  await expect(names).toHaveText(['Echo', 'Alpha', 'Charlie', 'Delta', 'Zulu'])
  await table.getByText('Custom sort', { exact: true }).click()
  await mkdir('.artifacts/verification', { recursive: true })
  await page.screenshot({
    path: `.artifacts/verification/multi-sort-${testInfo.project.name}.png`,
    fullPage: true,
  })
  await table.getByLabel('Sort direction 2').selectOption('desc')
  await expect(names).toHaveText(['Echo', 'Zulu', 'Delta', 'Charlie', 'Alpha'])
  await table.getByRole('button', { name: 'Move up 2' }).click()
  await expect(table.getByLabel('Sort column 1')).toHaveValue('first')
  await expect(names).toHaveText(['Zulu', 'Echo', 'Delta', 'Charlie', 'Alpha'])
  await table.getByRole('button', { name: 'Move down 1' }).click()
  await table.getByRole('button', { name: 'Remove sort 2' }).click()
  await table.getByRole('button', { name: 'Add sort', exact: true }).click()
  await first.click()
  await expect(table.getByLabel('Sort column 2')).toHaveCount(0)
  await table.getByLabel('Filter First name').fill('a')
  await table.getByLabel('Filter Enrolled').selectOption({ label: 'Yes' })
  await table.getByRole('button', { name: 'Reset sort', exact: true }).click()
  await expect(table.getByLabel('Filter First name')).toHaveValue('a')
  await expect(table.getByLabel('Filter Enrolled')).toHaveValue('1')
  await expect(names).toHaveText(['Alpha', 'Charlie', 'Delta'])
  await page.reload()
  await expect(names).toHaveText(['Alpha', 'Charlie', 'Delta'])
  const state = JSON.parse(new URL(page.url()).searchParams.get('tables') ?? '{}')
  const tableId = Object.keys(state)[0]
  state[tableId].sorting = [
    { id: 'first', desc: false },
    { id: 'first', desc: true },
    { id: 'unknown', desc: false },
  ]
  const url = new URL(page.url())
  url.searchParams.set('tables', JSON.stringify(state))
  await page.goto(url.toString())
  await expect(names).toHaveText(['Alpha', 'Charlie', 'Delta'])
  await table.getByText('Custom sort', { exact: true }).click()
  await expect(table.getByLabel('Sort column 1')).toHaveValue('first')
  await expect(table.getByLabel('Sort column 2')).toHaveCount(0)
  await table.getByRole('button', { name: 'Add sort', exact: true }).click()
  await clickAccountAction(page, '\u0627\u0644\u0639\u0631\u0628\u064a\u0629')
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
    await page.screenshot({
      path: `.artifacts/verification/multi-sort-ar-${testInfo.project.name}-${width}.png`,
      fullPage: true,
    })
  }
})
