import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { encodeAccess } from '../shared/access'
import { eventToRow, HEADERS, type Payload } from '../shared/ledger'

const teacherA = '10000000-0000-4000-8000-000000000001'
const teacherB = '10000000-0000-4000-8000-000000000002'
const studentA = '20000000-0000-4000-8000-000000000001'
const studentB = '20000000-0000-4000-8000-000000000002'
const inactive = '20000000-0000-4000-8000-000000000003'
const access = (teacherId: string, username: string) =>
  encodeAccess({
    version: 2,
    username,
    teacherId,
    apiId: 'events-synthetic',
    token: 'events-token',
    sheet: 'Events',
    roster: { apiId: 'roster-synthetic', token: 'roster-token', sheet: 'Roster' },
  })
const roster = [
  {
    studentId: studentA,
    name: 'Alpha Student',
    teacherId: teacherA,
    teacherName: 'Teacher A',
    group: 'Alpha Group',
    active: 'TRUE',
  },
  {
    studentId: studentB,
    name: 'Beta Student',
    teacherId: teacherB,
    teacherName: 'Teacher B',
    group: 'Beta Group',
    active: 'TRUE',
  },
  {
    studentId: inactive,
    name: 'Inactive Student',
    teacherId: teacherA,
    teacherName: 'Teacher A',
    group: 'Old Group',
    active: 'FALSE',
  },
]
function row(id: string, payload: Payload) {
  return eventToRow({
    id,
    actor: 'Synthetic actor',
    clientTime: '2026-11-13T10:00:00.000Z',
    receivedAt: '',
    payload,
  })
}

test('assigned teachers see and write only their active students', async ({
  context,
  page,
}, testInfo) => {
  const rows = [
    row('30000000-0000-4000-8000-000000000001', {
      kind: 'note',
      studentId: studentB,
      date: '2026-11-13',
      tags: ['private'],
      text: 'Beta private note',
    }),
    row('30000000-0000-4000-8000-000000000002', {
      kind: 'note',
      studentId: '',
      date: '2026-11-13',
      tags: ['general'],
      text: 'General private note',
    }),
    row('30000000-0000-4000-8000-000000000003', {
      kind: 'student',
      studentId: studentA,
      name: 'Legacy renamed student',
      group: 'Legacy group',
      active: false,
    }),
    row('30000000-0000-4000-8000-000000000004', {
      kind: 'reversal',
      targetId: '30000000-0000-4000-8000-000000000001',
      reason: 'Foreign correction',
    }),
  ]
  const posts: typeof rows = []
  const methods: string[] = []
  await context.route('https://sheetdb.io/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const isRoster = url.pathname.includes('roster-synthetic')
    methods.push(`${isRoster ? 'roster' : 'events'}:${request.method()}`)
    expect(request.headers().authorization).toBe(`Bearer ${isRoster ? 'roster' : 'events'}-token`)
    if (isRoster) {
      expect(request.method()).toBe('GET')
      await route.fulfill({ json: roster })
    } else if (request.method() === 'GET') {
      await route.fulfill({ json: url.pathname.endsWith('/keys') ? HEADERS : rows })
    } else {
      expect(request.method()).toBe('POST')
      expect(url.searchParams.get('mode')).toBe('RAW')
      const data = request.postDataJSON().data as typeof rows
      posts.push(...data)
      rows.push(...data)
      await route.fulfill({ json: { created: data.length } })
    }
  })
  await page.goto(
    `/?date=2026-11-13&from=2026-11-01&to=2026-11-30#access=${access(teacherA, 'Teacher A')}`,
  )
  await expect(page.getByLabel('Attendance for Alpha Student')).toBeVisible()
  await expect(page.getByText('Beta Student')).toHaveCount(0)
  await expect(page.getByText('Inactive Student')).toHaveCount(0)
  await page.getByLabel('Attendance for Alpha Student').selectOption('present')
  await page.getByRole('button', { name: 'Save attendance (1)' }).click()
  await expect.poll(() => posts.length).toBe(1)
  await page.getByRole('button', { name: 'Notes', exact: true }).click()
  const selector = page.getByRole('combobox', { name: 'Student', exact: true })
  await expect(selector.locator('option')).toHaveText(['Choose a student', 'Alpha Student'])
  await selector.selectOption(studentA)
  await page.getByLabel('Tags, separated by commas').fill('synthetic')
  await page.getByLabel('Note', { exact: true }).fill('Alpha private note')
  await page.getByRole('button', { name: 'Save note' }).click()
  await expect(page.getByText('Alpha private note')).toBeVisible()
  await expect(page.getByText('Beta private note')).toHaveCount(0)
  await expect(page.getByText('General private note')).toHaveCount(0)
  await expect.poll(() => posts.length).toBe(2)
  for (const posted of posts) {
    expect(posted.actor).toBe('Teacher A')
    expect(JSON.parse(posted.payload).studentId).toBe(studentA)
  }
  if (testInfo.project.name === 'chromium') {
    await mkdir('.artifacts/verification', { recursive: true })
    await page.screenshot({ path: '.artifacts/verification/assigned-teacher.png', fullPage: true })
  }
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await expect(page.getByText('Alpha Student')).toBeVisible()
  await expect(page.getByText('Legacy renamed student')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add student' })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: /Make inactive|Activate|Save changes/ }),
  ).toHaveCount(0)
  await expect(page.getByLabel('Student name')).toHaveCount(0)
  await page.getByRole('button', { name: 'Open student' }).click()
  await expect(page).toHaveURL(new RegExp(`student=${studentA}`))
  await expect(page.getByLabel('Attendance for Alpha Student')).toBeVisible()
  await page.getByRole('button', { name: 'All my students' }).click()
  await expect(page).not.toHaveURL(/student=/)
  await page.goto(
    `/?student=${studentB}&tab=notes&date=2026-11-13&from=2026-11-01&to=2026-11-30#access=${access(teacherA, 'Teacher A')}`,
  )
  await expect(page.getByText('Beta private note')).toHaveCount(0)
  await expect(
    page.getByRole('combobox', { name: 'Student', exact: true }).locator('option'),
  ).toHaveText(['Choose a student'])
  await page.getByLabel('Tags, separated by commas').fill('synthetic')
  await page.getByLabel('Note', { exact: true }).fill('Attempted foreign note')
  await expect(page.getByRole('button', { name: 'Save note' })).toBeDisabled()
  expect(posts).toHaveLength(2)
  const other = await context.newPage()
  await other.goto(
    `/?date=2026-11-13&from=2026-11-01&to=2026-11-30#access=${access(teacherB, 'Teacher B')}`,
  )
  await expect(other.getByLabel('Attendance for Beta Student')).toBeVisible()
  for (const tab of ['Students', 'Attendance', 'Notes', 'Summary', 'History & corrections']) {
    await other.getByRole('button', { name: tab, exact: true }).click()
    await expect(other.getByText('Alpha Student')).toHaveCount(0)
    await expect(other.getByText('Alpha private note')).toHaveCount(0)
    await expect(other.getByText('Inactive Student')).toHaveCount(0)
    await expect(other.getByText('General private note')).toHaveCount(0)
  }
  expect(methods).not.toContain('roster:POST')
})

