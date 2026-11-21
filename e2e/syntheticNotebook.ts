import type { Page } from '@playwright/test'
import { makeEvent } from '../shared/ledger'
import { neonBatchSchema, neonSnapshotSchema } from '../shared/neon'
import { today } from '../src/queryState'
import { clickAccountAction } from './profileActions'

const userId = '10000000-0000-4000-8000-000000000001'
const courseId = '40000000-0000-4000-8000-000000000001'
const course = { id: courseId, name: 'Synthetic course', open: true }

export async function mockSyntheticNotebook(
  page: Page,
  {
    names = ['أحمد', 'Omar'],
    role = 'administrator',
  }: {
    names?: string[]
    role?: 'administrator' | 'teacher'
  } = {},
) {
  const teacher = {
    id: userId,
    role,
    name: 'Synthetic User',
    canRead: true,
    canWrite: true,
    expiresAt: null,
  }
  const students = names.map((name, index) => ({
    kind: 'student',
    studentId: crypto.randomUUID(),
    name,
    group: index < 2 ? 'الحلقة الأولى' : '',
    active: true,
  }))
  const enrollments = students.map((student) => ({
    id: crypto.randomUUID(),
    courseId,
    studentId: student.studentId,
    level: student.group,
    practical: null,
    theory: null,
  }))
  const snapshot = neonSnapshotSchema.parse({
    teacher,
    students,
    courses: [course],
    enrollments,
    events: [
      makeEvent(teacher.name, {
        kind: 'attendance',
        studentId: students[0].studentId,
        enrollmentId: enrollments[0].id,
        date: today(),
        status: 'present',
      }),
      makeEvent(teacher.name, {
        kind: 'note',
        studentId: students[0].studentId,
        date: today(),
        tags: ['revision', 'follow-up'],
        text: 'Review the last two pages together next session.',
      }),
    ],
  })
  const now = new Date().toISOString()
  const session = {
    user: {
      id: userId,
      name: teacher.name,
      email: 'synthetic@example.test',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: 'synthetic-session',
      userId,
      token: 'synthetic',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      createdAt: now,
      updatedAt: now,
    },
  }
  let signedIn = true
  await page.addInitScript(
    ({ key, value }) => {
      try {
        localStorage.setItem(key, value)
      } catch {
        // One test deliberately denies storage.
      }
    },
    { key: `halaqa-course:${userId}`, value: JSON.stringify(courseId) },
  )
  await page.route('**/api/**', (route) => {
    switch (new URL(route.request().url()).pathname) {
      case '/api/auth/get-session':
        return route.fulfill({ json: signedIn ? session : null })
      case '/api/auth/sign-out':
        signedIn = false
        return route.fulfill({ json: { success: true } })
      case '/api/device-accounts':
        return route.fulfill({ json: { accounts: [] } })
      case '/api/me':
        return route.fulfill({ json: { account: teacher } })
      case '/api/admin':
        return route.fulfill({ json: { accounts: [], teachers: [], students: [] } })
      case '/api/events': {
        const { events } = neonBatchSchema.parse(route.request().postDataJSON())
        snapshot.events.push(...events)
        return route.fulfill({ json: snapshot })
      }
      case '/api/notebook':
        return route.fulfill({ json: snapshot })
      default:
        return route.fallback()
    }
  })
}

export async function openNotebookHistory(page: Page, language: 'en' | 'ar' = 'en') {
  await clickAccountAction(page, language === 'en' ? 'Settings' : 'الإعدادات')
  await page
    .getByRole('link', {
      name: language === 'en' ? 'History & corrections' : 'السجل والتصحيحات',
      exact: true,
    })
    .click()
}
