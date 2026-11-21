import { expect, test } from 'bun:test'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { registerHistoryTools } from '../server/mcp-history'
import { registerNotebookWorkflows } from '../server/mcp-notebook'

test('course attendance view projects corrections and includes unmarked students', async () => {
  const [
    courseId,
    studentId,
    otherId,
    enrollmentId,
    otherEnrollmentId,
    teacherId,
    firstId,
    secondId,
    reversalId,
  ] = Array.from({ length: 9 }, () => crypto.randomUUID())
  const enrollment = (id: string, student: string) => ({
    id,
    courseId,
    studentId: student,
    level: '',
    practical: null,
    theory: null,
  })
  const event = (id: string, payload: object) => ({
    id,
    actor: 'Teacher',
    clientTime: '2026-01-01T00:00:00.000Z',
    receivedAt: '',
    payload,
  })
  const snapshot = {
    teacher: { id: teacherId, name: 'Teacher', canRead: true, canWrite: true, expiresAt: null },
    students: [
      { kind: 'student', studentId, name: 'A', group: '', active: true },
      { kind: 'student', studentId: otherId, name: 'B', group: '', active: true },
    ],
    courses: [{ id: courseId, name: 'Course' }],
    enrollments: [
      enrollment(enrollmentId, studentId),
      { ...enrollment(otherEnrollmentId, otherId), active: false },
    ],
    events: [
      event(crypto.randomUUID(), {
        kind: 'attendance',
        studentId,
        date: '2026-01-02',
        status: 'absent',
      }),
      event(crypto.randomUUID(), {
        kind: 'attendance',
        studentId: otherId,
        enrollmentId: otherEnrollmentId,
        date: '2026-01-03',
        status: 'absent',
      }),
      event(crypto.randomUUID(), {
        kind: 'note',
        studentId,
        date: '2026-01-03',
        tags: ['followup'],
        text: 'Note',
      }),
      event(firstId, {
        kind: 'attendance',
        studentId,
        enrollmentId,
        date: '2026-01-01',
        status: 'late',
      }),
      event(secondId, {
        kind: 'attendance',
        studentId,
        enrollmentId,
        date: '2026-01-01',
        status: 'absent',
      }),
      event(reversalId, { kind: 'reversal', targetId: secondId, reason: 'Correction' }),
    ],
  }
  const server = new McpServer({ name: 'test', version: '1' })
  registerNotebookWorkflows(server, async () => Response.json(snapshot), 'https://example.test')
  registerHistoryTools(server, async () => Response.json(snapshot))
  const client = new Client({ name: 'test', version: '1' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  const result = await client.callTool({
    name: 'get_course_attendance_view',
    arguments: { courseId, date: '2026-01-01', view: 'overview' },
  })
  const content = result.content
  if (!Array.isArray(content) || content[0]?.type !== 'text' || typeof content[0].text !== 'string')
    throw new Error('Missing text')
  const view = JSON.parse(content[0].text)
  expect(
    view.session.map((row: { status: string; eventId: string | null }) => [
      row.status,
      row.eventId,
    ]),
  ).toEqual([['present', firstId]])
  expect(view.breakdown[0].absent).toBe(1)
  expect(view.totals[0].notes).toBe(1)
  expect(view.totals[1].membershipActive).toBe(false)
  expect(view.recentDates).toEqual(['2026-01-01'])
  const historical = await client.callTool({
    name: 'get_course_attendance_view',
    arguments: { courseId: 'none', date: '2026-01-02', view: 'overview' },
  })
  if (
    !Array.isArray(historical.content) ||
    historical.content[0]?.type !== 'text' ||
    typeof historical.content[0].text !== 'string'
  )
    throw new Error('Missing text')
  const previous = JSON.parse(historical.content[0].text)
  expect(previous.breakdown).toHaveLength(1)
  expect(previous.session[0].status).toBe('absent')
  expect(view.totals[0].rate).toBe(1)
  const chart = await client.callTool({
    name: 'get_course_attendance_view',
    arguments: { courseId, date: '2026-01-01', view: 'chart' },
  })
  expect(JSON.stringify(chart.content)).toContain('Student 1')
  expect(JSON.stringify(chart.content)).not.toContain(studentId)
  expect(JSON.stringify(chart.content)).not.toContain('sessionCounts')
  const history = await client.callTool({
    name: 'get_notebook_history',
    arguments: { courseId, studentId, limit: 1 },
  })
  if (
    !Array.isArray(history.content) ||
    history.content[0]?.type !== 'text' ||
    typeof history.content[0].text !== 'string'
  )
    throw new Error('Missing text')
  const page = JSON.parse(history.content[0].text)
  expect(page.records[0].event.id).toBe(reversalId)
  expect(page.records[0].target.id).toBe(secondId)
  expect(page.total).toBe(4)
  await client.close()
  await server.close()
})
