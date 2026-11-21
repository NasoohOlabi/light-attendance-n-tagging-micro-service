import { expect, test } from 'bun:test'
import { notebook } from '../telegram/notebook'
import type { Action, BotContext, Screen } from '../telegram/types'

const teacherId = '11111111-1111-4111-8111-111111111111'
const studentId = '22222222-2222-4222-8222-222222222222'
const courseId = '33333333-3333-4333-8333-333333333333'
const enrollmentId = '44444444-4444-4444-8444-444444444444'
const snapshot = () => ({
  teacher: { id: teacherId, name: 'Teacher', canRead: true, canWrite: true, expiresAt: null },
  students: [{ kind: 'student', studentId, name: 'Synthetic Student', group: 'A', active: true }],
  courses: [{ id: courseId, name: 'Course', open: true }],
  enrollments: [
    {
      id: enrollmentId,
      courseId,
      studentId,
      level: '',
      practical: null,
      theory: null,
      active: true,
    },
  ],
  events: [],
})
function find(screen: Screen, label: string): Action {
  const item = screen.rows.flat().find((b) => b.label === label)
  if (!item || !('action' in item)) throw new Error(`Missing ${label}`)
  return item.action
}
test('roster, attendance, note and correction use scoped tools and preserve expected revision', async () => {
  const data = snapshot()
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  const ctx: BotContext = {
    lang: 'en',
    website: 'https://example.test',
    route: 'nb.students',
    args: {},
    tools: new Set(['get_notebook', 'sync_attendance', 'append_events']),
    call: async (name, args) => {
      calls.push({ name, args })
      if (name === 'get_notebook') return data
      if (name === 'sync_attendance') {
        const records = zRecords.parse(args).records
        return { outcomes: [{ id: records[0]?.event.id, kind: 'saved', current: null }] }
      }
      return { saved: 1 }
    },
  }
  const run = (action: Action, input?: string) =>
    notebook({ ...ctx, ...action, args: action.args ?? {}, input })
  const roster = await run({ route: 'nb.students' })
  expect(find(roster, 'Synthetic Student').args?.studentId).toBe(studentId)
  const roll = await run({ route: 'nb.roll', args: { courseId, date: '2026-11-21' } })
  const mark = find(roll, 'Present')
  expect(mark.args?.expected).toBe('')
  expect((await run(mark)).text).toContain('saved')
  expect(
    zRecords.parse(calls.find((c) => c.name === 'sync_attendance')?.args).records[0]
      ?.expectedEventId,
  ).toBeNull()
  const tags = await run({ route: 'nb.note.tags', args: { studentId } })
  expect(tags.prompt).toBeDefined()
  const text = await run(tags.prompt!, 'follow up, homework')
  expect(text.prompt).toBeDefined()
  expect((await run(text.prompt!, 'Needs support')).text).toContain('saved')
  expect(calls.find((c) => c.name === 'append_events')?.args).toBeDefined()
})

test('student route calls only their projection and paginates', async () => {
  const calls: string[] = []
  const ctx: BotContext = {
    lang: 'ar',
    website: 'https://example.test',
    route: 'nb.mine',
    args: {},
    tools: new Set(['get_my_attendance']),
    call: async (name) => {
      calls.push(name)
      return {
        student: { studentId, name: 'Synthetic Student', group: '' },
        attendance: Array.from({ length: 9 }, () => ({
          date: '2026-11-21',
          status: 'present',
          course: 'Course',
        })),
      }
    },
  }
  const screen = await notebook(ctx)
  expect(screen.text).toContain('حاضر')
  expect(find(screen, 'التالي').args?.page).toBe('1')
  expect(calls).toEqual(['get_my_attendance'])
  expect((await notebook({ ...ctx, route: 'nb.students' })).text).toContain('غير متاح')
})

import { z } from 'zod'
const zRecords = z.object({
  records: z.array(
    z.object({ event: z.object({ id: z.string() }), expectedEventId: z.string().nullable() }),
  ),
})

