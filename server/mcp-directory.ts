import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { neonSnapshotSchema } from '../shared/neon'
import { projectEvents } from '../shared/ledger'
import { rankStudents } from '../shared/studentSearch'
import type { McpOperation } from './mcp-tools'

export function registerDirectoryTools(
  server: McpServer,
  call: (operation: McpOperation) => Promise<Response>,
) {
  async function snapshot() {
    const response = await call({ path: '/api/notebook', method: 'GET' })
    if (!response.ok) return null
    return neonSnapshotSchema.parse(await response.json())
  }
  const text = (value: unknown, isError = false) => ({
    content: [
      { type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value) },
    ],
    ...(isError ? { isError: true } : {}),
  })
  server.registerTool(
    'list_courses',
    {
      description: 'List accessible courses and whether they are open.',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const data = await snapshot()
      if (!data) return text('Unable to load courses', true)
      return text(data.courses.map(({ id, name, open }) => ({ id, name, open })))
    },
  )
  server.registerTool(
    'find_students',
    {
      description:
        'Find accessible students by name, with optional status and course filters. Course filter includes active memberships only.',
      inputSchema: z.object({
        query: z.string().trim().max(200),
        status: z.enum(['all', 'active', 'inactive']).default('all'),
        courseId: z.uuid().optional(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ query, status, courseId, offset, limit }) => {
      const data = await snapshot()
      if (!data) return text('Unable to load students', true)
      if (courseId && !data.courses.some((course) => course.id === courseId))
        return text('Course not found', true)
      const memberships = new Map(
        data.enrollments
          .filter((item) => item.courseId === courseId && item.active)
          .map((item) => [item.studentId, item]),
      )
      const students = data.students.filter(
        (student) =>
          (status === 'all' || student.active === (status === 'active')) &&
          (!courseId || (student.active && memberships.has(student.studentId))),
      )
      const matches = rankStudents(students, query)
      return text({
        total: matches.length,
        offset,
        students: matches.slice(offset, offset + limit).map((student) => ({
          studentId: student.studentId,
          name: student.name,
          active: student.active,
          level: courseId ? (memberships.get(student.studentId)?.level ?? '') : student.group,
        })),
      })
    },
  )
  server.registerTool(
    'get_student_details',
    {
      description:
        'Get one accessible student profile, enrollments and effective attendance and notes. Optional course scopes attendance and selected level.',
      inputSchema: z.object({ studentId: z.uuid(), courseId: z.uuid().optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ studentId, courseId }) => {
      const data = await snapshot()
      if (!data) return text('Unable to load student', true)
      const student = data.students.find((item) => item.studentId === studentId)
      const course = courseId ? data.courses.find((item) => item.id === courseId) : undefined
      const enrollments = data.enrollments.filter((item) => item.studentId === studentId)
      const selected = enrollments.find((item) => item.courseId === courseId)
      if (!student || (courseId && (!course || !selected)))
        return text('Student or course not found', true)
      const projection = projectEvents(data.events)
      const { group, ...profile } = student
      return text({
        student: profile,
        level: courseId ? (selected?.level ?? '') : group,
        courses: enrollments.map(({ id, courseId: idCourse, level, active }) => ({
          enrollmentId: id,
          courseId: idCourse,
          name: data.courses.find((item) => item.id === idCourse)?.name ?? '',
          ...(!courseId || idCourse === courseId ? { level } : {}),
          active,
        })),
        attendance: projection.attendance
          .filter(
            ({ value }) =>
              value.studentId === studentId && (!courseId || value.enrollmentId === selected?.id),
          )
          .map(({ event, value }) => ({ eventId: event.id, ...value })),
        notes: projection.notes
          .filter(({ value }) => value.studentId === studentId)
          .map(({ event, value }) => ({ eventId: event.id, ...value })),
      })
    },
  )
}