test('ambiguous roster fails closed', async ({ page }) => {
  await page.route('https://sheetdb.io/**', async (route) => {
    const isRoster = new URL(route.request().url()).pathname.includes('roster-synthetic')
    await route.fulfill({
      json: isRoster ? [roster[0], { ...roster[1], studentId: studentA }] : [],
    })
  })
  await page.goto(`/#access=${access(teacherA, 'Teacher A')}`)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText('Alpha Student')).toHaveCount(0)
  await expect(page.getByText('Beta Student')).toHaveCount(0)
})

test('reassigned student blocks pending replay without losing the batch', async ({ page }) => {
  const pending = [
    {
      id: '30000000-0000-4000-8000-000000000010',
      actor: 'Teacher A',
      clientTime: '2026-11-13T10:00:00.000Z',
      receivedAt: '',
      payload: { kind: 'attendance', studentId: studentA, date: '2026-11-13', status: 'present' },
    },
  ]
  const key = `halaqa-pending-v1:events-synthetic:Events:Teacher A:${teacherA}:roster-synthetic:Roster`
  await page.addInitScript(
    ({ key, pending }) => localStorage.setItem(key, JSON.stringify(pending)),
    { key, pending },
  )
  let posts = 0
  await page.route('https://sheetdb.io/**', async (route) => {
    const request = route.request()
    if (request.method() === 'POST') posts++
    const isRoster = new URL(request.url()).pathname.includes('roster-synthetic')
    await route.fulfill({
      json: isRoster ? [{ ...roster[0], teacherId: teacherB, teacherName: 'Teacher B' }] : [],
    })
  })
  await page.goto(`/#access=${access(teacherA, 'Teacher A')}`)
  await expect(page.getByText('1 records awaiting confirmation')).toBeVisible()
  await page.getByRole('button', { name: 'Retry pending batch' }).click()
  await expect(page.getByRole('alert')).toContainText('outside your assigned active students')
  expect(posts).toBe(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(JSON.stringify(pending))
})

test('same-page access links replace the teacher session and reject malformed links', async ({
  page,
}) => {
  const rows = [
    row('30000000-0000-4000-8000-000000000011', {
      kind: 'note',
      studentId: studentA,
      date: '2026-11-13',
      tags: ['alpha'],
      text: 'Alpha session note',
    }),
    row('30000000-0000-4000-8000-000000000012', {
      kind: 'note',
      studentId: studentB,
      date: '2026-11-13',
      tags: ['beta'],
      text: 'Beta session note',
    }),
  ]
  const posts: typeof rows = []
  await page.route('https://sheetdb.io/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.includes('roster-synthetic')) {
      expect(request.method()).toBe('GET')
      await route.fulfill({ json: roster })
    } else if (request.method() === 'GET') {
      await route.fulfill({ json: url.pathname.endsWith('/keys') ? HEADERS : rows })
    } else {
      const data = request.postDataJSON().data as typeof rows
      posts.push(...data)
      rows.push(...data)
      await route.fulfill({ json: { created: data.length } })
    }
  })
  await page.goto(
    `/?date=2026-11-13&from=2026-11-01&to=2026-11-30#access=${access(teacherA, 'Teacher A')}`,
  )
  await expect(page.getByLabel('Attendance for Alpha Student')).toBeVisible()
  await page.getByRole('button', { name: 'Notes', exact: true }).click()
  await page.getByRole('combobox', { name: 'Student', exact: true }).selectOption(studentA)
  await page.getByLabel('Tags, separated by commas').fill('stale')
  await page.getByLabel('Note', { exact: true }).fill('Stale Alpha draft')
  await page.evaluate(
    (fragment) => {
      location.hash = `access=${fragment}`
    },
    access(teacherB, 'Teacher B'),
  )
  await expect.poll(() => new URL(page.url()).hash).toBe('')
  await expect(page.getByText('Teacher B', { exact: true })).toBeVisible()
  await expect(page.getByText('Beta session note')).toBeVisible()
  await expect(page.getByText('Alpha session note')).toHaveCount(0)
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue('')
  const selector = page.getByRole('combobox', { name: 'Student', exact: true })
  await expect(selector.locator('option')).toHaveText(['Choose a student', 'Beta Student'])
  await selector.selectOption(studentB)
  await page.getByLabel('Tags, separated by commas').fill('beta')
  await page.getByLabel('Note', { exact: true }).fill('Beta new note')
  await page.getByRole('button', { name: 'Save note' }).click()
  await expect.poll(() => posts.length).toBe(1)
  expect(posts[0].actor).toBe('Teacher B')
  expect(JSON.parse(posts[0].payload).studentId).toBe(studentB)
  for (const tab of ['Students', 'Attendance', 'Notes', 'Summary', 'History & corrections']) {
    await page.getByRole('button', { name: tab, exact: true }).click()
    await expect(page.getByText('Alpha Student')).toHaveCount(0)
    await expect(page.getByText('Alpha session note')).toHaveCount(0)
  }
  await page.evaluate(() => {
    location.hash = 'access=invalid!'
  })
  await expect.poll(() => new URL(page.url()).hash).toBe('')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText('Teacher B', { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Explore with sample students' })).toBeVisible()
  expect(posts).toHaveLength(1)
})

test('assigned teacher sample saves locally and hides other students', async ({ page }) => {
  const external: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url())
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore assigned teacher sample' }).click()
  await expect(page.getByLabel('Attendance for أحمد')).toBeVisible()
  await expect(page.getByText('Omar')).toHaveCount(0)
  await page.getByLabel('Attendance for أحمد').selectOption('late')
  await page.getByRole('button', { name: 'Save attendance (1)' }).click()
  await expect(page.getByRole('status')).toContainText('saved in this demo')
  await page.getByRole('button', { name: 'Students', exact: true }).click()
  await expect(page.getByText('أحمد')).toBeVisible()
  await expect(page.getByText('Omar')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add student' })).toHaveCount(0)
  await expect(page.getByLabel('Student name')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: /Make inactive|Activate|Save changes/ }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Notes', exact: true }).click()
  const selector = page.getByRole('combobox', { name: 'Student', exact: true })
  await expect(selector.locator('option')).toHaveText(['Choose a student', 'أحمد'])
  await selector.selectOption({ label: 'أحمد' })
  await page.getByLabel('Tags, separated by commas').fill('sample')
  await page.getByLabel('Note', { exact: true }).fill('Assigned sample note')
  await page.getByRole('button', { name: 'Save note' }).click()
  await expect(page.getByText('Assigned sample note')).toBeVisible()
  await page.getByLabel('Tags, separated by commas').fill('draft')
  await page.getByLabel('Note', { exact: true }).fill('Do not save to a hidden selection')
  await page.getByLabel('Find a student').fill('No matching student')
  await expect(selector).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Save note' })).toBeDisabled()
  await expect(page.getByRole('textbox', { name: 'Note', exact: true })).toHaveValue(
    'Do not save to a hidden selection',
  )
  await page.getByLabel('Find a student').fill('')
  await expect(
    page.locator('article').filter({ hasText: 'Do not save to a hidden selection' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Summary', exact: true }).click()
  await expect(page.getByLabel('late: 1')).toBeVisible()
  expect(external).toEqual([])
})