test('conflict does not claim a save and corrections require confirmation', async () => {
  const eventId = '55555555-5555-4555-8555-555555555555'
  const data = {
    ...snapshot(),
    events: [
      {
        id: eventId,
        actor: 'Teacher',
        clientTime: '2026-11-21T12:00:00.000Z',
        receivedAt: '',
        payload: {
          kind: 'attendance',
          studentId,
          enrollmentId,
          date: '2026-11-21',
          status: 'late',
        },
      },
    ],
  }
  let writes = 0
  const ctx: BotContext = {
    lang: 'en',
    website: 'https://example.test',
    route: 'nb.roll',
    args: { courseId, date: '2026-11-21' },
    tools: new Set(['get_notebook', 'sync_attendance', 'append_events']),
    call: async (name, args) => {
      if (name === 'get_notebook') return data
      if (name === 'sync_attendance')
        return {
          outcomes: [
            {
              id: zRecords.parse(args).records[0]?.event.id,
              kind: 'conflict',
              current: { eventId, status: 'present' },
            },
          ],
        }
      writes += 1
      return { saved: 1 }
    },
  }
  const run = (action: Action, input?: string) =>
    notebook({ ...ctx, ...action, args: action.args ?? {}, input })
  const roll = await run({ route: 'nb.roll', args: ctx.args })
  const mark = find(roll, 'Absent')
  expect(mark.args?.expected).toBe(eventId)
  expect((await run(mark)).text).toContain('changed')
  const item = await run({ route: 'nb.history.item', args: { studentId, targetId: eventId } })
  const reason = await run(find(item, 'Correct'))
  const confirm = await run(reason.prompt!, 'Mistake')
  expect(writes).toBe(0)
  await run(find(confirm, 'Confirm'))
  expect(writes).toBe(1)
})

test('course-context student creation is atomic and returns to membership', async () => {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  const ctx: BotContext = {
    lang: 'en',
    website: 'https://example.test',
    route: 'nb.add',
    args: { courseId },
    tools: new Set(['get_notebook', 'create_student_in_course']),
    call: async (name, args) => {
      calls.push({ name, args })
      return name === 'get_notebook' ? snapshot() : { saved: 1 }
    },
  }
  const run = (action: Action, input?: string) =>
    notebook({ ...ctx, ...action, args: action.args ?? {}, input })
  const name = await run({ route: 'nb.add', args: { courseId } })
  const level = await run(name.prompt!, 'New Student')
  const done = await run(level.prompt!, 'Level 1')
  const call = calls.find((item) => item.name === 'create_student_in_course')
  expect(call?.args).toMatchObject({
    input: { student: { name: 'New Student' }, enrollment: { courseId, level: 'Level 1' } },
  })
  expect(find(done, 'Back')).toEqual({ route: 'co.members', args: { id: courseId } })
})

test('profile edits preserve displayed expected version and validate fields', async () => {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  const ctx: BotContext = {
    lang: 'en',
    website: 'https://example.test',
    route: 'nb.edit',
    args: { studentId },
    tools: new Set(['get_notebook', 'update_student']),
    call: async (name, args) => {
      calls.push({ name, args })
      return name === 'get_notebook' ? snapshot() : { saved: 1 }
    },
  }
  const run = (action: Action, input?: string) =>
    notebook({ ...ctx, ...action, args: action.args ?? {}, input })
  const edit = await run({ route: 'nb.edit', args: { studentId } })
  const question = await run(find(edit, 'Birth year'))
  expect((await run(question.prompt!, 'bad')).prompt).toBeDefined()
  await run(question.prompt!, '2000')
  expect(calls.find((c) => c.name === 'update_student')?.args).toMatchObject({
    studentId,
    birthYear: 2000,
    expected: { birthYear: null, group: 'A' },
  })
})

