import { z } from 'zod'
import { eventSchema, statusSchema } from './ledger'

export const offlineAttendanceRecordSchema = z.object({
  event: eventSchema.extend({
    payload: z.object({
      kind: z.literal('attendance'),
      studentId: z.uuid(),
      enrollmentId: z.uuid(),
      date: z.iso.date(),
      status: statusSchema,
    }),
  }),
  expectedEventId: z.uuid().nullable(),
  expectedRevision: z.literal('unknown').optional(),
})
export const offlineAttendanceSyncSchema = z.object({
  accountId: z.string().min(1),
  records: z.array(offlineAttendanceRecordSchema).min(1).max(500),
})
export const offlineAttendanceOutcomeSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['saved', 'unchanged', 'conflict', 'forbidden', 'id_conflict']),
  current: z.object({ eventId: z.uuid(), status: statusSchema }).nullable(),
})
export const offlineAttendanceResponseSchema = z.object({
  outcomes: z.array(offlineAttendanceOutcomeSchema),
})
