import { readFile } from 'node:fs/promises'
import { Pool, type PoolClient } from 'pg'
import { z } from 'zod'

const planSchema = z
  .object({
    courseId: z.uuid(),
    rows: z
      .array(
        z.object({
          enrollmentId: z.uuid(),
          student: z.object({ id: z.uuid(), teacherId: z.uuid(), name: z.string().min(1) }),
        }),
      )
      .min(1),
  })
  .superRefine((plan, context) => {
    for (const ids of [
      plan.rows.map((row) => row.enrollmentId),
      plan.rows.map((row) => row.student.id),
    ]) {
      if (new Set(ids).size !== ids.length)
        context.addIssue({ code: 'custom', message: 'Duplicate IDs' })
    }
  })

export async function importEnrollmentTeachers(client: PoolClient, raw: unknown) {
  const plan = planSchema.parse(raw)
  await client.query("SET LOCAL lock_timeout = '10s'")
  await client.query(
    'LOCK TABLE students, teachers, course_enrollments IN SHARE ROW EXCLUSIVE MODE',
  )
  let changed = 0
  for (const row of plan.rows) {
    const result = await client.query(
      `SELECT e.teacher_id FROM course_enrollments e
      JOIN students s ON s.id = e.student_id JOIN teachers t ON t.id = $4
      WHERE e.id = $1 AND e.course_id = $2 AND s.id = $3 AND s.name = $5 AND s.teacher_id = t.id`,
      [row.enrollmentId, plan.courseId, row.student.id, row.student.teacherId, row.student.name],
    )
    if (result.rows.length !== 1) throw new Error('Enrollment or roster changed')
    const existing = z.object({ teacher_id: z.uuid().nullable() }).parse(result.rows[0]).teacher_id
    if (existing && existing !== row.student.teacherId) throw new Error('Teacher conflict')
    if (!existing) {
      await client.query('UPDATE course_enrollments SET teacher_id = $1 WHERE id = $2', [
        row.student.teacherId,
        row.enrollmentId,
      ])
      changed++
    }
  }
  return { matched: plan.rows.length, changed }
}

async function main() {
  const [mode, path, ...rest] = process.argv.slice(2)
  if (
    !['dry-run', 'apply'].includes(mode) ||
    !path ||
    rest.length ||
    !process.env.DATABASE_URL_UNPOOLED
  )
    throw new Error('Invalid arguments')
  const input: unknown = JSON.parse(await readFile(path, 'utf8'))
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_UNPOOLED,
    max: 1,
    connectionTimeoutMillis: 10000,
  })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await importEnrollmentTeachers(client, input)
    await client.query(mode === 'apply' ? 'COMMIT' : 'ROLLBACK')
    console.log(JSON.stringify({ mode, ...result }))
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}
if (import.meta.main)
  main().catch(() => {
    console.error(
      'Import failed; check private input, schema, roster and existing teacher assignments',
    )
    process.exitCode = 1
  })
