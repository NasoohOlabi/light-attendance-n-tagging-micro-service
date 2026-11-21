import { z } from 'zod'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import {
  invitationRequestSchema,
  invitationProfileInputSchema,
  invitationProfileSchema,
  invitationSetupInputSchema,
  verifiedPhoneInputSchema,
} from '../shared/invitations'
import type { Pool, PoolClient } from 'pg'
import {
  courseBoardSchema,
  courseSchema,
  courseInputSchema,
  courseStatusSchema,
  courseSettingsSchema,
  enrollmentSchema,
  enrollmentMembershipSchema,
  enrollmentHandbookSchema,
  enrollmentGradesSchema,
  gradeDecisionInputSchema,
  studentProfileVersionSchema,
  teacherStudentUpdateSchema,
  gradeDecisionSchema,
  neonAdminBoardSchema,
  neonAdminDisableSchema,
  neonAdminGrantSchema,
  neonAdminPasswordResetSchema,
  neonAdminGeneratedPasswordResetSchema,
  neonAdminStudentSchema,
  neonAdminStudentEnrollSchema,
  neonBatchSchema,
  neonSnapshotSchema,
  neonStudentSchema,
  neonStudentAttendanceSchema,
  neonTeacherSchema,
} from '../shared/neon'
import { eventSchema, projectEvents } from '../shared/ledger'
import { offlineAttendanceSyncSchema } from '../shared/offlineAttendance'
import { offlineStudentSyncSchema } from '../shared/offlineStudent'
import { validateAssignedPayloads } from '../shared/roster'
import { courseAttendance, effectiveGradeResult } from '../shared/courseGrading'

const teacherRow = z.object({
  id: z.uuid(),
  name: z.string(),
  active: z.boolean(),
  access_mode: z.enum(['read_write', 'read_only', 'write_only']),
  expires_at: z.date().nullable(),
})
const studentRow = z.object({
  id: z.uuid(),
  name: z.string(),
  group_name: z.string(),
  active: z.boolean(),
})
const eventRow = z.object({
  id: z.uuid(),
  actor: z.string(),
  client_time: z.date(),
  received_at: z.date(),
  payload: z.unknown(),
})
// Contact retry receipts stay in the ledger without entering any attendance or note projection.
const visibleLedgerEvent = `(e.payload->>'kind' = 'contact_receipt'
  AND e.payload = jsonb_build_object('kind', 'contact_receipt', 'fingerprint', e.payload->>'fingerprint')
  AND e.payload->>'fingerprint' ~ '^[a-f0-9]{64}$') IS NOT TRUE`

function numericLevel(value: string) {
  const normalized = value
    .trim()
    .replaceAll('\u066b', '.')
    .replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) =>
      String(digit.charCodeAt(0) - (digit.charCodeAt(0) <= 0x669 ? 0x660 : 0x6f0)),
    )
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized)
  return match && { whole: BigInt(match[1]), fractional: /[1-9]/.test(match[2] ?? '') }
}

class HttpError extends Error {
  constructor(public status: number) {
    super()
  }
}

async function courseBoard(
  db: PoolClient,
  teacher: z.infer<typeof neonTeacherSchema>,
  includeInactiveStudents = false,
) {
  const scope =
    teacher.role === 'administrator'
      ? includeInactiveStudents
        ? 'true'
        : 's.active'
      : 's.teacher_id = $1 AND s.active'
  const values = teacher.role === 'administrator' ? [] : [teacher.id]
  const enrollments = (
    await db.query(
      `SELECT ce.id, ce.course_id AS "courseId", ce.student_id AS "studentId", ce.level,
    ${teacher.role === 'administrator' ? 'ce.practical::float8' : 'NULL::float8'} AS practical,
    ${teacher.role === 'administrator' ? 'ce.theory::float8' : 'NULL::float8'} AS theory,
    ${teacher.role === 'administrator' ? 'ce.notes' : "''::text"} AS notes, ce.active, ce.handbook_received AS "handbookReceived",
    ce.teacher_id AS "teacherId", (SELECT name FROM teachers WHERE id = ce.teacher_id) AS "teacherName",
    ${teacher.role === 'administrator' ? 'ce.grade_decisions' : "'[]'::jsonb"} AS "gradeDecisions"
    FROM course_enrollments ce JOIN students s ON s.id = ce.student_id WHERE ${scope} ORDER BY ce.id FOR SHARE OF ce`,
      values,
    )
  ).rows
  const courses =
    teacher.role === 'administrator'
      ? (
          await db.query(
            'SELECT id, name, open, attendance_minimum AS "attendanceMinimum", practical_minimum AS "practicalMinimum", theory_minimum AS "theoryMinimum" FROM courses ORDER BY id FOR SHARE',
          )
        ).rows
      : (
          await db.query(
            'SELECT c.id, c.name, c.open FROM courses c WHERE EXISTS (SELECT 1 FROM course_enrollments ce JOIN students s ON s.id = ce.student_id WHERE ce.course_id = c.id AND s.teacher_id = $1 AND s.active) ORDER BY c.id FOR SHARE OF c',
            [teacher.id],
          )
        ).rows
  const board = courseBoardSchema.parse({ courses, enrollments })
  board.courses.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  return board
}

async function snapshot(
  db: PoolClient,
  teacher: z.infer<typeof neonTeacherSchema>,
  includeInactiveStudents = false,
) {
  const scope =
    teacher.role === 'administrator'
      ? includeInactiveStudents
        ? 'true'
        : 's.active'
      : 's.teacher_id = $1 AND s.active'
  const values = teacher.role === 'administrator' ? [] : [teacher.id]
  const students = z
    .array(
      studentRow.extend({
        first_name: z.string().nullable().optional(),
        last_name: z.string().nullable().optional(),
        whatsapp: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
        birth_year: z.number().int().nullable().optional(),
      }),
    )
    .parse(
      (
        await db.query(
          `SELECT s.id, s.name, s.group_name, s.active, s.first_name, s.last_name, s.whatsapp, s.location, s.birth_year FROM students s WHERE ${scope} ORDER BY s.name, s.id FOR SHARE`,
          values,
        )
      ).rows,
    )
    .map((s) => ({
      kind: 'student' as const,
      studentId: s.id,
      name: s.name,
      group: s.group_name,
      active: s.active,
      firstName: s.first_name ?? s.name,
      lastName: s.last_name ?? '',
      whatsapp: s.whatsapp ?? null,
      location: s.location ?? null,
      birthYear: s.birth_year ?? null,
    }))
  const events = z
    .array(eventRow)
    .parse(
      (
        await db.query(
          `SELECT e.id, e.actor, e.client_time, e.received_at, e.payload FROM events e JOIN students s ON s.id = e.student_id WHERE ${scope} AND ${visibleLedgerEvent} ORDER BY e.sequence`,
          values,
        )
      ).rows,
    )
    .map((e) =>
      eventSchema.parse({
        id: e.id,
        actor: e.actor,
        clientTime: e.client_time.toISOString(),
        receivedAt: e.received_at.toISOString(),
        payload: e.payload,
      }),
    )
  return neonSnapshotSchema.parse({
    teacher,
    students,
    events,
    ...(await courseBoard(db, teacher, includeInactiveStudents)),
  })
}

