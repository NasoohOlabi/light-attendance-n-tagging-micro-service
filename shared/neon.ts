import { z } from 'zod'
import { eventSchema } from './ledger'

export const neonTeacherSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  canRead: z.boolean(),
  canWrite: z.boolean(),
  expiresAt: z.iso.datetime().nullable(),
})
export const neonStudentSchema = z.object({
  kind: z.literal('student'),
  studentId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  group: z.string().trim().max(100),
  active: z.boolean(),
})
export const neonSnapshotSchema = z.object({
  teacher: neonTeacherSchema,
  students: z.array(neonStudentSchema),
  events: z.array(eventSchema),
})
export const neonBatchSchema = z.object({ events: z.array(eventSchema).min(1).max(500) })
export const neonErrorSchema = z.object({ error: z.string() })
export type NeonTeacher = z.infer<typeof neonTeacherSchema>
export type NeonSnapshot = z.infer<typeof neonSnapshotSchema>
