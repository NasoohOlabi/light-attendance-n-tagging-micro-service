import { expect, test } from '@playwright/test'
import {
  offlineAttendanceRecordSchema,
  offlineAttendanceSyncSchema,
} from '../shared/offlineAttendance'
import { z } from 'zod'
import { offlineStudentSyncSchema } from '../shared/offlineStudent'
import type { LedgerEvent } from '../shared/ledger'

const accountId = 'offline-teacher'
const courseId = '40000000-0000-4000-8000-000000000001'
const studentIds = ['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002']
const names = ['Offline Student One', 'Offline Student Two']
const unenrolledId = '20000000-0000-4000-8000-000000000003'
const unenrolledName = 'Offline Student Without Enrollment'
const oldPhone = '+15550101010'
const otherPhone = '+15550101011'
const updatedPhone = '+15550101012'
const conflictingId = '30000000-0000-4000-8000-000000000001'
const date = '2026-11-18'
const courseUrl = `/?page=app&tab=attendance&course=${courseId}&date=${date}`

test('the full roster, attendance, notes and phone edits survive a cold offline restart and reconcile', async ({
  context,
  page,
}) => {
  const teacher = {
    role: 'teacher',
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Offline Teacher',
    canRead: true,
    canWrite: true,
    expiresAt: null,
  }
  const now = new Date().toISOString()
  const snapshot = {
    teacher,
    students: [...studentIds, unenrolledId].map((studentId, index) => ({
      kind: 'student',
      studentId,
      name: names[index] ?? unenrolledName,
      group: '',
      active: true,
      whatsapp: studentId === unenrolledId ? oldPhone : null,
    })),
    courses: [{ id: courseId, name: 'Offline Test Course', open: true }],
    enrollments: studentIds.map((studentId) => ({
      id: studentId,
      courseId,
      studentId,
      level: '',
      practical: null,
      theory: null,
      active: true,
    })),
  }
  const session = {
    user: {
      id: accountId,
      name: teacher.name,
      email: 'offline@example.test',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: 'synthetic-session',
      userId: accountId,
      token: 'opaque-session',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      createdAt: now,
      updatedAt: now,
    },
  }
  const attempts: string[] = []
  const accepted = new Map<string, z.infer<typeof offlineAttendanceRecordSchema>['event']>()
  const notes = new Map<string, LedgerEvent>()
  const contactReceipts = new Set<string>()
  const studentAttempts: string[] = []
  let serverPhone = oldPhone
  let lostReply = false
  let lostNoteReply = false
  let rejectFirstStudent = true
  let networkAvailable = true
  await context.route('**/api/**', async (route) => {
    if (!networkAvailable) return route.abort('internetdisconnected')
    const path = new URL(route.request().url()).pathname
    if (path === '/api/auth/get-session') return route.fulfill({ json: session })
    if (path === '/api/device-accounts') return route.fulfill({ json: { accounts: [] } })
    expect(route.request().headers()['x-user-id']).toBe(accountId)
    if (path === '/api/me') return route.fulfill({ json: { account: teacher, teacher } })
    if (path === '/api/notebook')
      return route.fulfill({
        json: {
          ...snapshot,
          students: snapshot.students.map((student) =>
            student.studentId === unenrolledId ? { ...student, whatsapp: serverPhone } : student,
          ),
          events: [...accepted.values(), ...notes.values()],
        },
      })
    if (path === '/api/student/sync') {
      const { operation } = offlineStudentSyncSchema.parse(route.request().postDataJSON())
      if (operation.kind === 'note') {
        const { id } = operation.event
        studentAttempts.push(id)
        notes.set(id, { ...operation.event, receivedAt: now })
        if (!lostNoteReply) {
          lostNoteReply = true
          return route.abort('connectionreset')
        }
        return route.fulfill({ json: { id, kind: 'saved', currentWhatsapp: serverPhone } })
      }
      const { id, expectedWhatsapp, whatsapp } = operation
      if (!contactReceipts.has(id)) {
        if (expectedWhatsapp !== serverPhone)
          return route.fulfill({ json: { id, kind: 'conflict', currentWhatsapp: serverPhone } })
        expect(whatsapp).toBe(updatedPhone)
        serverPhone = updatedPhone
        contactReceipts.add(id)
      }
      return route.fulfill({ json: { id, kind: 'saved', currentWhatsapp: serverPhone } })
    }
    expect(path).toBe('/api/attendance/sync')
    const body = offlineAttendanceSyncSchema.parse(route.request().postDataJSON())
    expect(body.accountId).toBe(accountId)
    let drop = false
    const outcomes = body.records.map(({ event, expectedEventId }) => {
      attempts.push(event.id)
      if (rejectFirstStudent && event.payload.studentId === studentIds[0])
        return { id: event.id, kind: 'forbidden', current: null }
      if (accepted.has(event.id))
        return {
          id: event.id,
          kind: 'saved',
          current: { eventId: event.id, status: event.payload.status },
        }
      if (event.payload.studentId === studentIds[1] && expectedEventId !== conflictingId)
        return {
          id: event.id,
          kind: 'conflict',
          current: { eventId: conflictingId, status: 'excused' },
        }
      accepted.set(event.id, { ...event, receivedAt: now })
      if (event.payload.studentId === studentIds[0] && !lostReply) {
        lostReply = true
        drop = true
      }
      return {
        id: event.id,
        kind: 'saved',
        current: { eventId: event.id, status: event.payload.status },
      }
    })
    if (drop) return route.abort('connectionreset')
    return route.fulfill({ json: { outcomes } })
  })

  await page.goto(courseUrl)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true)
  const openChanges = 'My changes'
  await expect(page.getByRole('heading', { name: 'Attendance & notes' })).toBeVisible()
  await expect(page.getByRole('button', { name: openChanges })).toHaveCount(0)
  const dashboard = page.getByRole('button', { name: 'Dashboard' })
  await dashboard.click()
  await expect(dashboard).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: openChanges })).toHaveCount(0)
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await expect(page.getByRole('button', { name: openChanges })).toBeVisible()
  await page.getByRole('button', { name: 'العربية', exact: true }).click()
  await expect(page.getByRole('button', { name: 'تغييراتي', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: openChanges })).toHaveCount(0)

  networkAvailable = false
  await context.setOffline(true)
  await expect(page.getByRole('heading', { name: 'Offline notebook' })).toBeVisible()
  const offlinePage = await context.newPage()
  await offlinePage.addInitScript(() => {
    const actual = Date.now
    Date.now = () => actual() + 25 * 60 * 60 * 1000
  })
  await page.close()
  await offlinePage.goto('/?page=app')
  expect(await offlinePage.evaluate(() => navigator.onLine)).toBe(false)
  await expect(
    offlinePage.getByRole('heading', { name: 'Offline notebook' }),
    await offlinePage.locator('body').innerText(),
  ).toBeVisible()
  const openStudents = offlinePage
    .getByRole('navigation', { name: 'Notebook' })
    .getByRole('button', { name: 'Students' })
  const openAttendance = offlinePage
    .getByRole('navigation', { name: 'Notebook' })
    .getByRole('button', { name: 'Attendance' })
  const unenrolledStudent = offlinePage.getByRole('button', { name: unenrolledName, exact: true })
  await expect(unenrolledStudent).toBeVisible()
  await expect(offlinePage.getByRole('button', { name: names[0], exact: true })).toBeVisible()
  await openAttendance.click()
  const selectCourse = offlinePage.getByLabel('Course', { exact: true })
  const selectDate = offlinePage.getByLabel('Date', { exact: true })
  await selectCourse.selectOption(courseId)
  await selectDate.fill(date)
  const firstRow = offlinePage.getByRole('group', { name: `Attendance for ${names[0]}` })
  const secondRow = offlinePage.getByRole('group', { name: `Attendance for ${names[1]}` })
  await firstRow.getByRole('button', { name: /present/i }).click()
  await secondRow.getByRole('button', { name: /absent/i }).click()
  await openStudents.click()
  await unenrolledStudent.click()
  const noteField = offlinePage.getByLabel('Note', { exact: true })
  const phone = offlinePage.getByLabel('Phone', { exact: true })
  for (const note of ['First offline note', 'Second offline note']) {
    await noteField.fill(note)
    await offlinePage.getByRole('button', { name: 'Save note' }).click()
    await expect(offlinePage.getByText(note, { exact: true })).toBeVisible()
  }
  await expect(phone).toHaveValue(oldPhone)
  await phone.fill(updatedPhone)
  await offlinePage.getByRole('button', { name: 'Save phone' }).click()
  await expect(offlinePage.getByText('5 pending sync')).toBeVisible()
  expect(
    await offlinePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  ).toBe(true)
  await offlinePage.reload()
  await unenrolledStudent.click()
  await expect(phone).toHaveValue(updatedPhone)
  await expect(offlinePage.getByText('First offline note', { exact: true })).toHaveCount(1)
  await expect(offlinePage.getByText('Second offline note', { exact: true })).toHaveCount(1)
  await openAttendance.click()
  await expect(firstRow.getByRole('button', { name: /present/i })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(secondRow.getByRole('button', { name: /absent/i })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(attempts).toEqual([])
  expect(studentAttempts).toEqual([])

  serverPhone = otherPhone
  networkAvailable = true
  await context.setOffline(false)
  await expect(offlinePage.getByRole('button', { name: 'Use my phone' })).toBeVisible({
    timeout: 20_000,
  })
  await expect(offlinePage.getByText('3 pending sync')).toBeVisible()
  expect(notes.size).toBe(2)
  expect(new Set(studentAttempts).size).toBe(2)
  expect(studentAttempts).toHaveLength(3)
  await offlinePage.getByRole('button', { name: 'Back', exact: true }).click()
  await offlinePage.getByRole('button', { name: 'Profile', exact: true }).click()
  await offlinePage.getByRole('button', { name: openChanges }).click()
  await expect(offlinePage.getByRole('heading', { name: openChanges })).toBeVisible()
  await expect(offlinePage.getByRole('navigation', { name: 'Notebook' })).toHaveCount(0)
  await expect(offlinePage.getByText(/saved phone.*15550101011/i)).toBeVisible()
  rejectFirstStudent = false
  await offlinePage.getByRole('button', { name: 'Sync now' }).click()
  await expect(offlinePage.getByText('2 pending sync')).toBeVisible()
  expect(accepted.size).toBe(1)
  expect(attempts.filter((id) => id === [...accepted.keys()][0]).length).toBeGreaterThanOrEqual(2)
  await offlinePage.getByRole('button', { name: 'Use my mark' }).click()
  await expect(offlinePage.getByText('1 pending sync')).toBeVisible()
  await offlinePage.getByRole('button', { name: 'Use my phone' }).click()
  await expect(offlinePage.getByText('0 pending sync')).toBeVisible()
  expect([...accepted.values()].map(({ payload }) => payload.status)).toEqual(['present', 'absent'])
  expect(serverPhone).toBe(updatedPhone)
  expect(contactReceipts.size).toBe(1)
  await expect(offlinePage.getByText('No changes waiting to sync.')).toBeVisible()

  snapshot.students.shift()
  snapshot.enrollments.shift()
  await offlinePage.reload()
  await expect(offlinePage.getByRole('heading', { name: 'Attendance & notes' })).toBeVisible()
  await expect(offlinePage.getByRole('button', { name: openChanges })).toHaveCount(0)
  await offlinePage.getByRole('button', { name: 'Profile', exact: true }).click()
  await offlinePage.getByRole('button', { name: openChanges }).click()
  await expect(offlinePage.getByText('No changes waiting to sync.')).toBeVisible()
  networkAvailable = false
  await context.setOffline(true)
  await expect(offlinePage.getByRole('heading', { name: 'Offline notebook' })).toBeVisible()
  await openAttendance.click()
  await selectCourse.selectOption(courseId)
  await selectDate.fill(date)
  await expect(firstRow).toHaveCount(0)
  await openStudents.click()
  await expect(offlinePage.getByRole('button', { name: names[0], exact: true })).toHaveCount(0)
  await expect(unenrolledStudent).toHaveCount(1)
  await unenrolledStudent.click()
  await expect(offlinePage.getByText('First offline note', { exact: true })).toHaveCount(1)
})
