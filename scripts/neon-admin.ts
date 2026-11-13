import { readdir, readFile } from 'node:fs/promises'
import { Pool, type PoolClient } from 'pg'
import { z } from 'zod'
import { neonAdminGrantSchema } from '../shared/neon'

const teacherFields = {
  id: z.uuid().default(() => crypto.randomUUID()),
  name: z.string().trim().min(1).max(100),
  mode: z.enum(['read_write', 'read_only', 'write_only']).default('read_write'),
  expiresAt: z.iso.datetime().nullable().default(null),
}
const identity = z.union([
  z.strictObject({ authUserId: z.string().trim().min(1).max(200) }),
  z.strictObject({ email: z.email() }),
])
const teacherInput = z.union([
  z.strictObject({ ...teacherFields, authUserId: z.string().trim().min(1).max(200) }),
  z.strictObject({ ...teacherFields, email: z.email() }),
])
const accountInput = z.union([
  ...(['administrator', 'teacher', 'student'] as const).flatMap((role) => {
    const fields =
      role === 'student'
        ? {
            role: z.literal(role),
            studentId: z.uuid(),
            expiresAt: z.iso.datetime().nullable().default(null),
          }
        : role === 'teacher'
          ? {
              role: z.literal(role),
              name: teacherFields.name,
              mode: teacherFields.mode,
              expiresAt: teacherFields.expiresAt,
            }
          : { role: z.literal(role), name: teacherFields.name }
    return [
      z.strictObject({ ...fields, email: z.email() }),
      z.strictObject({ ...fields, authUserId: z.string().trim().min(1).max(200) }),
    ]
  }),
])
const studentInput = z
  .array(
    z.strictObject({
      id: z.uuid(),
      teacherId: z.uuid(),
      name: z.string().trim().min(1).max(200),
      group: z.string().trim().max(100),
      active: z.boolean(),
    }),
  )
  .max(10000)

async function transaction<T>(pool: Pool, action: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await action(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
async function resolveIdentity(client: PoolClient, input: z.infer<typeof identity>) {
  const result =
    'authUserId' in input
      ? await client.query('SELECT id FROM neon_auth."user" WHERE id::text = $1', [
          input.authUserId,
        ])
      : await client.query('SELECT id FROM neon_auth."user" WHERE lower(email) = lower($1)', [
          input.email,
        ])
  if (result.rows.length !== 1) throw new Error('Auth user not found or ambiguous')
  return z.object({ id: z.string().min(1) }).parse(result.rows[0]).id
}
async function grant(client: PoolClient, raw: unknown, requestedId: string = crypto.randomUUID()) {
  const input = z
    .object({ email: z.email().optional(), authUserId: z.string().optional() })
    .parse(raw)
  const authUserId = await resolveIdentity(
    client,
    identity.parse(input.email ? { email: input.email } : { authUserId: input.authUserId }),
  )
  const object = z.record(z.string(), z.unknown()).parse(raw)
  const { email: _email, ...withoutEmail } = object
  const account = neonAdminGrantSchema.parse({ ...withoutEmail, authUserId })
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [authUserId])
  if (account.role === 'student') {
    await client.query(
      `INSERT INTO app_accounts (auth_user_id, role, student_id, active, expires_at) VALUES ($1, 'student', $2, true, $3)
      ON CONFLICT (auth_user_id) DO UPDATE SET role = EXCLUDED.role, teacher_id = NULL, student_id = EXCLUDED.student_id, active = true, expires_at = EXCLUDED.expires_at`,
      [authUserId, account.studentId, account.expiresAt],
    )
  } else {
    const mode = account.role === 'teacher' ? account.mode : 'read_write'
    const expiry = account.role === 'teacher' ? account.expiresAt : null
    const staff = await client.query(
      `INSERT INTO teachers (id, auth_user_id, name, active, access_mode, expires_at) VALUES ($1, $2, $3, true, $4, $5)
      ON CONFLICT (auth_user_id) DO UPDATE SET name = EXCLUDED.name, active = true, access_mode = EXCLUDED.access_mode, expires_at = EXCLUDED.expires_at RETURNING id`,
      [requestedId, authUserId, account.name, mode, expiry],
    )
    const staffId = z.object({ id: z.uuid() }).parse(staff.rows[0]).id
    await client.query(
      `INSERT INTO app_accounts (auth_user_id, role, teacher_id, active, expires_at) VALUES ($1, $2, $3, true, $4)
      ON CONFLICT (auth_user_id) DO UPDATE SET role = EXCLUDED.role, teacher_id = EXCLUDED.teacher_id, student_id = NULL, active = true, expires_at = EXCLUDED.expires_at`,
      [authUserId, account.role, staffId, expiry],
    )
  }
}
async function migrate(pool: Pool) {
  const directory = new URL('../neon/', import.meta.url)
  const files = (await readdir(directory)).filter((name) => /^\d+[-_].*\.sql$/.test(name)).sort()
  // Versioned SQL stays repeatable; apply it atomically without hidden schema metadata.
  await transaction(pool, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('halaqa-migrations', 0))")
    for (const file of files) await client.query(await readFile(new URL(file, directory), 'utf8'))
  })
}
async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!process.env.DATABASE_URL_UNPOOLED) throw new Error('Database required')
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_UNPOOLED,
    max: 1,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
  })
  try {
    if (command === 'migrate' && args.length === 0) {
      await migrate(pool)
      console.log('Migrations applied')
    } else if (command === 'teacher' && args[0] === 'grant' && args.length === 2) {
      const teacher = teacherInput.parse(JSON.parse(await readFile(args[1], 'utf8')))
      const { id, ...fields } = teacher
      await transaction(pool, (client) => grant(client, { ...fields, role: 'teacher' }, id))
      console.log('Teacher granted')
    } else if (command === 'account' && args[0] === 'grant' && args.length === 2) {
      const account = accountInput.parse(JSON.parse(await readFile(args[1], 'utf8')))
      await transaction(pool, (client) => grant(client, account))
      console.log('Account granted')
    } else if (command === 'account' && args[0] === 'disable' && args.length === 2) {
      const id = z.string().trim().min(1).max(200).parse(args[1])
      await transaction(pool, async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [id])
        const result = await client.query(
          'UPDATE app_accounts SET active = false WHERE auth_user_id = $1',
          [id],
        )
        if (!result.rowCount) throw new Error('Account not found')
      })
      console.log('Account disabled')
    } else if (command === 'teacher' && args[0] === 'disable' && args.length === 2) {
      const id = z.uuid().parse(args[1])
      await transaction(pool, async (client) => {
        const row = await client.query('SELECT auth_user_id FROM teachers WHERE id = $1', [id])
        const authUserId = z.object({ auth_user_id: z.string() }).parse(row.rows[0]).auth_user_id
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [authUserId])
        await client.query('UPDATE teachers SET active = false WHERE id = $1', [id])
      })
      console.log('Teacher disabled')
    } else if (command === 'students' && args[0] === 'upsert' && args.length === 2) {
      const students = studentInput.parse(JSON.parse(await readFile(args[1], 'utf8')))
      await transaction(pool, async (client) => {
        for (const student of students)
          await client.query(
            `INSERT INTO students (id, teacher_id, name, group_name, active) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id, name = EXCLUDED.name, group_name = EXCLUDED.group_name, active = EXCLUDED.active`,
            [student.id, student.teacherId, student.name, student.group, student.active],
          )
      })
      console.log('Students saved')
    } else throw new Error('Invalid command')
  } finally {
    await pool.end()
  }
}
main().catch(() => {
  console.error('Command failed; check arguments, private input, and database access')
  process.exitCode = 1
})
