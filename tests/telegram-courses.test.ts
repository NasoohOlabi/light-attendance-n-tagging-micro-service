import { describe, expect, test } from 'bun:test'
import { courses } from '../telegram/courses'
import type { Action, BotContext, Screen } from '../telegram/types'

const courseId = '11111111-1111-4111-8111-111111111111'
const studentId = '22222222-2222-4222-8222-222222222222'
const entryId = '33333333-3333-4333-8333-333333333333'
const teacherId = '44444444-4444-4444-8444-444444444444'
const snapshot = () => ({
  teacher: { id: teacherId, name: 'Teacher', canRead: true, canWrite: true, expiresAt: null },
  students: [{ kind: 'student', studentId, name: 'Synthetic Student', group: '1', active: true }],
  events: [],
  courses: [
    {
      id: courseId,
      name: 'Synthetic course',
      open: true,
      attendanceMinimum: 70,
      practicalMinimum: 80,
      theoryMinimum: 80,
    },
  ],
  enrollments: [
    {
      id: entryId,
      courseId,
      studentId,
      teacherId: null,
      level: '1',
      practical: 0,
      theory: 90,
      active: true,
      notes: 'Original',
      handbookReceived: false,
    },
  ],
})
const board = {
  accounts: [],
  teachers: [],
  students: [
    {
      studentId,
      name: 'Synthetic Student',
      firstName: 'Synthetic',
      lastName: 'Student',
      group: '1',
      active: true,
      teacherId: null,
    },
  ],
}
const action = (screen: Screen, label: string): Action => {
  const button = screen.rows.flat().find((item) => item.label === label)
  if (!button || !('action' in button)) throw new Error(`Missing ${label}`)
  return button.action
}

describe('Telegram courses', () => {
  test('confirms score changes, preserves zero, and rejects stale edits', async () => {
    const data = snapshot()
    const calls: { name: string; args?: Record<string, unknown> }[] = []
    const ctx: BotContext = {
      lang: 'en',
      route: 'co.grade',
      args: { id: courseId, student: studentId, entry: entryId, field: 'practical' },
      input: '\u0660',
      tools: new Set(['get_notebook', 'get_admin_board', 'save_grades']),
      website: 'https://example.test',
      call: async (name, args) => {
        calls.push({ name, args })
        return name === 'get_notebook' ? data : board
      },
    }
    const proposed = await courses(ctx)
    const confirm = action(proposed, 'Confirm')
    await courses({ ...ctx, route: confirm.route, args: confirm.args ?? {}, input: undefined })
    expect(calls.find((item) => item.name === 'save_grades')?.args).toEqual({
      input: { id: entryId, theory: 90, practical: 0, notes: 'Original' },
    })
    data.enrollments[0].notes = 'Concurrent edit'
    const stale = await courses({
      ...ctx,
      route: confirm.route,
      args: confirm.args ?? {},
      input: undefined,
    })
    expect(stale.text).toContain('record changed')
    expect(calls.filter((item) => item.name === 'save_grades')).toHaveLength(1)
  })
  test('denies missing permissions and gives Arabic course navigation', async () => {
    const ctx: BotContext = {
      lang: 'ar',
      route: 'co.list',
      args: {},
      tools: new Set(['get_notebook']),
      website: 'https://example.test',
      call: async () => snapshot(),
    }
    const list = await courses(ctx)
    expect(list.text).toBe('\u0627\u0644\u062f\u0648\u0631\u0627\u062a')
    expect(list.rows.flat().some((item) => item.label === 'Create course')).toBe(false)
    const denied = await courses({ ...ctx, route: 'co.status', args: { id: courseId } })
    expect(denied.text).toContain('\u063a\u064a\u0631 \u0645\u062a\u0627\u062d')
  })
  test('creates a stable course and returns an Excel document', async () => {
    const calls: string[] = []
    const ctx: BotContext = {
      lang: 'en',
      route: 'co.name',
      args: { id: '55555555-5555-4555-8555-555555555555' },
      input: 'New course',
      tools: new Set(['get_notebook', 'get_admin_board', 'save_course', 'export_course_report']),
      website: 'https://example.test',
      call: async (name) => {
        calls.push(name)
        return name === 'get_notebook'
          ? snapshot()
          : name === 'export_course_report'
            ? { blob: btoa('xlsx') }
            : board
      },
    }
    const confirm = action(await courses(ctx), 'Confirm')
    await courses({ ...ctx, route: confirm.route, args: confirm.args ?? {}, input: undefined })
    expect(calls).toContain('save_course')
    const report = await courses({
      ...ctx,
      route: 'co.report',
      args: { id: courseId, report: 'grades' },
      input: undefined,
    })
    expect(new TextDecoder().decode(report.document?.bytes)).toBe('xlsx')
  })
})
