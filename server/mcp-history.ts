import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { projectEvents } from '../shared/ledger'
import { neonSnapshotSchema } from '../shared/neon'
import type { McpOperation } from './mcp-tools'

export function registerHistoryTools(
  server: McpServer,
  call: (operation: McpOperation) => Promise<Response>,
) {
  server.registerTool(
    'get_notebook_history',
    {
      description:
        'Read administrator notebook history in server order, newest first. Reversals retain their target and undone records remain visible.',
      inputSchema: z.object({
        courseId: z.union([z.uuid(), z.literal('none')]),
        studentId: z.uuid().optional(),
        kind: z.enum(['student', 'attendance', 'note', 'reversal']).optional(),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(50),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ courseId, studentId, kind, from, to, offset, limit }) => {
      const response = await call({ path: '/api/notebook', method: 'GET' })
      if (!response.ok)
        return { content: [{ type: 'text', text: await response.text() }], isError: true }
      const snapshot = neonSnapshotSchema.parse(await response.json())
      if (courseId !== 'none' && !snapshot.courses.some((course) => course.id === courseId))
        return { content: [{ type: 'text', text: 'Course not found' }], isError: true }
      const projection = projectEvents(snapshot.events)
      const byId = new Map(projection.events.map((event) => [event.id, event]))
      const enrollmentIds = new Set(
        snapshot.enrollments
          .filter((entry) => entry.courseId === courseId)
          .map((entry) => entry.id),
      )
      const rows = projection.events
        .filter((event) => {
          const target =
            event.payload.kind === 'reversal' ? byId.get(event.payload.targetId) : event
          if (
            target?.payload.kind === 'attendance' &&
            (courseId === 'none'
              ? !!target.payload.enrollmentId
              : !target.payload.enrollmentId || !enrollmentIds.has(target.payload.enrollmentId))
          )
            return false
          const payload = target?.payload
          if (
            studentId &&
            (!payload || payload.kind === 'reversal' || payload.studentId !== studentId)
          )
            return false
          if (kind && event.payload.kind !== kind) return false
          const date = payload && 'date' in payload ? payload.date : undefined
          if ((from && (!date || date < from)) || (to && (!date || date > to))) return false
          return true
        })
        .reverse()
        .map((event) => ({
          event,
          undone: projection.reversed.has(event.id),
          target:
            event.payload.kind === 'reversal' ? (byId.get(event.payload.targetId) ?? null) : null,
        }))
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              total: rows.length,
              offset,
              records: rows.slice(offset, offset + limit),
            }),
          },
        ],
      }
    },
  )
}
