import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  courseExportColumns,
  courseExportRows,
  courseWorkbook,
  type CourseExportInput,
} from '../shared/courseExport'
import { projectEvents, payloadSchema, statusSchema } from '../shared/ledger'
import { invitationProfileInputSchema, invitationRequestSchema } from '../shared/invitations'
import {
  courseInputSchema,
  courseSettingsSchema,
  courseStatusSchema,
  enrollmentGradesSchema,
  enrollmentHandbookSchema,
  enrollmentMembershipSchema,
  gradeDecisionInputSchema,
  teacherStudentUpdateSchema,
  neonAdminBoardSchema,
  neonAdminDisableSchema,
  neonAdminGrantSchema,
  neonAdminPasswordResetSchema,
  neonAdminStudentEnrollSchema,
  neonAdminStudentSchema,
  neonSnapshotSchema,
  type NeonAccount,
} from '../shared/neon'
import { offlineAttendanceRecordSchema } from '../shared/offlineAttendance'
import { offlineStudentOperationSchema } from '../shared/offlineStudent'
import { profileUpdateSchema } from './profile'

const eventInput = z.object({
  id: z.uuid(),
  clientTime: z.iso.datetime(),
  payload: payloadSchema,
})
const offlineEvent = eventInput.extend({
  payload: z.object({
    kind: z.literal('attendance'),
    studentId: z.uuid(),
    enrollmentId: z.uuid(),
    date: z.iso.date(),
    status: z.enum(['present', 'absent', 'excused']),
  }),
})
const offlineNote = eventInput.extend({
  payload: z.object({
    kind: z.literal('note'),
    studentId: z.uuid(),
    date: z.iso.date(),
    tags: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
    text: z.string().trim().min(1).max(10000),
  }),
})

const courseReport = z.object({
  courseId: z.uuid(),
  report: z.enum(['full', 'grades', 'students', 'attendance', 'participants']).default('full'),
  format: z.enum(['rows', 'xlsx']).default('rows'),
  language: z.enum(['en', 'ar']).default('en'),
  enrollment: z.enum(['all', 'active', 'withdrawn']).optional(),
  studentId: z.uuid().optional(),
  level: z.string().max(100).optional(),
  coverage: z.enum(['all', 'any', 'both', 'theory', 'practical', 'none']).optional(),
  result: z.enum(['all', 'pass', 'fail', 'pending']).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  mark: z.union([z.literal('all'), statusSchema]).optional(),
})

export type McpOperation = { path: string; method: 'GET' | 'POST'; body?: unknown }

