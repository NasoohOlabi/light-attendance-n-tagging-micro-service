import { expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { z } from 'zod'
import { registerCourseWorkflows } from '../server/mcp-courses'
import { makeEvent } from '../shared/ledger'

test('course workflow pages membership, saved grades and readiness with actionable IDs', async () => {
  const courseId = crypto.randomUUID()
  const firstId = crypto.randomUUID()
  const inactiveId = crypto.randomUUID()
  const withdrawnId = crypto.randomUUID()
  const unassignedId = crypto.randomUUID()
  const enrollmentId = crypto.randomUUID()
  const inactiveEnrollmentId = crypto.randomUUID()
  const withdrawnEnrollmentId = crypto.randomUUID()
  const teacherId = crypto.randomUUID()
  const student = (studentId: string, name: string, active: boolean) => ({
    studentId,
    name,
    firstName: name,
    lastName: '',
    group: '1',
    active,
    teacherId: null,
  })
  const students = [
    student(firstId, 'Alice', true),
    student(inactiveId, 'Inactive', false),
    student(withdrawnId, 'Withdrawn', true),
    student(unassignedId, 'Unassigned', false),
  ]
  const enrollment = (id: string, studentId: string, active: boolean) => ({
    id,
    studentId,
    courseId,
    active,
    level: '',
    practical: 0,
    theory: null,
  })
  const mark = makeEvent('test', {
    kind: 'attendance',
    studentId: firstId,
    enrollmentId,
    date: '2026-01-01',
    status: 'early',
  })
  const snapshot = {
    teacher: {
      id: crypto.randomUUID(),
      name: 'Admin',
      canRead: true,
      canWrite: true,
      expiresAt: null,
    },
    students: students.map((item) => ({ ...item, kind: 'student' })),
    courses: [{ id: courseId, name: 'Course' }],
    enrollments: [
      {
        ...enrollment(enrollmentId, firstId, true),
        gradeDecisions: [
          {
            requestId: crypto.randomUUID(),
            result: 'pass',
            note: 'Decision',
            actor: 'admin',
            at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      enrollment(inactiveEnrollmentId, inactiveId, true),
      enrollment(withdrawnEnrollmentId, withdrawnId, false),
      { ...enrollment(crypto.randomUUID(), unassignedId, true), courseId: crypto.randomUUID() },
    ],
    events: [mark],
  }
  const board = {
    students,
    teachers: [{ teacherId, name: 'Teacher', active: true }],
    accounts: [
      {
        authUserId: 'admin',
        name: 'Fallback',
        profileName: 'Author',
        role: 'administrator',
        active: true,
        expiresAt: null,
        teacherId: null,
        studentId: null,
      },
    ],
  }
  const server = new McpServer({ name: 'test', version: '1' })
  registerCourseWorkflows(server, async ({ path }) =>
    Response.json(path === '/api/notebook' ? snapshot : board),
  )
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '1' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  const invoke = async (args: Record<string, unknown>) => {
    const result = await client.callTool({
      name: 'get_course_workflow',
      arguments: { courseId, ...args },
    })
    const content = z
      .array(z.object({ type: z.literal('text'), text: z.string() }))
      .parse(result.content)
    return z
      .object({ rows: z.array(z.record(z.string(), z.unknown())), total: z.number() })
      .passthrough()
      .parse(JSON.parse(content[0].text))
  }
  try {
    const grades = await invoke({})
    expect(grades.total).toBe(3)
    expect(grades.rows[0]).toMatchObject({
      enrollment: { id: enrollmentId, gradeDecisions: [{ authorName: 'Author' }] },
      calculatedResult: 'pending',
      effectiveResult: 'pass',
      attendance: { present: 1 },
    })
    expect(grades.gradesClose).toEqual({ eligibleWithSavedData: false, missingScores: 2 })
    const missing = await invoke({ missingScores: true })
    expect(missing.total).toBe(2)
    expect(missing.rows.map((row) => row.enrollment)).not.toContainEqual(
      expect.objectContaining({ id: withdrawnEnrollmentId }),
    )
    const membership = await invoke({ view: 'membership', search: 'Unassigned' })
    expect(membership.rows).toMatchObject([
      { student: { studentId: unassignedId }, enrollment: null, defaultLevel: '1' },
    ])
    expect(membership.teachers).toMatchObject([{ teacherId }])
    expect((await invoke({ view: 'membership', offset: 1, limit: 1 })).rows).toHaveLength(1)
    const readiness = await invoke({ view: 'readiness' })
    expect(readiness.total).toBe(1)
    expect(readiness.rows).toMatchObject([
      {
        enrollmentId,
        missingTheory: true,
        missingPractical: false,
        missingAttendance: false,
        lowPractical: true,
      },
    ])
    expect(readiness.readiness).toEqual({
      total: 1,
      missingTheory: 1,
      missingPractical: 0,
      missingAttendance: 0,
      lowTheory: 0,
      lowPractical: 1,
    })
    expect(
      (
        await client.callTool({
          name: 'get_course_workflow',
          arguments: { courseId: crypto.randomUUID() },
        })
      ).isError,
    ).toBe(true)
  } finally {
    await client.close()
    await server.close()
  }
})