async function readBody(request: Request) {
  if (!request.body) throw new HttpError(400)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > 2 * 1024 * 1024) {
      await reader.cancel()
      throw new HttpError(413)
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new HttpError(400)
  }
}

const accountRow = z.object({
  role: z.enum(['teacher', 'administrator', 'student']),
  teacher_id: z.uuid().nullable(),
  student_id: z.uuid().nullable(),
  active: z.boolean(),
  expires_at: z.date().nullable(),
})
const live = (active: boolean, expires: Date | null) =>
  active && (!expires || expires.getTime() > Date.now())

async function adminBoard(db: PoolClient) {
  // ponytail: bounded to 1000 accounts; add pagination when that ceiling matters.
  const accounts = (
    await db.query(`SELECT u.id AS "authUserId", u.name AS "profileName", COALESCE(t.name, s.name, u.name, '') AS name,
    a.verified_phone AS "verifiedPhone", a.role, COALESCE(a.active, false) AS active, a.expires_at AS "expiresAt", a.teacher_id AS "teacherId", a.student_id AS "studentId"
    FROM neon_auth."user" u LEFT JOIN app_accounts a ON a.auth_user_id = u.id::text
    LEFT JOIN teachers t ON t.id = a.teacher_id LEFT JOIN students s ON s.id = a.student_id
    ORDER BY u.id LIMIT 1000`)
  ).rows.map((row) => ({
    ...row,
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : null,
  }))
  const teachers = (
    await db.query(`SELECT t.id AS "teacherId", t.name,
      COALESCE((t.active AND a.role = 'teacher' AND a.active AND (t.expires_at IS NULL OR t.expires_at > now())
        AND (a.expires_at IS NULL OR a.expires_at > now())), false) AS active
      FROM teachers t LEFT JOIN app_accounts a ON a.teacher_id = t.id
      WHERE a.role = 'teacher' OR EXISTS (SELECT 1 FROM students s WHERE s.teacher_id = t.id) ORDER BY t.name, t.id`)
  ).rows
  const students = (
    await db.query(
      'SELECT id AS "studentId", name, COALESCE(first_name, name) AS "firstName", COALESCE(last_name, \'\') AS "lastName", group_name AS "group", active, teacher_id AS "teacherId", whatsapp, location, birth_year AS "birthYear" FROM students ORDER BY name, id',
    )
  ).rows
  return neonAdminBoardSchema.parse({ accounts, teachers, students })
}

function generateTemporaryPassword() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('base64url')
}