test('long notes are paginated and summaries normalize legacy attendance', async () => {
  const id = '55555555-5555-4555-8555-555555555555'
  const data = {
    ...snapshot(),
    events: [
      {
        id,
        actor: 'Teacher',
        clientTime: '2026-11-21T12:00:00.000Z',
        receivedAt: '',
        payload: {
          kind: 'note',
          studentId,
          date: '2026-11-21',
          tags: ['test'],
          text: 'x'.repeat(5000),
        },
      },
    ],
  }
  const ctx: BotContext = {
    lang: 'en',
    website: 'https://example.test',
    route: 'nb.history.item',
    args: { studentId, targetId: id },
    tools: new Set(['get_notebook']),
    call: async () => data,
  }
  const first = await notebook(ctx)
  expect(first.text.length).toBeLessThan(4096)
  const next = find(first, 'Next')
  expect((await notebook({ ...ctx, ...next, args: next.args ?? {} })).text.length).toBeLessThan(
    4096,
  )
  const summary = await notebook({ ...ctx, route: 'nb.summary', args: {} })
  expect(find(summary, 'Previous / no course').args?.courseId).toBe('previous')
})

test('course insights show server follow-up and paginate anonymous chart with safe link', async () => {
  const calls: Record<string, unknown>[] = []
  const ctx: BotContext = {
    lang: 'en',
    website: 'https://example.test',
    route: 'nb.summary.course',
    args: { courseId },
    tools: new Set(['get_notebook', 'get_course_attendance_view']),
    call: async (name, args) => {
      if (name === 'get_notebook') return snapshot()
      calls.push(args ?? {})
      if (args?.view === 'overview')
        return {
          date: '2026-11-21',
          recentDates: ['2026-11-20'],
          sessionCounts: { marked: 2, unmarked: 1 },
          followUp: [{ name: 'Synthetic Student', absences: 2, marks: ['absent'] }],
        }
      return {
        summaryUrl: 'https://example.test/?page=app&tab=summary',
        chart: Array.from({ length: 9 }, (_, i) => ({
          label: `Student ${i + 1}`,
          rate: i ? 0 : 0.5,
          evidence: i ? '0% (0/1)' : '50% (1/2)',
        })),
      }
    },
  }
  const run = (action: Action) => notebook({ ...ctx, ...action, args: action.args ?? {} })
  const summary = await run({ route: 'nb.summary.course', args: { courseId } })
  const follow = await run(find(summary, 'Follow-up'))
  expect(follow.text).toContain('Synthetic Student · Absences: 2')
  expect(follow.text).toContain('Marked 2 · Unmarked 1')
  const chart = await run(find(summary, 'Attendance chart'))
  expect(chart.text).toContain('Student 1 · 50% (1/2)\n█████░░░░░')
  expect(chart.text).not.toContain('Student 9')
  expect((await run(find(chart, 'Next'))).text).toContain('Student 9')
  expect(
    chart.rows.flat().some((item) => 'url' in item && item.url.startsWith('https://example.test/')),
  ).toBe(true)
  expect(calls[0]).toMatchObject({ courseId, view: 'overview', language: 'en' })
  const bad = {
    ...ctx,
    route: 'nb.chart',
    call: async () => ({ summaryUrl: 'https://evil.test/', chart: [] }),
  }
  await expect(notebook(bad)).rejects.toThrow('Invalid summary URL')
})

test('insights localize empty states and translate previous course for server', async () => {
  let requested: Record<string, unknown> | undefined
  const ctx: BotContext = {
    lang: 'ar',
    website: 'https://example.test',
    route: 'nb.followup',
    args: { courseId: 'previous' },
    tools: new Set(['get_course_attendance_view']),
    call: async (_name, args) => {
      requested = args
      return {
        date: '2026-11-21',
        recentDates: [],
        sessionCounts: { marked: 0, unmarked: 0 },
        followUp: [],
      }
    },
  }
  const result = await notebook(ctx)
  expect(result.text).toContain('لا يوجد طلاب يحتاجون للمتابعة')
  expect(requested).toMatchObject({ courseId: 'none', view: 'overview', language: 'ar' })
})
