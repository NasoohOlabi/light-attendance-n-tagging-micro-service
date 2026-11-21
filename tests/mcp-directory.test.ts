import { expect, test } from 'bun:test'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { registerDirectoryTools } from '../server/mcp-directory'

test('directory matches Arabic names and limits details to scoped records', async () => {
  const [studentId, hiddenId, courseId, enrollmentId, teacherId] = Array.from({ length: 5 }, () =>
    crypto.randomUUID(),
  )
  const snapshot = {
    teacher: { id: teacherId, name: 'Teacher', canRead: true, canWrite: true, expiresAt: null },
    students: [
      {
        kind: 'student',
        studentId,
        name: 'إبراهيم',
        group: 'Roster',
        active: true,
        whatsapp: '1234567',
      },
    ],
    courses: [{ id: courseId, name: 'Course' }],
    enrollments: [
      {
        id: enrollmentId,
        courseId,
        studentId,
        level: '',
        practical: 90,
        theory: 80,
        notes: 'private grade',
        gradeDecisions: [],
      },
    ],
    events: [],
  }
  const server = new McpServer({ name: 'test', version: '1' })
  registerDirectoryTools(server, async () => Response.json(snapshot))
  const client = new Client({ name: 'test', version: '1' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  const find = await client.callTool({
    name: 'find_students',
    arguments: { query: 'ابرا', courseId },
  })
  expect(JSON.stringify(find)).toContain(studentId)
  expect(JSON.stringify(find)).toContain('level\\\":\\\"')
  const none = await client.callTool({
    name: 'find_students',
    arguments: { query: 'unrelated name' },
  })
  expect(JSON.stringify(none)).not.toContain(studentId)
  const denied = await client.callTool({
    name: 'get_student_details',
    arguments: { studentId: hiddenId },
  })
  expect(denied.isError).toBe(true)
  const details = await client.callTool({
    name: 'get_student_details',
    arguments: { studentId, courseId },
  })
  expect(JSON.stringify(details)).not.toContain('private grade')
  expect(JSON.stringify(details)).not.toContain('Roster')
  await client.close()
  await server.close()
})