async function manage(db: PoolClient, path: string, body: unknown, subject: string) {
  if (path === '/api/admin/accounts/invite') {
    const { requestId, people } = invitationRequestSchema.parse(body)
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [requestId])
    if (
      (
        await db.query('SELECT 1 FROM app_accounts WHERE invitation_request_id = $1 LIMIT 1', [
          requestId,
        ])
      ).rowCount
    )
      throw new HttpError(409)
    const invitations = []
    for (const person of people) {
      const userId = crypto.randomUUID()
      const temporaryPassword = generateTemporaryPassword()
      const hash = await hashPassword(temporaryPassword)
      const name = `${person.firstName} ${person.lastName}`
      await db.query(
        'INSERT INTO neon_auth."user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)',
        [userId, name, `${userId}@invitation.invalid`],
      )
      await db.query(
        `INSERT INTO neon_auth.account (id, "accountId", "providerId", "userId", password) VALUES ($1, $2::text, 'credential', $2::text::uuid, $3)`,
        [crypto.randomUUID(), userId, hash],
      )
      const recordId = crypto.randomUUID()
      if (person.role === 'student') {
        await db.query(
          'INSERT INTO students (id, name, first_name, last_name, teacher_id) VALUES ($1, $2, $3, $4, NULL)',
          [recordId, name, person.firstName, person.lastName],
        )
        await db.query(
          'INSERT INTO app_accounts (auth_user_id, role, student_id, invitation_request_id, verified_phone, invitation_requires_setup) VALUES ($1, $2, $3, $4, $5, true)',
          [userId, person.role, recordId, requestId, person.phone],
        )
      } else {
        await db.query(
          "INSERT INTO teachers (id, auth_user_id, name, access_mode) VALUES ($1, $2, $3, 'read_write')",
          [recordId, userId, name],
        )
        await db.query(
          'INSERT INTO app_accounts (auth_user_id, role, teacher_id, invitation_request_id, verified_phone, invitation_requires_setup) VALUES ($1, $2, $3, $4, $5, true)',
          [userId, person.role, recordId, requestId, person.phone],
        )
      }
      invitations.push({
        firstName: person.firstName,
        lastName: person.lastName,
        role: person.role,
        phone: person.phone,
        temporaryPassword,
      })
    }
    return { invitations }
  } else if (path === '/api/admin/accounts/verify-phone') {
    const input = verifiedPhoneInputSchema.parse(body)
    if (input.authUserId === subject) throw new HttpError(403)
    const previous = await db.query(
      'SELECT verified_phone FROM app_accounts WHERE auth_user_id = $1',
      [input.authUserId],
    )
    const updated = await db.query(
      `UPDATE app_accounts a SET verified_phone = $2 WHERE auth_user_id = $1 AND active AND (expires_at IS NULL OR expires_at > now()) AND ((role = 'student' AND EXISTS (SELECT 1 FROM students s WHERE s.id = a.student_id AND s.active)) OR (role IN ('teacher', 'administrator') AND EXISTS (SELECT 1 FROM teachers t WHERE t.id = a.teacher_id AND t.active AND (t.expires_at IS NULL OR t.expires_at > now())))) RETURNING auth_user_id`,
      [input.authUserId, input.phone],
    )
    if (!updated.rowCount) throw new HttpError(400)
    if (previous.rows[0]?.verified_phone !== input.phone)
      await db.query('DELETE FROM neon_auth.session WHERE "userId"::text = $1', [input.authUserId])
    return adminBoard(db)
  } else if (path === '/api/admin/accounts/grant') {
    const legacyGrant = z
      .object({
        role: z.string(),
        mode: z.enum(['read_write', 'read_only', 'write_only']).optional(),
      })
      .passthrough()
      .parse(body)
    const { mode: _mode, ...grantBody } = legacyGrant
    const grant = neonAdminGrantSchema.parse(grantBody)
    if (grant.authUserId === subject) throw new HttpError(403)
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [grant.authUserId])
    const user = await db.query('SELECT id FROM neon_auth."user" WHERE id::text = $1 FOR SHARE', [
      grant.authUserId,
    ])
    if (!user.rows.length) throw new HttpError(400)
    await db.query('SELECT auth_user_id FROM app_accounts WHERE auth_user_id = $1 FOR UPDATE', [
      grant.authUserId,
    ])
    if (grant.role === 'student') {
      const student = await db.query('SELECT id FROM students WHERE id = $1 FOR SHARE', [
        grant.studentId,
      ])
      if (!student.rows.length) throw new HttpError(400)
      await db.query(
        `INSERT INTO app_accounts (auth_user_id, role, student_id, active, expires_at) VALUES ($1, 'student', $2, true, $3)
        ON CONFLICT (auth_user_id) DO UPDATE SET role = EXCLUDED.role, teacher_id = NULL, student_id = EXCLUDED.student_id, active = true, expires_at = EXCLUDED.expires_at`,
        [grant.authUserId, grant.studentId, grant.expiresAt],
      )
    } else {
      const mode = 'read_write'
      const expiry = grant.role === 'teacher' ? grant.expiresAt : null
      const staff = await db.query(
        `INSERT INTO teachers (id, auth_user_id, name, active, access_mode, expires_at) VALUES ($1, $2, $3, true, $4, $5)
        ON CONFLICT (auth_user_id) DO UPDATE SET name = EXCLUDED.name, active = true, access_mode = EXCLUDED.access_mode, expires_at = EXCLUDED.expires_at RETURNING id`,
        [crypto.randomUUID(), grant.authUserId, grant.name, mode, expiry],
      )
      const staffId = z.object({ id: z.uuid() }).parse(staff.rows[0]).id
      await db.query(
        `INSERT INTO app_accounts (auth_user_id, role, teacher_id, active, expires_at) VALUES ($1, $2, $3, true, $4)
        ON CONFLICT (auth_user_id) DO UPDATE SET role = EXCLUDED.role, teacher_id = EXCLUDED.teacher_id, student_id = NULL, active = true, expires_at = EXCLUDED.expires_at`,
        [grant.authUserId, grant.role, staffId, expiry],
      )
    }
  } else if (path === '/api/admin/courses') {
    const course = courseInputSchema.parse(body)
    await db.query(
      'INSERT INTO courses (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name',
      [course.id, course.name],
    )
    return { saved: true }
  } else if (path === '/api/admin/courses/settings') {
    const settings = courseSettingsSchema.parse(body)
    const result = await db.query(
      'UPDATE courses SET attendance_minimum = $2, practical_minimum = $3, theory_minimum = $4 WHERE id = $1 RETURNING id',
      [settings.id, settings.attendanceMinimum, settings.practicalMinimum, settings.theoryMinimum],
    )
    if (!result.rowCount) throw new HttpError(400)
    return { saved: true }
  } else if (path === '/api/admin/courses/status') {
    const status = courseStatusSchema.parse(body)
    if (!status.open) {
      // Serialize membership changes for this course, including newly inserted students.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [status.id])
      const students = z
        .array(studentRow)
        .parse(
          (
            await db.query(
              'SELECT s.id, s.name, s.group_name, s.active FROM students s JOIN course_enrollments ce ON ce.student_id = s.id WHERE ce.course_id = $1 ORDER BY s.name, s.id FOR UPDATE OF s',
              [status.id],
            )
          ).rows,
        )
      const entries = z.array(enrollmentSchema).parse(
        (
          await db.query(
            `SELECT id, course_id AS "courseId", student_id AS "studentId", level,
          practical::float8 AS practical, theory::float8 AS theory, active, grade_decisions AS "gradeDecisions"
          FROM course_enrollments WHERE course_id = $1 ORDER BY id FOR SHARE`,
            [status.id],
          )
        ).rows,
      )
      const courseRows = await db.query(
        'SELECT id, name, open, attendance_minimum AS "attendanceMinimum", practical_minimum AS "practicalMinimum", theory_minimum AS "theoryMinimum" FROM courses WHERE id = $1 FOR NO KEY UPDATE',
        [status.id],
      )
      if (!courseRows.rowCount) throw new HttpError(400)
      const course = courseSchema.parse(courseRows.rows[0])
      if (course.open) {
        const rows = z
          .array(eventRow)
          .parse(
            (
              await db.query(
                `SELECT e.id, e.actor, e.client_time, e.received_at, e.payload FROM events e WHERE e.student_id = ANY($1::uuid[]) AND ${visibleLedgerEvent} ORDER BY e.sequence`,
                [students.map((student) => student.id)],
              )
            ).rows,
          )
        const events = rows.map((event) =>
          eventSchema.parse({
            id: event.id,
            actor: event.actor,
            clientTime: event.client_time.toISOString(),
            receivedAt: event.received_at.toISOString(),
            payload: event.payload,
          }),
        )
        const attendance = projectEvents(events).attendance
        for (const entry of entries.filter((item) => item.active)) {
          if (
            effectiveGradeResult(course, entry, courseAttendance(attendance, entry).ratio) !==
            'pass'
          )
            continue
          const student = students.find((item) => item.id === entry.studentId && item.active)
          if (!student) continue
          const level = numericLevel(entry.level)
          const roster = numericLevel(student.group_name)
          if (!level || level.fractional || (!roster && student.group_name.trim())) continue
          const next = level.whole + 1n
          if (roster && roster.whole >= next) continue
          const nextLevel = neonStudentSchema.shape.group.safeParse(String(next))
          if (!nextLevel.success) continue
          await db.query('UPDATE students SET group_name = $2 WHERE id = $1', [
            student.id,
            nextLevel.data,
          ])
        }
      }
    }
    const result = await db.query('UPDATE courses SET open = $2 WHERE id = $1 RETURNING id', [
      status.id,
      status.open,
    ])
    if (!result.rowCount) throw new HttpError(400)
    return { saved: true }
  } else if (path === '/api/admin/enrollments/handbook') {
    const value = enrollmentHandbookSchema.parse(body)
    const result = await db.query(
      'UPDATE course_enrollments SET handbook_received = $2 WHERE id = $1 RETURNING id',
      [value.id, value.handbookReceived],
    )
    if (!result.rowCount) throw new HttpError(400)
    return { saved: true }
  } else if (path === '/api/admin/enrollments/decision') {
    const decision = gradeDecisionInputSchema.parse(body)
    const row = await db.query(
      'SELECT grade_decisions FROM course_enrollments WHERE id = $1 FOR UPDATE',
      [decision.id],
    )
    if (!row.rowCount) throw new HttpError(400)
    const history = z.array(gradeDecisionSchema).parse(row.rows[0].grade_decisions)
    const existing = history.find((item) => item.requestId === decision.requestId)
    if (existing) {
      if (
        existing.result !== decision.result ||
        existing.note !== decision.note ||
        existing.actor !== subject
      )
        throw new HttpError(409)
    } else {
      await db.query(
        `UPDATE course_enrollments SET grade_decisions = grade_decisions || jsonb_build_array(jsonb_build_object(
          'requestId', $2::text, 'result', $3::text, 'note', $4::text, 'actor', $5::text,
          'at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) WHERE id = $1`,
        [decision.id, decision.requestId, decision.result, decision.note, subject],
      )
    }
    return { saved: true }
  } else if (path === '/api/admin/enrollments/grades') {
    const grades = enrollmentGradesSchema.parse(body)
    const result = await db.query(
      'UPDATE course_enrollments SET practical = $2, theory = $3, notes = COALESCE($4, notes) WHERE id = $1 RETURNING id',
      [grades.id, grades.practical, grades.theory, grades.notes ?? null],
    )
    if (!result.rowCount) throw new HttpError(400)
    return { saved: true }
  } else if (path === '/api/admin/enrollments' || path === '/api/admin/enrollments/membership') {
    const legacy = path === '/api/admin/enrollments'
    const enrollment = legacy
      ? enrollmentSchema
          .extend({ active: z.boolean().optional(), teacherId: z.uuid().nullable().optional() })
          .parse(body)
      : enrollmentMembershipSchema.parse(body)
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [enrollment.courseId])
    const student = await db.query('SELECT id FROM students WHERE id = $1 FOR UPDATE', [
      enrollment.studentId,
    ])
    if (!student.rows.length) throw new HttpError(400)
    const course = await db.query('SELECT id FROM courses WHERE id = $1 FOR SHARE', [
      enrollment.courseId,
    ])
    if (!course.rows.length) throw new HttpError(400)
    const existing = await db.query(
      'SELECT id, student_id, course_id FROM course_enrollments WHERE id = $1 OR (student_id = $2 AND course_id = $3) FOR UPDATE',
      [enrollment.id, enrollment.studentId, enrollment.courseId],
    )
    if (
      existing.rows.some(
        (row) =>
          row.id !== enrollment.id ||
          row.student_id !== enrollment.studentId ||
          row.course_id !== enrollment.courseId,
      )
    )
      throw new HttpError(409)
    if (enrollment.teacherId) {
      const teacher = await db.query('SELECT id FROM teachers WHERE id = $1 FOR SHARE', [
        enrollment.teacherId,
      ])
      if (!teacher.rowCount) throw new HttpError(400)
    }
    if (legacy && 'practical' in enrollment) {
      await db.query(
        `INSERT INTO course_enrollments (id, course_id, student_id, level, practical, theory, active, teacher_id)
        VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, true), $8) ON CONFLICT (course_id, student_id)
        DO UPDATE SET level = EXCLUDED.level, practical = EXCLUDED.practical, theory = EXCLUDED.theory, active = COALESCE($7, course_enrollments.active), teacher_id = CASE WHEN $9 THEN EXCLUDED.teacher_id ELSE course_enrollments.teacher_id END`,
        [
          enrollment.id,
          enrollment.courseId,
          enrollment.studentId,
          enrollment.level,
          enrollment.practical,
          enrollment.theory,
          enrollment.active ?? null,
          enrollment.teacherId ?? null,
          enrollment.teacherId !== undefined,
        ],
      )
    } else {
      await db.query(
        `INSERT INTO course_enrollments (id, course_id, student_id, level, active, teacher_id)
        VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (course_id, student_id)
        DO UPDATE SET level = EXCLUDED.level, active = EXCLUDED.active, teacher_id = CASE WHEN $7 THEN EXCLUDED.teacher_id ELSE course_enrollments.teacher_id END`,
        [
          enrollment.id,
          enrollment.courseId,
          enrollment.studentId,
          enrollment.level,
          enrollment.active,
          enrollment.teacherId ?? null,
          enrollment.teacherId !== undefined,
        ],
      )
    }
    return { saved: true }
  } else if (
    path === '/api/admin/accounts/reset-password' ||
    path === '/api/admin/accounts/reset-password-generated'
  ) {
    const generated = path === '/api/admin/accounts/reset-password-generated'
    const input = generated
      ? {
          ...neonAdminGeneratedPasswordResetSchema.parse(body),
          password: generateTemporaryPassword(),
        }
      : neonAdminPasswordResetSchema.parse(body)
    const { authUserId, password } = input
    if (authUserId === subject) throw new HttpError(403)
    let verifiedPhone: string | undefined
    if (generated) {
      const result = await db.query(
        'SELECT verified_phone FROM app_accounts WHERE auth_user_id = $1 FOR UPDATE',
        [authUserId],
      )
      const phone = z.string().min(1).safeParse(result.rows[0]?.verified_phone)
      if (!phone.success) throw new HttpError(400)
      verifiedPhone = phone.data
    }
    const hash = await hashPassword(password)
    const updated = await db.query(
      `UPDATE neon_auth.account SET password = $2, "updatedAt" = now()
      WHERE "userId"::text = $1 AND "providerId" = 'credential' RETURNING id`,
      [authUserId, hash],
    )
    if (updated.rowCount !== 1) throw new HttpError(400)
    await db.query('DELETE FROM neon_auth.session WHERE "userId"::text = $1', [authUserId])
    if (generated) {
      return { loginIdentifier: verifiedPhone, loginMethod: 'phone', temporaryPassword: password }
    }
  } else if (path === '/api/admin/accounts/disable') {
    const { authUserId } = neonAdminDisableSchema.parse(body)
    if (authUserId === subject) throw new HttpError(403)
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [authUserId])
    await db.query('UPDATE app_accounts SET active = false WHERE auth_user_id = $1', [authUserId])
  } else {
    const combined =
      path === '/api/admin/students/enroll' ? neonAdminStudentEnrollSchema.parse(body) : null
    if (combined)
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        combined.enrollment.courseId,
      ])
    const student = combined ? combined.student : neonAdminStudentSchema.parse(body)
    const firstName = 'firstName' in student ? student.firstName : null
    const lastName = 'lastName' in student ? student.lastName : null
    const name =
      'name' in student
        ? student.name
        : [student.firstName, student.lastName].filter(Boolean).join(' ')
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [student.studentId])
    const current = await db.query('SELECT teacher_id FROM students WHERE id = $1 FOR UPDATE', [
      student.studentId,
    ])
    if (student.teacherId && current.rows[0]?.teacher_id !== student.teacherId) {
      const teacher = await db.query(
        `SELECT t.id FROM teachers t JOIN app_accounts a ON a.teacher_id = t.id
        WHERE t.id = $1 AND a.role = 'teacher' AND a.active AND (a.expires_at IS NULL OR a.expires_at > now())
        AND t.active AND (t.expires_at IS NULL OR t.expires_at > now()) FOR SHARE OF t, a`,
        [student.teacherId],
      )
      if (!teacher.rows.length) throw new HttpError(400)
    }
    await db.query(
      `INSERT INTO students (id, teacher_id, name, group_name, active, first_name, last_name, whatsapp, location, birth_year) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id, name = EXCLUDED.name, group_name = EXCLUDED.group_name, active = EXCLUDED.active,
        first_name = CASE WHEN EXCLUDED.first_name IS NULL AND students.name = EXCLUDED.name THEN students.first_name ELSE EXCLUDED.first_name END,
        last_name = CASE WHEN EXCLUDED.first_name IS NULL AND students.name = EXCLUDED.name THEN students.last_name ELSE EXCLUDED.last_name END,
        whatsapp = CASE WHEN $11 THEN EXCLUDED.whatsapp ELSE students.whatsapp END,
        location = CASE WHEN $12 THEN EXCLUDED.location ELSE students.location END,
        birth_year = CASE WHEN $13 THEN EXCLUDED.birth_year ELSE students.birth_year END`,
      [
        student.studentId,
        student.teacherId,
        name,
        student.group,
        student.active,
        firstName,
        lastName,
        student.whatsapp || null,
        student.location || null,
        student.birthYear ?? null,
        student.whatsapp !== undefined,
        student.location !== undefined,
        student.birthYear !== undefined,
      ],
    )
    if (combined) {
      await manage(
        db,
        '/api/admin/enrollments/membership',
        {
          ...combined.enrollment,
          studentId: student.studentId,
          active: true,
        },
        subject,
      )
    }
  }
  return adminBoard(db)
}

