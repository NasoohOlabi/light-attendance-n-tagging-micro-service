import { z } from 'zod'
import { invitationProfileSchema } from './invitations'
import { eventSchema, statusSchema } from './ledger'

export const neonTeacherSchema = z.object({
  role: z.enum(['teacher', 'administrator']).default('teacher'),
  invitationProfile: invitationProfileSchema.optional(),
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
  firstName: z.string().trim().min(1).max(200).optional(),
  lastName: z.string().trim().max(200).optional(),
  whatsapp: z.string().trim().max(40).nullable().optional(),
  location: z.string().nullable().optional(),
  birthYear: z.number().int().nullable().optional(),
})
const teacherStudentFieldsSchema = z.strictObject({
  firstName: z.string().trim().min(1).max(200),
  lastName: z.string().trim().max(200),
  group: z.string().trim().max(100),
  whatsapp: z.string().trim().max(40).nullable(),
  location: z.string().trim().max(200).nullable(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable(),
})
export const studentProfileVersionSchema = z.strictObject({
  firstName: z.string().trim(),
  lastName: z.string().trim(),
  group: z.string().trim(),
  whatsapp: z.string().trim().nullable(),
  location: z.string().nullable(),
  birthYear: z.number().int().nullable(),
})
export const teacherStudentUpdateSchema = teacherStudentFieldsSchema
  .extend({
    studentId: z.uuid(),
    expected: studentProfileVersionSchema,
  })
  .refine(
    ({ firstName, lastName }) => [firstName, lastName].filter(Boolean).join(' ').length <= 200,
  )
export type NeonRosterStudent = z.infer<typeof neonStudentSchema>
export const courseInputSchema = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(200) })
const percentage = z.number().min(0).max(100)
export const courseSettingsSchema = z.strictObject({
  id: z.uuid(),
  attendanceMinimum: percentage,
  practicalMinimum: percentage,
  theoryMinimum: percentage,
})
export const courseSchema = courseInputSchema.extend({
  open: z.boolean().default(true),
  attendanceMinimum: percentage.default(70),
  practicalMinimum: percentage.default(80),
  theoryMinimum: percentage.default(80),
})
export const courseStatusSchema = z.strictObject({ id: z.uuid(), open: z.boolean() })
export const gradeDecisionSchema = z.strictObject({
  requestId: z.uuid(),
  result: z.enum(['pass', 'fail', 'calculated']),
  note: z.string().trim().min(1).max(2000),
  actor: z.string().min(1),
  at: z.iso.datetime(),
})
export const gradeDecisionInputSchema = gradeDecisionSchema
  .pick({ requestId: true, result: true, note: true })
  .extend({ id: z.uuid() })
export const enrollmentSchema = z.object({
  id: z.uuid(),
  courseId: z.uuid(),
  studentId: z.uuid(),
  teacherId: z.uuid().nullable().default(null),
  teacherName: z.string().nullable().default(null),
  level: z.string().trim().max(200),
  practical: z.number().min(0).max(100).nullable(),
  theory: z.number().min(0).max(100).nullable(),
  active: z.boolean().default(true),
  handbookReceived: z.boolean().default(false),
  notes: z.string().default(''),
  gradeDecisions: z.array(gradeDecisionSchema).default([]),
})
export const enrollmentHandbookSchema = z.strictObject({
  id: z.uuid(),
  handbookReceived: z.boolean(),
})
export const enrollmentMembershipSchema = z.strictObject({
  teacherId: z.uuid().nullable().optional(),
  id: z.uuid(),
  courseId: z.uuid(),
  studentId: z.uuid(),
  level: z.string().trim().max(200),
  active: z.boolean(),
})
export const enrollmentGradesSchema = z.strictObject({
  id: z.uuid(),
  notes: z.string().optional(),
  practical: z.number().min(0).max(100).nullable(),
  theory: z.number().min(0).max(100).nullable(),
})
export const courseBoardSchema = z.object({
  courses: z.array(courseSchema),
  enrollments: z.array(enrollmentSchema),
})
export type Course = z.infer<typeof courseSchema>
export type Enrollment = z.infer<typeof enrollmentSchema>
export const neonSnapshotSchema = z.object({
  teacher: neonTeacherSchema,
  students: z.array(neonStudentSchema),
  events: z.array(eventSchema),
  courses: z.array(courseSchema).default([]),
  enrollments: z.array(enrollmentSchema).default([]),
})
export const neonBatchSchema = z.object({ events: z.array(eventSchema).min(1).max(500) })
export const neonErrorSchema = z.object({ error: z.string() })
export type NeonTeacher = z.infer<typeof neonTeacherSchema>
export type NeonSnapshot = z.infer<typeof neonSnapshotSchema>

const authUserId = z.string().min(1).max(256)
const expiry = z.iso.datetime().nullable()
export const neonStudentAccountSchema = z.object({
  role: z.literal('student'),
  invitationProfile: invitationProfileSchema.optional(),
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
  attendance: z.array(
    z.object({
      date: z.iso.date(),
      status: statusSchema,
      course: z.string().nullable().optional(),
      enrollmentId: z.uuid().optional(),
    }),
  ),
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
export const neonAdminGeneratedPasswordResetSchema = z.strictObject({ authUserId })
export const neonAdminGeneratedPasswordResetResponseSchema = z.object({
  loginIdentifier: z.string().min(1),
  loginMethod: z.enum(['username', 'email', 'phone']),
  temporaryPassword: z.string().min(8),
})
export const neonAdminPasswordResetSchema = z
  .strictObject({
    authUserId,
    password: z.string().min(8).max(128),
    passwordConfirmation: z.string(),
  })
  .refine((value) => value.password === value.passwordConfirmation)
const studentFields = {
  studentId: z.uuid(),
  teacherId: z.uuid().nullable(),
  group: z.string().trim().max(100),
  active: z.boolean(),
  whatsapp: z.string().trim().max(40).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
}
export const neonAdminStudentSchema = z.union([
  z.strictObject({ ...studentFields, name: z.string().trim().min(1).max(200) }),
  z
    .strictObject({
      ...studentFields,
      firstName: z.string().trim().min(1).max(200),
      lastName: z.string().trim().max(200),
    })
    .refine(
      ({ firstName, lastName }) => [firstName, lastName].filter(Boolean).join(' ').length <= 200,
    ),
])
export const neonAdminStudentEnrollSchema = z.strictObject({
  student: neonAdminStudentSchema,
  enrollment: z.strictObject({
    teacherId: z.uuid().nullable().optional(),
    id: z.uuid(),
    courseId: z.uuid(),
    level: z.string().trim().max(200),
  }),
})
export const neonAdminBoardSchema = z.object({
  accounts: z.array(
    z.object({
      authUserId,
      email: z.string(),
      name: z.string(),
      profileName: z.string().optional(),
      username: z.string().nullable().optional(),
      verifiedPhone: z.string().nullable().optional(),
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
      firstName: z.string(),
      lastName: z.string(),
      group: z.string(),
      active: z.boolean(),
      teacherId: z.uuid().nullable(),
      whatsapp: z.string().nullable().default(null),
      location: z.string().nullable().default(null),
      birthYear: z.number().int().nullable().default(null),
    }),
  ),
})

export function accountProfileLabel(
  account: z.infer<typeof neonAdminBoardSchema>['accounts'][number],
) {
  return (account.profileName ?? account.name).trim() || account.email
}