export function registerMcpTools(
  server: McpServer,
  call: (operation: McpOperation) => Promise<Response>,
  scopes: readonly string[],
  account: NeonAccount,
  identity: { userId: string },
) {
  const read = scopes.includes('mcp:read')
  const write = scopes.includes('mcp:write')
  const ready =
    !account.invitationProfile?.requiresSetup &&
    (!account.expiresAt || Date.parse(account.expiresAt) > Date.now())
  const staff = account.role !== 'student'
  const admin = staff && account.role === 'administrator' && account.canRead && account.canWrite
  const text = (value: string, isError = false) => ({
    content: [{ type: 'text' as const, text: value }],
    ...(isError ? { isError: true } : {}),
  })
  const result = async (path: string, method: 'GET' | 'POST', body?: unknown) => {
    const response = await call({ path, method, ...(body === undefined ? {} : { body }) })
    return text(await response.text(), !response.ok)
  }
  const get = (name: string, description: string, path: string) =>
    server.registerTool(name, { description, annotations: { readOnlyHint: true } }, () =>
      result(path, 'GET'),
    )
  const post = <T extends z.ZodType>(name: string, description: string, path: string, schema: T) =>
    server.registerTool(name, { description, inputSchema: z.object({ input: schema }) }, (args) =>
      result(path, 'POST', schema.parse(z.record(z.string(), z.unknown()).parse(args).input)),
    )

  if (read) {
    get('get_account', 'Get the current application account and access permissions.', '/api/me')
    get('get_profile', 'Get your profile name and image.', '/api/mcp/profile')
  }
  if (write) {
    post(
      'update_profile',
      'Update your profile name and optional image.',
      '/api/mcp/profile',
      profileUpdateSchema,
    )
    if (account.invitationProfile)
      post(
        'update_invitation_profile',
        'Update your invitation profile with your current password; setting a new password revokes sessions.',
        '/api/me/invitation-profile',
        invitationProfileInputSchema,
      )
  }
  if (!ready) return
  if (!staff) {
    if (read)
      get(
        'get_my_attendance',
        'Get your own projected attendance, including course names.',
        '/api/student/attendance',
      )
    return
  }
  if (read && account.canRead) {
    get(
      'get_notebook',
      'Get your authorized roster, courses, enrollments, event history and notes. Attendance events use enrollment IDs to identify courses.',
      '/api/notebook',
    )
    server.registerTool(
      'get_attendance_summary',
      {
        description:
          'Project your authorized notebook events into current attendance and notes; reversed events are excluded and legacy early/late marks count as present.',
      },
      async () => {
        const response = await call({ path: '/api/notebook', method: 'GET' })
        if (!response.ok)
          return { content: [{ type: 'text', text: await response.text() }], isError: true }
        const snapshot = neonSnapshotSchema.parse(await response.json())
        const projected = projectEvents(snapshot.events)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                students: snapshot.students,
                courses: snapshot.courses,
                enrollments: snapshot.enrollments,
                attendance: projected.attendance,
                notes: projected.notes,
              }),
            },
          ],
        }
      },
    )
  }
  if (write && account.canWrite) {
    server.registerTool(
      'update_student',
      {
        description: 'Update information for an active assigned student.',
        inputSchema: teacherStudentUpdateSchema,
      },
      (student) => result('/api/student/update', 'POST', student),
    )
    server.registerTool(
      'append_events',
      {
        description:
          'Append attendance, tagged notes or corrections. Supply stable IDs and client times for safe retries. New attendance must reference an active enrollment in an open course.',
        inputSchema: z.object({ events: z.array(eventInput).min(1).max(500) }),
      },
      async ({ events }) => {
        const response = await call({
          path: '/api/events',
          method: 'POST',
          body: {
            events: events.map((event) => ({ ...event, actor: account.name, receivedAt: '' })),
          },
        })
        const text =
          response.ok && !read ? JSON.stringify({ saved: events.length }) : await response.text()
        return { content: [{ type: 'text', text }], ...(response.ok ? {} : { isError: true }) }
      },
    )
    if (read && account.canRead) {
      server.registerTool(
        'sync_attendance',
        {
          description:
            'Compare and commit attendance records. Supply the expected event ID (or null) and stable event ID/time; returns per-record conflicts.',
          inputSchema: z.object({
            records: z
              .array(
                z.object({
                  event: offlineEvent,
                  expectedEventId: z.uuid().nullable(),
                  expectedRevision: z.literal('unknown').optional(),
                }),
              )
              .min(1)
              .max(500),
          }),
        },
        ({ records }) =>
          result('/api/attendance/sync', 'POST', {
            accountId: identity.userId,
            records: records.map(({ event, ...record }) =>
              offlineAttendanceRecordSchema.parse({
                ...record,
                event: { ...event, actor: account.name, receivedAt: '' },
              }),
            ),
          }),
      )
      const contact = offlineStudentOperationSchema.options[1]
      server.registerTool(
        'sync_student',
        {
          description:
            'Compare and update a student contact or append a note with stable ID and time.',
          inputSchema: z.object({
            operation: z.discriminatedUnion('kind', [
              z.object({ kind: z.literal('note'), event: offlineNote }).strict(),
              contact,
            ]),
          }),
        },
        ({ operation }) =>
          result('/api/student/sync', 'POST', {
            accountId: identity.userId,
            operation:
              operation.kind === 'note'
                ? {
                    ...operation,
                    event: { ...operation.event, actor: account.name, receivedAt: '' },
                  }
                : operation,
          }),
      )
    }
  }
  if (!(admin && read)) return
  get(
    'get_admin_board',
    'Get accounts, teachers and full student register for administration.',
    '/api/admin',
  )
  server.registerTool(
    'export_course_report',
    {
      description:
        'Export the selected course as rows or as an Excel workbook. Apply the same attendance, student and grade filters available in Wartaq.',
      inputSchema: courseReport,
      annotations: { readOnlyHint: true },
    },
    async ({ courseId, format, language, ...options }) => {
      const response = await call({ path: '/api/notebook', method: 'GET' })
      if (!response.ok) return text(await response.text(), true)
      const snapshot = neonSnapshotSchema.parse(await response.json())
      const course = snapshot.courses.find(({ id }) => id === courseId)
      if (!course) return text('Course not found', true)
      const directory = await call({ path: '/api/admin', method: 'GET' })
      if (!directory.ok) return text(await directory.text(), true)
      const { students } = neonAdminBoardSchema.parse(await directory.json())
      const input: CourseExportInput = {
        course,
        entries: snapshot.enrollments,
        students,
        attendance: projectEvents(snapshot.events).attendance,
        ar: language === 'ar',
        options,
      }
      if (format === 'rows') {
        const columns = courseExportColumns(options.report)
        const rows = courseExportRows(input).map((row) => columns.map((column) => row[column]))
        return text(JSON.stringify({ course, columns, rows }))
      }
      const workbook = await courseWorkbook(input)
      return {
        content: [
          {
            type: 'resource',
            resource: {
              uri: `wartaq://courses/${courseId}/${options.report}.xlsx`,
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              blob: Buffer.from(await workbook.arrayBuffer()).toString('base64'),
            },
          },
        ],
      }
    },
  )
  if (!write) return
  post(
    'invite_accounts',
    'Create invited accounts. The response contains temporary credentials; protect them. A request ID cannot be reused after success.',
    '/api/admin/accounts/invite',
    invitationRequestSchema,
  )
  post(
    'grant_account',
    'Grant or change an application role and access.',
    '/api/admin/accounts/grant',
    neonAdminGrantSchema,
  )
  post(
    'disable_account',
    'Disable an application account.',
    '/api/admin/accounts/disable',
    neonAdminDisableSchema,
  )
  post(
    'reset_account_password',
    'Reset an account password and revoke sessions.',
    '/api/admin/accounts/reset-password',
    neonAdminPasswordResetSchema,
  )
  post(
    'save_student',
    'Create or update a roster student.',
    '/api/admin/students',
    neonAdminStudentSchema,
  )
  post(
    'create_student_in_course',
    'Atomically create a roster student and enrollment with stable IDs.',
    '/api/admin/students/enroll',
    neonAdminStudentEnrollSchema,
  )
  post(
    'save_course',
    'Create or rename a course using a stable ID.',
    '/api/admin/courses',
    courseInputSchema,
  )
  post(
    'set_course_status',
    'Close or reopen a course. Closing may advance eligible student levels.',
    '/api/admin/courses/status',
    courseStatusSchema,
  )
  post(
    'set_course_thresholds',
    'Set course attendance, practical and theory thresholds.',
    '/api/admin/courses/settings',
    courseSettingsSchema,
  )
  post(
    'save_enrollment',
    'Set course membership, level and teacher. Withdrawal preserves history and grades.',
    '/api/admin/enrollments/membership',
    enrollmentMembershipSchema,
  )
  post(
    'save_grades',
    'Save enrollment scores and optional performance notes.',
    '/api/admin/enrollments/grades',
    enrollmentGradesSchema,
  )
  post(
    'save_grade_decision',
    'Append an administrator result override or restore the calculated result, with a reason and stable request ID.',
    '/api/admin/enrollments/decision',
    gradeDecisionInputSchema,
  )
  post(
    'set_handbook_received',
    'Set handbook receipt for an enrollment.',
    '/api/admin/enrollments/handbook',
    enrollmentHandbookSchema,
  )
}