export function createHandler(
  pool: Pool,
  verify: (token: string) => Promise<string>,
  origins: string[],
  verifyRequest?: (request: Request) => Promise<{ subject: string; sessionId?: string }>,
  invitationReceipt?:
    | {
        kind: 'save'
        save: (db: PoolClient, subject: string, requestId: string, value: unknown) => Promise<void>
      }
    | {
        kind: 'reveal'
        reveal: (db: PoolClient, subject: string, requestId: string) => Promise<unknown | null>
      },
) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin')
    const path = new URL(request.url).pathname
    const cors: Record<string, string> =
      origin && origins.includes(origin)
        ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
        : {}
    const privateResponse =
      path === '/api/admin/accounts/invite' ||
      path === '/api/admin/accounts/invite-message' ||
      path === '/api/admin/accounts/reset-password-generated'
    const reply = (body: unknown, status = 200) =>
      Response.json(body, {
        status,
        headers: privateResponse ? { ...cors, 'Cache-Control': 'no-store' } : cors,
      })
    if (origin && !origins.includes(origin)) return reply({ error: 'Forbidden' }, 403)
    if (request.method === 'OPTIONS')
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        },
      })
    if (path === '/health' && request.method === 'GET') return reply({ ok: true })
    if (
      ![
        '/api/me',
        '/api/me/invitation-profile',
        '/api/notebook',
        '/api/events',
        '/api/attendance/sync',
        '/api/student/sync',
        '/api/student/update',
        '/api/student/attendance',
        '/api/admin',
        '/api/admin/accounts/invite',
        '/api/admin/accounts/invite-message',
        '/api/admin/accounts/verify-phone',
        '/api/admin/accounts/grant',
        '/api/admin/accounts/disable',
        '/api/admin/accounts/reset-password',
        '/api/admin/accounts/reset-password-generated',
        '/api/admin/students',
        '/api/admin/courses',
        '/api/admin/courses/status',
        '/api/admin/courses/settings',
        '/api/admin/enrollments',
        '/api/admin/enrollments/membership',
        '/api/admin/enrollments/grades',
        '/api/admin/enrollments/decision',
        '/api/admin/enrollments/handbook',
        '/api/admin/students/enroll',
      ].includes(path)
    )
      return reply({ error: 'Not found' }, 404)
    if (
      ([
        '/api/events',
        '/api/attendance/sync',
        '/api/student/sync',
        '/api/student/update',
        '/api/me/invitation-profile',
        '/api/admin/accounts/invite',
        '/api/admin/accounts/invite-message',
        '/api/admin/accounts/verify-phone',
        '/api/admin/accounts/grant',
        '/api/admin/accounts/disable',
        '/api/admin/accounts/reset-password',
        '/api/admin/accounts/reset-password-generated',
        '/api/admin/students',
        '/api/admin/courses',
        '/api/admin/courses/status',
        '/api/admin/courses/settings',
        '/api/admin/enrollments',
        '/api/admin/enrollments/membership',
        '/api/admin/enrollments/grades',
        '/api/admin/enrollments/decision',
        '/api/admin/enrollments/handbook',
        '/api/admin/students/enroll',
      ].includes(path) &&
        request.method !== 'POST') ||
      (![
        '/api/events',
        '/api/attendance/sync',
        '/api/student/sync',
        '/api/student/update',
        '/api/me/invitation-profile',
        '/api/admin/accounts/invite',
        '/api/admin/accounts/invite-message',
        '/api/admin/accounts/verify-phone',
        '/api/admin/accounts/grant',
        '/api/admin/accounts/disable',
        '/api/admin/accounts/reset-password',
        '/api/admin/accounts/reset-password-generated',
        '/api/admin/students',
        '/api/admin/courses',
        '/api/admin/courses/status',
        '/api/admin/courses/settings',
        '/api/admin/enrollments',
        '/api/admin/enrollments/membership',
        '/api/admin/enrollments/grades',
        '/api/admin/enrollments/decision',
        '/api/admin/enrollments/handbook',
        '/api/admin/students/enroll',
      ].includes(path) &&
        request.method !== 'GET')
    )
      return reply({ error: 'Method not allowed' }, 405)
    const bearer = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)
    if (!bearer && !verifyRequest) return reply({ error: 'Unauthorized' }, 401)
    let subject: string
    let sessionId: string | undefined
    try {
      if (verifyRequest) ({ subject, sessionId } = await verifyRequest(request))
      else if (bearer) subject = await verify(bearer[1])
      else return reply({ error: 'Unauthorized' }, 401)
    } catch {
      return reply({ error: 'Unauthorized' }, 401)
    }
    try {
      const db = await pool.connect()
      try {
        await db.query('BEGIN')
        if (
          [
            '/api/me/invitation-profile',
            '/api/admin/accounts/invite',
            '/api/admin/accounts/verify-phone',
            '/api/admin/accounts/reset-password',
            '/api/admin/accounts/reset-password-generated',
          ].includes(path)
        )
          await db.query("SELECT pg_advisory_xact_lock(hashtextextended('auth-mutations', 0))")
        const result = await db.query(
          `SELECT role, teacher_id, student_id, active, expires_at,
            invitation_request_id, invitation_username IS NOT NULL AS "hasLegacyInvitation", verified_phone AS "verifiedPhone", invitation_phone AS phone,
            invitation_requires_setup AS "requiresSetup"
           FROM app_accounts WHERE auth_user_id = $1 FOR UPDATE`,
          [subject],
        )
        if (!result.rows.length) throw new HttpError(403)
        const account = accountRow.parse(result.rows[0])
        if (!live(account.active, account.expires_at)) throw new HttpError(403)
        const invitationProfile =
          result.rows[0].hasLegacyInvitation || result.rows[0].invitation_request_id
            ? invitationProfileSchema.parse(result.rows[0])
            : undefined
        if (path === '/api/me/invitation-profile') {
          const eligible =
            account.role === 'student'
              ? await db.query('SELECT 1 FROM students WHERE id = $1 AND active', [
                  account.student_id,
                ])
              : await db.query(
                  'SELECT 1 FROM teachers WHERE id = $1 AND active AND (expires_at IS NULL OR expires_at > now())',
                  [account.teacher_id],
                )
          if (!eligible.rowCount) throw new HttpError(403)
          if (!invitationProfile) throw new HttpError(403)
          if (invitationProfile.requiresSetup && !sessionId) throw new HttpError(403)
          if (sessionId) {
            // A reset or sign-out may revoke this session while the request waits for the lock.
            const session = await db.query(
              'SELECT 1 FROM neon_auth.session WHERE id = $1 AND "userId" = $2 AND "expiresAt" > statement_timestamp()',
              [sessionId, subject],
            )
            if (!session.rowCount) throw new HttpError(401)
          }
          const body = await readBody(request)
          const edit = invitationProfile.requiresSetup
            ? null
            : invitationProfileInputSchema.parse(body)
          const newPassword = edit
            ? edit.newPassword
            : invitationSetupInputSchema.parse(body).newPassword
          const credential = await db.query(
            `SELECT password FROM neon_auth.account WHERE "userId"::text = $1 AND "providerId" = 'credential' FOR UPDATE`,
            [subject],
          )
          const password = z.string().nullable().parse(credential.rows[0]?.password)
          if (
            !password ||
            (edit && !(await verifyPassword({ hash: password, password: edit.currentPassword }))) ||
            (newPassword && (await verifyPassword({ hash: password, password: newPassword })))
          )
            throw new HttpError(400)
          await db.query(
            'UPDATE app_accounts SET invitation_phone = $2, invitation_requires_setup = false WHERE auth_user_id = $1',
            [subject, edit?.phone ?? invitationProfile.phone],
          )
          if (newPassword) {
            const hash = await hashPassword(newPassword)
            await db.query(
              `UPDATE neon_auth.account SET password = $2, "updatedAt" = now() WHERE "userId"::text = $1 AND "providerId" = 'credential'`,
              [subject, hash],
            )
            await db.query(
              'DELETE FROM neon_auth.session WHERE "userId"::text = $1 AND id IS DISTINCT FROM $2::uuid',
              [subject, sessionId ?? null],
            )
          }
          await db.query('COMMIT')
          return reply({ saved: true, sessionRevoked: !!newPassword && !sessionId })
        }
        if (invitationProfile?.requiresSetup && path !== '/api/me') throw new HttpError(403)
        if (account.role === 'student') {
          if (!account.student_id) throw new HttpError(403)
          const result = await db.query(
            'SELECT id, name, group_name, active FROM students WHERE id = $1 FOR SHARE',
            [account.student_id],
          )
          if (!result.rows.length) throw new HttpError(403)
          const student = studentRow.parse(result.rows[0])
          if (!student.active) throw new HttpError(403)
          const profile = {
            role: 'student',
            id: student.id,
            name: student.name,
            canRead: true,
            canWrite: false,
            expiresAt: account.expires_at?.toISOString() ?? null,
            ...(invitationProfile ? { invitationProfile } : {}),
          }
          if (path === '/api/me') {
            await db.query('COMMIT')
            return reply({ account: profile })
          }
          if (path !== '/api/student/attendance') throw new HttpError(403)
          const rows = z
            .array(eventRow)
            .parse(
              (
                await db.query(
                  `SELECT e.id, e.actor, e.client_time, e.received_at, e.payload FROM events e WHERE e.student_id = $1 AND ${visibleLedgerEvent} ORDER BY e.sequence`,
                  [student.id],
                )
              ).rows,
            )
          const events = rows.map((e) =>
            eventSchema.parse({
              id: e.id,
              actor: e.actor,
              clientTime: e.client_time.toISOString(),
              receivedAt: e.received_at.toISOString(),
              payload: e.payload,
            }),
          )
          const courseRows = z
            .array(z.object({ id: z.uuid(), name: z.string() }))
            .parse(
              (
                await db.query(
                  'SELECT ce.id, c.name FROM course_enrollments ce JOIN courses c ON c.id = ce.course_id WHERE ce.student_id = $1',
                  [student.id],
                )
              ).rows,
            )
          const attendance = projectEvents(events).attendance.map(({ value }) => ({
            date: value.date,
            status: value.status,
            ...(value.enrollmentId
              ? {
                  enrollmentId: value.enrollmentId,
                  course: courseRows.find((entry) => entry.id === value.enrollmentId)?.name ?? null,
                }
              : {}),
          }))
          const response = neonStudentAttendanceSchema.parse({
            student: { studentId: student.id, name: student.name, group: student.group_name },
            attendance,
          })
          await db.query('COMMIT')
          return reply(response)
        }
        if (!account.teacher_id) throw new HttpError(403)
        const staff = await db.query(
          'SELECT id, name, active, access_mode, expires_at FROM teachers WHERE id = $1 FOR UPDATE',
          [account.teacher_id],
        )
        if (!staff.rows.length) throw new HttpError(403)
        const row = teacherRow.parse(staff.rows[0])
        if (!live(row.active, row.expires_at)) throw new HttpError(403)
        const teacher = neonTeacherSchema.parse({
          role: account.role,
          id: row.id,
          name: row.name,
          canRead: account.role === 'teacher' || row.access_mode !== 'write_only',
          canWrite: account.role === 'teacher' || row.access_mode !== 'read_only',
          expiresAt:
            [row.expires_at, account.expires_at]
              .filter((v): v is Date => v !== null)
              .sort((a, b) => a.getTime() - b.getTime())[0]
              ?.toISOString() ?? null,
        })
        if (path === '/api/me') {
          await db.query('COMMIT')
          return reply({
            account: { ...teacher, ...(invitationProfile ? { invitationProfile } : {}) },
            teacher,
          })
        }
        if (path === '/api/student/update') {
          if (!teacher.canWrite) throw new HttpError(403)
          const student = teacherStudentUpdateSchema.parse(await readBody(request))
          const current = await db.query(
            `SELECT COALESCE(first_name, name) AS "firstName", COALESCE(last_name, '') AS "lastName", group_name AS "group", whatsapp, location, birth_year AS "birthYear" FROM students WHERE id = $1 AND active AND ($2::boolean OR teacher_id = $3) FOR UPDATE`,
            [student.studentId, teacher.role === 'administrator', teacher.id],
          )
          if (!current.rows.length) throw new HttpError(403)
          const currentStudent = studentProfileVersionSchema.parse(current.rows[0])
          if (
            studentProfileVersionSchema
              .keyof()
              .options.some((field) => currentStudent[field] !== student.expected[field])
          )
            throw new HttpError(409)
          const result = await db.query(
            `UPDATE students SET first_name = $2, last_name = $3, name = $4, group_name = $5, whatsapp = $6, location = $7, birth_year = $8
             WHERE id = $1 AND active AND ($9::boolean OR teacher_id = $10)`,
            [
              student.studentId,
              student.firstName,
              student.lastName,
              [student.firstName, student.lastName].filter(Boolean).join(' '),
              student.group,
              student.whatsapp,
              student.location,
              student.birthYear,
              teacher.role === 'administrator',
              teacher.id,
            ],
          )
          if (!result.rowCount) throw new HttpError(403)
          await db.query('COMMIT')
          return reply({ saved: true })
        }
        if (path.startsWith('/api/admin')) {
          if (teacher.role !== 'administrator' || !teacher.canRead || !teacher.canWrite)
            throw new HttpError(403)
          let response: unknown
          if (path === '/api/admin/accounts/invite-message') {
            if (invitationReceipt?.kind !== 'reveal') throw new HttpError(404)
            const { requestId } = z
              .strictObject({ requestId: z.uuid() })
              .parse(await readBody(request))
            response = await invitationReceipt.reveal(db, subject, requestId)
            if (!response) throw new HttpError(404)
          } else if (path === '/api/admin') response = await adminBoard(db)
          else {
            const body = await readBody(request)
            response = await manage(db, path, body, subject)
            if (path === '/api/admin/accounts/invite' && invitationReceipt?.kind === 'save') {
              const { requestId } = invitationRequestSchema.parse(body)
              await invitationReceipt.save(db, subject, requestId, response)
              response = { requestId }
            }
          }
          await db.query('COMMIT')
          return reply(response)
        }
        if (
          (path === '/api/events' ||
            path === '/api/attendance/sync' ||
            path === '/api/student/sync') &&
          !teacher.canWrite
        )
          throw new HttpError(403)
        if ((path === '/api/attendance/sync' || path === '/api/student/sync') && !teacher.canRead)
          throw new HttpError(403)
        const batch = path === '/api/events' ? neonBatchSchema.parse(await readBody(request)) : null
        if (
          path === '/api/student/attendance' ||
          (path === '/api/notebook' && !teacher.canRead) ||
          (batch && !teacher.canWrite)
        )
          throw new HttpError(403)
        const sync =
          path === '/api/attendance/sync'
            ? offlineAttendanceSyncSchema.parse(await readBody(request))
            : null
        const studentSync =
          path === '/api/student/sync'
            ? offlineStudentSyncSchema.parse(await readBody(request))
            : null
        if (
          (sync && sync.accountId !== subject) ||
          (studentSync && studentSync.accountId !== subject)
        )
          throw new HttpError(403)
        // ponytail: one ledger lock serializes writes; use ordered student locks if throughput requires it.
        if (batch || sync || studentSync)
          await db.query("SELECT pg_advisory_xact_lock(hashtextextended('attendance-ledger', 0))")
        if (studentSync) {
          const operation = studentSync.operation
          const studentId =
            operation.kind === 'note' ? operation.event.payload.studentId : operation.studentId
          const id = operation.kind === 'note' ? operation.event.id : operation.id
          const { rows } = await db.query(
            'SELECT whatsapp FROM students WHERE id = $1 AND active AND ($2::boolean OR teacher_id = $3) FOR UPDATE',
            [studentId, teacher.role === 'administrator', teacher.id],
          )
          const student = z.object({ whatsapp: z.string().nullable() }).optional().parse(rows[0])
          if (!student) {
            await db.query('COMMIT')
            return reply({ id, kind: 'forbidden', currentWhatsapp: null })
          }
          const currentWhatsapp = student.whatsapp?.trim() || null
          const clientTime =
            operation.kind === 'note' ? operation.event.clientTime : operation.clientTime
          const payload =
            operation.kind === 'note'
              ? operation.event.payload
              : {
                  kind: 'contact_receipt',
                  fingerprint: new Bun.CryptoHasher('sha256')
                    .update(JSON.stringify({ subject, operation }))
                    .digest('hex'),
                }
          const existing = await db.query('SELECT 1 FROM events WHERE id = $1', [id])
          if (existing.rowCount) {
            const same = await db.query(
              'SELECT 1 FROM events WHERE id = $1 AND teacher_id = $2 AND student_id = $3 AND client_time = $4 AND payload = $5::jsonb',
              [id, teacher.id, studentId, clientTime, JSON.stringify(payload)],
            )
            await db.query('COMMIT')
            return reply({ id, kind: same.rowCount ? 'saved' : 'id_conflict', currentWhatsapp })
          }
          if (operation.kind === 'contact' && currentWhatsapp !== operation.expectedWhatsapp) {
            await db.query('COMMIT')
            return reply({ id, kind: 'conflict', currentWhatsapp })
          }
          if (operation.kind === 'contact')
            await db.query('UPDATE students SET whatsapp = $2 WHERE id = $1', [
              studentId,
              operation.whatsapp,
            ])
          await db.query(
            'INSERT INTO events (id, teacher_id, student_id, actor, client_time, payload, enrollment_id) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)',
            [id, teacher.id, studentId, teacher.name, clientTime, JSON.stringify(payload), null],
          )
          await db.query('COMMIT')
          return reply({
            id,
            kind: 'saved',
            currentWhatsapp: operation.kind === 'contact' ? operation.whatsapp : currentWhatsapp,
          })
        }
        const current = await snapshot(db, teacher, !batch && !sync)
        if (sync) {
          const outcomes = []
          for (const { event, expectedEventId, expectedRevision } of sync.records) {
            const payload = event.payload
            const latest = projectEvents(current.events).attendance.find(
              ({ value }) =>
                value.studentId === payload.studentId &&
                value.enrollmentId === payload.enrollmentId &&
                value.date === payload.date,
            )
            const version = latest
              ? { eventId: latest.event.id, status: latest.value.status }
              : null
            try {
              validateAssignedPayloads(
                [payload],
                current.students,
                current.events,
                current.enrollments,
                current.courses,
              )
            } catch {
              outcomes.push({ id: event.id, kind: 'forbidden', current: null })
              continue
            }
            const existing = await db.query('SELECT 1 FROM events WHERE id = $1', [event.id])
            if (existing.rowCount) {
              const same = await db.query(
                'SELECT 1 FROM events WHERE id = $1 AND teacher_id = $2 AND student_id = $3 AND client_time = $4 AND payload = $5::jsonb',
                [
                  event.id,
                  teacher.id,
                  payload.studentId,
                  event.clientTime,
                  JSON.stringify(payload),
                ],
              )
              outcomes.push({
                id: event.id,
                kind: same.rowCount ? 'saved' : 'id_conflict',
                current: version,
              })
              continue
            }
            if (
              (expectedRevision === 'unknown'
                ? version !== null
                : (version?.eventId ?? null) !== expectedEventId) &&
              version?.status !== payload.status
            ) {
              outcomes.push({ id: event.id, kind: 'conflict', current: version })
              continue
            }
            await db.query(
              'INSERT INTO events (id, teacher_id, student_id, actor, client_time, payload, enrollment_id) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)',
              [
                event.id,
                teacher.id,
                payload.studentId,
                teacher.name,
                event.clientTime,
                JSON.stringify(payload),
                payload.enrollmentId,
              ],
            )
            current.events.push(event)
            outcomes.push({
              id: event.id,
              kind: 'saved',
              current: { eventId: event.id, status: payload.status },
            })
          }
          await db.query('COMMIT')
          return reply({ outcomes })
        }
        if (batch) {
          if (batch.events.some((e) => e.actor !== teacher.name)) throw new HttpError(403)
          const existingIds = new Set(current.events.map((event) => event.id))
          const newEvents = batch.events.filter((event) => !existingIds.has(event.id))
          try {
            validateAssignedPayloads(
              newEvents.map((e) => e.payload),
              current.students,
              current.events,
              current.enrollments,
              current.courses,
            )
          } catch {
            throw new HttpError(403)
          }
          for (const event of batch.events) {
            const payload = event.payload
            const studentId =
              payload.kind === 'reversal'
                ? current.events.find((e) => e.id === payload.targetId)?.payload
                : payload
            if (!studentId || !('studentId' in studentId)) throw new HttpError(403)
            const inserted = await db.query(
              'INSERT INTO events (id, teacher_id, student_id, actor, client_time, payload, enrollment_id) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) ON CONFLICT (id) DO NOTHING RETURNING id',
              [
                event.id,
                teacher.id,
                studentId.studentId,
                teacher.name,
                event.clientTime,
                JSON.stringify(payload),
                studentId.kind === 'attendance' ? (studentId.enrollmentId ?? null) : null,
              ],
            )
            if (!inserted.rowCount) {
              const same = await db.query(
                'SELECT 1 FROM events WHERE id = $1 AND teacher_id = $2 AND student_id = $3 AND actor = $4 AND client_time = $5 AND payload = $6::jsonb',
                [
                  event.id,
                  teacher.id,
                  studentId.studentId,
                  teacher.name,
                  event.clientTime,
                  JSON.stringify(payload),
                ],
              )
              if (!same.rowCount) throw new HttpError(409)
            }
          }
        }
        const response =
          batch && !teacher.canRead
            ? { saved: batch.events.length }
            : batch
              ? await snapshot(db, teacher, true)
              : current
        await db.query('COMMIT')
        return reply(response)
      } catch (error) {
        await db.query('ROLLBACK')
        throw error
      } finally {
        db.release()
      }
    } catch (error) {
      const status =
        error instanceof HttpError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : error instanceof Error && 'code' in error && error.code === '23505'
              ? 409
              : 500
      return reply(
        {
          error:
            (
              {
                400: 'Invalid request',
                403: 'Forbidden',
                409: 'Conflict',
                413: 'Request too large',
              } as Record<number, string>
            )[status] ?? 'Server error',
        },
        status,
      )
    }
  }
}
