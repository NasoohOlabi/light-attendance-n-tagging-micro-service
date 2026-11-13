import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { z } from 'zod'

const teacherFields = {
  id: z.uuid().default(() => crypto.randomUUID()),
  name: z.string().trim().min(1).max(100),
  mode: z.enum(['read_write', 'read_only', 'write_only']).default('read_write'),
  expiresAt: z.iso.datetime().nullable().default(null),
}
const teacherInput = z.union([
  z.object({ ...teacherFields, authUserId: z.string().trim().min(1).max(200) }).strict(),
  z.object({ ...teacherFields, email: z.email() }).strict(),
])
const studentInput = z
  .array(
    z
      .object({
        id: z.uuid(),
        teacherId: z.uuid(),
        name: z.string().trim().min(1).max(200),
        group: z.string().trim().max(100),
        active: z.boolean(),
      })
      .strict(),
  )
  .max(10000)

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!process.env.DATABASE_URL_UNPOOLED) throw new Error('DATABASE_URL_UNPOOLED is required')
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_UNPOOLED,
    max: 1,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
  })
  try {
    if (command === 'migrate' && args.length === 0) {
      await pool.query(await readFile(new URL('../neon/001-notebook.sql', import.meta.url), 'utf8'))
      console.log('Migration applied')
    } else if (command === 'teacher' && args[0] === 'grant' && args.length === 2) {
      const teacher = teacherInput.parse(JSON.parse(await readFile(args[1], 'utf8')))
      const authUserId =
        'authUserId' in teacher
          ? teacher.authUserId
          : z
              .object({ id: z.string().min(1) })
              .parse(
                (
                  await pool.query(
                    'SELECT id FROM neon_auth."user" WHERE lower(email) = lower($1)',
                    [teacher.email],
                  )
                ).rows[0],
              ).id
      await pool.query(
        `INSERT INTO teachers (id, auth_user_id, name, access_mode, expires_at, active) VALUES ($1, $2, $3, $4, $5, true)
        ON CONFLICT (auth_user_id) DO UPDATE SET name = EXCLUDED.name, access_mode = EXCLUDED.access_mode, expires_at = EXCLUDED.expires_at, active = true`,
        [teacher.id, authUserId, teacher.name, teacher.mode, teacher.expiresAt],
      )
      console.log('Teacher granted')
    } else if (command === 'teacher' && args[0] === 'disable' && args.length === 2) {
      const id = z.uuid().parse(args[1])
      const result = await pool.query('UPDATE teachers SET active = false WHERE id = $1', [id])
      if (!result.rowCount) throw new Error('Teacher not found')
      console.log('Teacher disabled')
    } else if (command === 'students' && args[0] === 'upsert' && args.length === 2) {
      const students = studentInput.parse(JSON.parse(await readFile(args[1], 'utf8')))
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        for (const student of students)
          await client.query(
            `INSERT INTO students (id, teacher_id, name, group_name, active) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id, name = EXCLUDED.name, group_name = EXCLUDED.group_name, active = EXCLUDED.active`,
            [student.id, student.teacherId, student.name, student.group, student.active],
          )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
      console.log(`Students saved: ${students.length}`)
    } else
      throw new Error(
        'Usage: migrate | teacher grant <private-json> | teacher disable <uuid> | students upsert <private-json>',
      )
  } finally {
    await pool.end()
  }
}
main().catch(() => {
  console.error('Command failed; check arguments, private input, and database access')
  process.exitCode = 1
})
