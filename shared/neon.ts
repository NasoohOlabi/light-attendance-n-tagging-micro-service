import { z } from 'zod'
import { eventSchema, statusSchema } from './ledger'

export const neonTeacherSchema = z.object({
  role: z.enum(['teacher', 'administrator']).default('teacher'),
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

const authUserId = z.string().min(1).max(256)
const expiry = z.iso.datetime().nullable()
export const neonStudentAccountSchema = z.object({
  role: z.literal('student'),
  id: z.uuid(),
  name: z.string(),
  canRead: z.literal(true),
  canWrite: z.literal(false),
  expiresAt: expiry,
})
export const neonAccountSchema = z.union([neonTeacherSchema, neonStudentAccountSchema])
export type NeonAccount = z.infer<typeof neonAccountSchema>
export const neonStudentAttendanceSchema = z.object({
  student: z.object({ studentId: z.uuid(), name: z.string(), group: z.string() }),
  attendance: z.array(z.object({ date: z.iso.date(), status: statusSchema })),
})
export const neonAdminGrantSchema = z.discriminatedUnion('role', [
  z.strictObject({
    role: z.literal('administrator'),
    authUserId,
    name: z.string().trim().min(1).max(100),
  }),
  z.strictObject({
    role: z.literal('teacher'),
    authUserId,
    name: z.string().trim().min(1).max(100),
    mode: z.enum(['read_write', 'read_only', 'write_only']).default('read_write'),
    expiresAt: expiry,
  }),
  z.strictObject({
    role: z.literal('student'),
    authUserId,
    studentId: z.uuid(),
    expiresAt: expiry,
  }),
])
export const neonAdminDisableSchema = z.strictObject({ authUserId })
export const neonAdminStudentSchema = z.strictObject({
  studentId: z.uuid(),
  teacherId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  group: z.string().trim().max(100),
  active: z.boolean(),
})
export const neonAdminBoardSchema = z.object({
  accounts: z.array(
    z.object({
      authUserId,
      email: z.string(),
      name: z.string(),
      role: z.enum(['administrator', 'teacher', 'student']).nullable(),
      active: z.boolean(),
      expiresAt: expiry,
      teacherId: z.uuid().nullable(),
      studentId: z.uuid().nullable(),
    }),
  ),
  teachers: z.array(z.object({ teacherId: z.uuid(), name: z.string(), active: z.boolean() })),
  students: z.array(
    z.object({
      studentId: z.uuid(),
      name: z.string(),
      group: z.string(),
      active: z.boolean(),
      teacherId: z.uuid(),
    }),
  ),
})
