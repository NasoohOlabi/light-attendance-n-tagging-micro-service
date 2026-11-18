import { expect, test } from '@playwright/test'
import {
  offlineAttendanceRecordSchema,
  offlineAttendanceSyncSchema,
} from '../shared/offlineAttendance'
import { z } from 'zod'

const accountId = 'offline-teacher'
const courseId = '40000000-0000-4000-8000-000000000001'
const studentIds = ['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002']
const names = ['Offline Student One', 'Offline Student Two']
const conflictingId = '30000000-0000-4000-8000-000000000001'
const date = '2026-11-18'
const courseUrl = `/?page=app&tab=attendance&course=${courseId}&date=${date}`

test('attendance survives an offline reopen, retries a lost reply, and resolves one conflict', async ({
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
    students: studentIds.map((studentId, index) => ({
      kind: 'student',
      studentId,
      name: names[index],
      group: '',
      active: true,
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
  let lostReply = false
  let networkAvailable = true
  await context.route('**/api/**', async (route) => {
    if (!networkAvailable) return route.abort('internetdisconnected')
    const path = new URL(route.request().url()).pathname
    if (path === '/api/auth/get-session') return route.fulfill({ json: session })
    if (path === '/api/device-accounts') return route.fulfill({ json: { accounts: [] } })
    expect(route.request().headers()['x-user-id']).toBe(accountId)
    if (path === '/api/me') return route.fulfill({ json: { account: teacher, teacher } })
    if (path === '/api/notebook')
      return route.fulfill({ json: { ...snapshot, events: [...accepted.values()] } })
    expect(path).toBe('/api/attendance/sync')
    const body = offlineAttendanceSyncSchema.parse(route.request().postDataJSON())
    expect(body.accountId).toBe(accountId)
    let drop = false
    const outcomes = body.records.map(({ event, expectedEventId }) => {
      attempts.push(event.id)
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
  await page.getByRole('button', { name: 'Prepare offline attendance' }).click()
  await expect(page.getByText('Session prepared on this device.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open offline attendance' })).toBeVisible()

  networkAvailable = false
  await context.setOffline(true)
  const offlinePage = await context.newPage()
  await page.close()
  await offlinePage.goto(courseUrl)
  expect(await offlinePage.evaluate(() => navigator.onLine)).toBe(false)
  await expect(
    offlinePage.getByRole('heading', { name: 'Offline attendance' }),
    await offlinePage.locator('body').innerText(),
  ).toBeVisible()
  const select = offlinePage.getByLabel('Prepared session')
  await select.selectOption(`${courseId}:${date}`)
  const firstRow = offlinePage.getByRole('group', { name: `Attendance for ${names[0]}` })
  const secondRow = offlinePage.getByRole('group', { name: `Attendance for ${names[1]}` })
  await firstRow.getByRole('button', { name: /present/i }).click()
  await secondRow.getByRole('button', { name: /absent/i }).click()
  await expect(offlinePage.getByText('2 pending sync')).toBeVisible()
  await offlinePage.reload()
  await select.selectOption(`${courseId}:${date}`)
  await expect(firstRow.getByRole('button', { name: /present/i })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(secondRow.getByRole('button', { name: /absent/i })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(attempts).toEqual([])

  networkAvailable = true
  await context.setOffline(false)
  await expect(offlinePage.getByText('Conflict — review required')).toBeVisible({ timeout: 30_000 })
  expect(accepted.size).toBe(1)
  expect(attempts.filter((id) => id === [...accepted.keys()][0]).length).toBeGreaterThanOrEqual(2)
  await offlinePage.getByRole('button', { name: 'Use my mark' }).click()
  await expect(offlinePage.getByText('0 pending sync')).toBeVisible()
  expect([...accepted.values()].map(({ payload }) => payload.status)).toEqual(['present', 'absent'])
})
