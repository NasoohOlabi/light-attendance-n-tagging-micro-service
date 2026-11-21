import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { projectEvents } from '../shared/ledger'
import { attendanceChartRows, labelChartRows } from '../shared/attendanceChart'
import { rankAbsenceSessions } from '../shared/attendanceInsights'
import { neonSnapshotSchema } from '../shared/neon'
import type { McpOperation } from './mcp-tools'

export function registerNotebookWorkflows(
  server: McpServer,
  call: (operation: McpOperation) => Promise<Response>,
  origin: string,
) {
  server.registerTool(
    'get_course_attendance_view',
    {
      description:
        'Read the session roster and marks for a course and date, including event IDs for sync_attendance. Choose overview for six-session follow-up and all-date totals, or chart for anonymous chart rows and the browser export link. Use none for historical unscoped records.',
      inputSchema: z.object({
        courseId: z.union([z.uuid(), z.literal('none')]),
        date: z.iso.date(),
        view: z.enum(['session', 'overview', 'chart']).default('session'),
        language: z.enum(['en', 'ar']).default('en'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ courseId, date, view, language }) => {
      const response = await call({ path: '/api/notebook', method: 'GET' })
      if (!response.ok)
        return { content: [{ type: 'text', text: await response.text() }], isError: true }
      const snapshot = neonSnapshotSchema.parse(await response.json())
      const course = snapshot.courses.find((item) => item.id === courseId)
      if (courseId !== 'none' && !course)
        return { content: [{ type: 'text', text: 'Course not found' }], isError: true }
      const enrollments = snapshot.enrollments.filter((item) => item.courseId === courseId)
      const enrollmentByStudent = new Map(enrollments.map((item) => [item.studentId, item]))
      const ids = new Set(enrollments.map((item) => item.id))
      const projection = projectEvents(snapshot.events)
      const attendance = projection.attendance.filter(({ value }) =>
        courseId === 'none'
          ? !value.enrollmentId
          : !!value.enrollmentId && ids.has(value.enrollmentId),
      )
      const students = snapshot.students
        .filter((student) =>
          courseId === 'none' ? student.active : enrollmentByStudent.has(student.studentId),
        )
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name, language) || a.studentId.localeCompare(b.studentId),
        )
      const url = new URL('/', origin)
      url.search = new URLSearchParams({ page: 'app', tab: 'summary', course: courseId }).toString()
      if (view === 'chart') {
        const chart = labelChartRows(
          attendanceChartRows(students, attendance),
          language,
          false,
          '',
        ).map(({ label, rate, evidence }) => ({ label, rate, evidence }))
        return {
          content: [{ type: 'text', text: JSON.stringify({ summaryUrl: url.href, chart }) }],
        }
      }
      const active = students.filter(
        (student) =>
          student.active &&
          (courseId === 'none' || enrollmentByStudent.get(student.studentId)?.active),
      )
      const records = new Map<string, (typeof attendance)[number]>()
      const counts = new Map<
        string,
        { present: number; absent: number; excused: number; notes: number }
      >()
      const days = new Map<
        string,
        { date: string; present: number; absent: number; excused: number }
      >()
      for (const student of students)
        counts.set(student.studentId, { present: 0, absent: 0, excused: 0, notes: 0 })
      for (const record of attendance) {
        const { studentId, date: day, status } = record.value
        records.set(`${studentId}:${day}`, record)
        const total = counts.get(studentId)
        if (!total) continue
        total[status]++
        const row = days.get(day) ?? { date: day, present: 0, absent: 0, excused: 0 }
        row[status]++
        days.set(day, row)
      }
      for (const { value } of projection.notes) {
        const total = counts.get(value.studentId)
        if (total) total.notes++
      }
      const session = active.map((student) => {
        const enrollment = enrollmentByStudent.get(student.studentId)
        const record = records.get(`${student.studentId}:${date}`)
        return {
          studentId: student.studentId,
          name: student.name,
          enrollmentId: enrollment?.id ?? null,
          level: enrollment?.level ?? student.group,
          teacherId: enrollment?.teacherId ?? null,
          teacherName: enrollment?.teacherName ?? null,
          status: record?.value.status ?? 'unmarked',
          eventId: record?.event.id ?? null,
        }
      })
      const marked = session.filter((row) => row.status !== 'unmarked').length
      const sessionView = {
        course: course ? { id: course.id, name: course.name, open: course.open } : null,
        date,
        sessionCounts: { marked, unmarked: session.length - marked },
        session,
      }
      if (view === 'session')
        return { content: [{ type: 'text', text: JSON.stringify(sessionView) }] }
      const dates = [
        ...new Set(
          attendance.filter(({ value }) => value.date <= date).map(({ value }) => value.date),
        ),
      ]
        .sort()
        .slice(-6)
      const followUp = active
        .map((student) => {
          const marks = dates.map(
            (day) => records.get(`${student.studentId}:${day}`)?.value.status ?? 'unmarked',
          )
          return {
            studentId: student.studentId,
            name: student.name,
            marks,
            absences: marks.filter((mark) => mark === 'absent').length,
          }
        })
        .filter((row) => row.absences > 0)
        .sort((a, b) => b.absences - a.absences || a.name.localeCompare(b.name, language))
      const breakdown = rankAbsenceSessions([...days.values()])
      const totals = students.map((student) => {
        const enrollment = enrollmentByStudent.get(student.studentId)
        const total = counts.get(student.studentId) ?? {
          present: 0,
          absent: 0,
          excused: 0,
          notes: 0,
        }
        const recorded = total.present + total.absent + total.excused
        return {
          studentId: student.studentId,
          name: student.name,
          enrollmentId: enrollment?.id ?? null,
          active: student.active,
          membershipActive: enrollment?.active ?? null,
          ...total,
          rate: recorded ? total.present / recorded : null,
        }
      })
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ...sessionView,
              summaryUrl: url.href,
              recentDates: dates,
              followUp,
              breakdown,
              totals,
            }),
          },
        ],
      }
    },
  )
}
