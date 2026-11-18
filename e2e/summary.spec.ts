import { clickAccountAction } from './profileActions'
import { expect, test, type Page } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { unzipSync } from 'fflate'

test.use({ trace: 'off' })

async function openSummary(page: Page, role: 'administrator' | 'teacher') {
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
    role,
    id: teacherId,
    name: 'Admin',
    canRead: true,
    canWrite: role === 'administrator',
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
  if (role === 'teacher') {
    for (let i = 3; i <= 24; i++) {
      const suffix = String(i).padStart(12, '0')
      const studentId = `20000000-0000-4000-8000-${suffix}`
      students.push({
        kind: 'student',
        studentId,
        name: `Peer ${suffix.slice(-2)}`,
        group: 'A',
        active: true,
      })
      enrollments.push({ ...enrollments[0], id: `41000000-0000-4000-8000-${suffix}`, studentId })
      if (i <= 5) {
        for (let day = 1; day <= 4; day++) {
          events.push(
            event(i * 10 + day, {
              kind: 'attendance',
              studentId,
              enrollmentId: `41000000-0000-4000-8000-${suffix}`,
              date: `2026-02-0${day}`,
              status: day <= i - 2 ? 'present' : 'absent',
            }),
          )
        }
      }
    }
    students[1].active = true
  }
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
  return { courseA, courseB, courseEmpty }
}

test('summary counts all dates for the selected course and ignores saved filters', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => false })
  })
  await openSummary(page, 'administrator')
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
  await page.getByRole('button', { name: 'تصدير مخطط الحضور' }).click()
  await expect(page.getByRole('img', { name: /مخطط الحضور/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /مشاركة الصورة/ })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const arabicDownload = page.waitForEvent('download')
  await page.getByRole('link', { name: /تنزيل.*PNG/ }).click()
  await (
    await arabicDownload
  ).saveAs(`.artifacts/verification/group-attendance-${testInfo.project.name}-ar.png`)
  await page.getByRole('button', { name: 'إغلاق', exact: true }).click()
  await clickAccountAction(page, 'English')
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await page.getByLabel('Change course').click()
  await page.getByRole('button', { name: 'Course B', exact: true }).click()
  await page.getByRole('button', { name: 'Summary', exact: true }).click()
  await expect(row.locator('td')).toHaveText(['6', '1', '0', '2'])
  await expect(page.getByRole('row', { name: /Former Student/ })).toHaveCount(0)
  await expect(page.getByText('2020-01-01 \u00b7 Absent: 1, Excused: 0, Recorded: 1')).toBeVisible()
  await page.getByText('Show remaining dates').click()
  await expect(page.getByText('2021-01-01 \u00b7 Absent: 0, Excused: 0, Recorded: 1')).toBeVisible()
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await page.getByLabel('Change course').click()
  await page.getByRole('button', { name: 'Empty Course', exact: true }).click()
  await page.getByRole('button', { name: 'Summary', exact: true }).click()
  await expect(page.getByText('No attendance records yet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export attendance chart' })).toBeDisabled()
  await expect(page.getByRole('meter')).toHaveCount(0)
  await clickAccountAction(page, 'العربية')
  await expect(page.getByText('لا توجد سجلات حضور بعد.')).toBeVisible()
  await clickAccountAction(page, 'English')
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await page.getByLabel('Change course').click()
  await page.getByRole('button', { name: 'Previous / no course', exact: true }).click()
  await page.getByRole('button', { name: 'Summary', exact: true }).click()
  await expect(row.locator('td')).toHaveText(['1', '0', '0', '2'])
  await page.getByRole('button', { name: 'Attendance', exact: true }).click()
  await expect(page.getByLabel('Find a student')).toBeHidden()
  await expect(page.getByRole('combobox', { name: 'Group', exact: true })).toBeHidden()
  await expect(page.getByLabel('Session date')).toBeHidden()
  await expect(page.getByText('Choose an open course to take attendance.')).toBeVisible()
})

test('read-only teacher previews, downloads and shares the selected attendance chart', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', {
      value: (data: ShareData) => data.files?.[0]?.type === 'image/png',
    })
    Object.defineProperty(navigator, 'share', {
      value: async (data: ShareData) => {
        if (document.body.dataset.cancelShare) throw new DOMException('Cancelled', 'AbortError')
        const file = data.files?.[0]
        if (!file || !navigator.userActivation.isActive)
          throw new Error('Expected an image and a user gesture')
        const bytes = new Uint8Array(
          await crypto.subtle.digest('SHA-256', await file.arrayBuffer()),
        )
        document.body.dataset.sharedImage = Array.from(bytes, (b) =>
          b.toString(16).padStart(2, '0'),
        ).join('')
      },
    })
  })
  await openSummary(page, 'teacher')
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 800 })
  const open = page.getByRole('button', { name: 'Export attendance chart' })
  await open.click()
  const chart = page.getByRole('img', { name: /Attendance chart/i })
  const data = page.getByRole('list', { name: 'Chart data' })
  await expect(data).toContainText('100%')
  await expect(data).toContainText('2/2')
  await expect(data).toContainText('0/1')
  await expect(data).toContainText('No records')
  await expect(data).not.toContainText('Former Student')
  await expect(data).not.toContainText('Synthetic Student')
  await expect(chart).toBeVisible()
  const highlight = page.getByLabel('Highlight one student by name')
  await highlight.selectOption({ label: 'Peer 24' })
  await expect(data).toContainText('Peer 24')
  await expect(data).not.toContainText('Peer 23')
  await expect(data).not.toContainText('Peer 22')
  await page.getByRole('checkbox', { name: 'Show all names' }).check()
  await expect(data).toContainText('Peer 23')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await open.click()
  await expect(page.getByRole('checkbox', { name: 'Show all names' })).not.toBeChecked()
  await expect(highlight).toHaveValue('')
  await highlight.selectOption({ label: 'Former Student' })
  await expect(data).toContainText('Former Student')
  await expect(data).not.toContainText('Synthetic Student')
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('link', { name: /Download.*PNG/i }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toMatch(/\.png$/)
  const path = `.artifacts/verification/group-attendance-${testInfo.project.name}.png`
  await mkdir('.artifacts/verification', { recursive: true })
  await download.saveAs(path)
  const png = await readFile(path)
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(png.readUInt32BE(16)).toBeGreaterThanOrEqual(800)
  await expect(chart).toHaveAttribute('src', `data:image/png;base64,${png.toString('base64')}`)
  const allPagesEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download all images (ZIP)' }).click()
  const archive = await allPagesEvent
  const archivePath = await archive.path()
  if (!archivePath) throw new Error('Missing ZIP download')
  const images = Object.values(unzipSync(await readFile(archivePath)))
  expect(images).toHaveLength(4)
  expect(Buffer.from(images[0]).equals(png)).toBe(true)
  for (const image of images)
    expect(Buffer.from(image.subarray(0, 8)).toString('hex')).toBe('89504e470d0a1a0a')
  const share = page.getByRole('button', { name: /Share.*image/i })
  await share.click()
  await expect(page.locator('body')).toHaveAttribute(
    'data-shared-image',
    createHash('sha256').update(png).digest('hex'),
  )
  await page.evaluate(() => {
    document.body.dataset.cancelShare = 'true'
  })
  await share.click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
