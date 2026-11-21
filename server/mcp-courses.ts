import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { courseReadiness } from '../shared/courseReadiness'
import {
  courseAttendance,
  effectiveGradeResult,
  missingCourseScores,
  savedGradeResult,
} from '../shared/courseGrading'
import { projectEvents } from '../shared/ledger'
import { accountProfileLabel, neonAdminBoardSchema, neonSnapshotSchema } from '../shared/neon'
import { rankStudents } from '../shared/studentSearch'
import type { McpOperation } from './mcp-tools'

export function registerCourseWorkflows(
  server: McpServer,
  call: (operation: McpOperation) => Promise<Response>,
) {
  server.registerTool(
    'get_course_workflow',
    {
      description:
        'Get paginated course membership, grades, or result readiness. Search student names using the notebook matcher. Grades close readiness uses saved data only; manual closure is independent.',
      inputSchema: z.object({
        courseId: z.uuid(),
        view: z.enum(['membership', 'grades', 'readiness']).default('grades'),
        search: z.string().max(200).default(''),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(50),
        missingScores: z.boolean().default(false),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ courseId, view, search, offset, limit, missingScores }) => {
      const [notebook, directory] = await Promise.all([
        call({ path: '/api/notebook', method: 'GET' }),
        call({ path: '/api/admin', method: 'GET' }),
      ])
      const error = !notebook.ok ? notebook : !directory.ok ? directory : null
      if (error) return { content: [{ type: 'text', text: await error.text() }], isError: true }
      const snapshot = neonSnapshotSchema.parse(await notebook.json())
      const board = neonAdminBoardSchema.parse(await directory.json())
      const course = snapshot.courses.find(({ id }) => id === courseId)
      if (!course) return { content: [{ type: 'text', text: 'Course not found' }], isError: true }
      const entries = snapshot.enrollments.filter((entry) => entry.courseId === courseId)
      const attendance = projectEvents(snapshot.events).attendance
      const readiness = courseReadiness({
        course,
        enrollments: entries,
        students: board.students.map((student) => ({ ...student, kind: 'student' })),
        attendance,
      })
      const missing = missingCourseScores(entries)
      const entryByStudent = new Map(entries.map((entry) => [entry.studentId, entry]))
      const matching = rankStudents(board.students, search).filter((student) => {
        const entry = entryByStudent.get(student.studentId)
        if (view === 'membership') return true
        if (!entry) return false
        if (view === 'readiness') return student.active && entry.active
        return !missingScores || missing.includes(entry)
      })
      const has = (rows: typeof readiness.theory, id: string) =>
        rows.some(({ entry }) => entry.id === id)
      const rows = matching.slice(offset, offset + limit).map((student) => {
        const entry = entryByStudent.get(student.studentId)
        const identity = {
          studentId: student.studentId,
          name: student.name,
          firstName: student.firstName,
          lastName: student.lastName,
          active: student.active,
          rosterLevel: student.group,
        }
        if (view === 'membership')
          return {
            student: identity,
            enrollment: entry
              ? {
                  id: entry.id,
                  courseId: entry.courseId,
                  studentId: entry.studentId,
                  level: entry.level,
                  active: entry.active,
                  teacherId: entry.teacherId,
                  handbookReceived: entry.handbookReceived,
                }
              : null,
            defaultLevel: entry?.level ?? student.group,
          }
        if (!entry) throw new Error('Enrollment missing from course view')
        if (view === 'readiness')
          return {
            student: identity,
            enrollmentId: entry.id,
            missingTheory: has(readiness.theory, entry.id),
            missingPractical: has(readiness.practical, entry.id),
            missingAttendance: has(readiness.attendance, entry.id),
            lowTheory: has(readiness.lowTheory, entry.id),
            lowPractical: has(readiness.lowPractical, entry.id),
          }
        const totals = courseAttendance(attendance, entry)
        return {
          student: identity,
          enrollment: {
            ...entry,
            gradeDecisions: entry.gradeDecisions.map((decision) => {
              const author = board.accounts.find((account) => account.authUserId === decision.actor)
              return { ...decision, authorName: author ? accountProfileLabel(author) : null }
            }),
          },
          attendance: totals,
          calculatedResult: savedGradeResult(course, entry, totals.ratio),
          effectiveResult: effectiveGradeResult(course, entry, totals.ratio),
        }
      })
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              course,
              view,
              total: matching.length,
              offset,
              limit,
              rows,
              ...(view === 'membership' ? { teachers: board.teachers } : {}),
              ...(view === 'readiness'
                ? {
                    readiness: {
                      total: readiness.total,
                      missingTheory: readiness.theory.length,
                      missingPractical: readiness.practical.length,
                      missingAttendance: readiness.attendance.length,
                      lowTheory: readiness.lowTheory.length,
                      lowPractical: readiness.lowPractical.length,
                    },
                  }
                : {}),
              ...(view === 'grades'
                ? {
                    gradesClose: {
                      eligibleWithSavedData: course.open && missing.length === 0,
                      missingScores: missing.length,
                    },
                  }
                : {}),
            }),
          },
        ],
      }
    },
  )
}
