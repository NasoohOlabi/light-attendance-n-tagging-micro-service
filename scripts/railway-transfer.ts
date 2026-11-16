import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, relative, isAbsolute } from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { z } from 'zod'

// Provider sessions and signing keys deliberately stay on the old host.
const tables = [
  {
    name: 'neon_auth.user',
    columns: ['id', 'name', 'email', 'emailVerified', 'image', 'createdAt', 'updatedAt'],
  },
  {
    name: 'neon_auth.account',
    columns: ['id', 'accountId', 'providerId', 'userId', 'password', 'createdAt', 'updatedAt'],
  },
  {
    name: 'public.teachers',
    columns: ['id', 'auth_user_id', 'name', 'active', 'access_mode', 'expires_at'],
  },
  { name: 'public.students', columns: ['id', 'name', 'teacher_id', 'group_name', 'active'] },
  {
    name: 'public.app_accounts',
    columns: ['auth_user_id', 'role', 'teacher_id', 'student_id', 'active', 'expires_at'],
  },
  {
    name: 'public.events',
    columns: [
      'id',
      'sequence',
      'teacher_id',
      'student_id',
      'actor',
      'client_time',
      'received_at',
      'payload',
    ],
  },
] as const
const rowSchema = z.record(z.string(), z.json())
const backupSchema = z.strictObject({
  version: z.union([z.literal(1), z.literal(2)]),
  createdAt: z.iso.datetime(),
  tables: z.array(z.strictObject({ name: z.string(), rows: z.array(rowSchema) })),
})
type Backup = z.infer<typeof backupSchema>
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"'
const sqlTable = (name: string) => name.split('.').map(quote).join('.')
function privateFile(path: string) {
  const result = resolve(path)
  const part = relative(resolve('.local'), result)
  if (!part || part.startsWith('..') || isAbsolute(part))
    throw new Error('Backup must be inside ignored .local/')
  return result
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
        .join(',') +
      '}'
    )
  return JSON.stringify(value)
}
function digest(rows: Backup['tables'][number]['rows']) {
  return createHash('sha256').update(rows.map(canonical).sort().join('\n')).digest('hex')
}
async function snapshot(db: PoolClient, structuredNames: boolean): Promise<Backup> {
  const data: Backup = {
    version: structuredNames ? 2 : 1,
    createdAt: new Date().toISOString(),
    tables: [],
  }
  for (const table of tables) {
    const columns =
      table.name === 'public.students' && structuredNames
        ? [...table.columns, 'first_name', 'last_name']
        : table.columns
    const result = await db.query(
      `SELECT row_to_json(item) AS row FROM (SELECT ${columns.map(quote).join(',')} FROM ${sqlTable(table.name)}) item`,
    )
    data.tables.push({
      name: table.name,
      rows: z
        .array(z.object({ row: rowSchema }))
        .parse(result.rows)
        .map((entry) => entry.row),
    })
  }
  return data
}
function validateBackup(backup: Backup) {
  if (backup.tables.length !== tables.length) throw new Error('Unexpected backup tables')
  for (const [index, table] of tables.entries()) {
    const saved = backup.tables[index]
    if (
      !saved ||
      saved.name !== table.name ||
      saved.rows.some((row) => {
        const columns = Object.keys(row).sort()
        const expected =
          table.name === 'public.students' && backup.version === 2
            ? [...table.columns, 'first_name', 'last_name']
            : table.columns
        return canonical(columns) !== canonical([...expected].sort())
      })
    )
      throw new Error('Unexpected backup columns')
  }
  const accounts = backup.tables.find((table) => table.name === 'neon_auth.account')
  if (
    accounts?.rows.some(
      (row) =>
        row.providerId !== 'credential' ||
        typeof row.password !== 'string' ||
        !/^[a-f0-9]+:[a-f0-9]+$/.test(row.password),
    )
  )
    throw new Error('Unsupported credential provider or hash; migration stopped')
}
async function main() {
  const [command, path] = process.argv.slice(2)
  if (!path || !['export', 'import', 'compare'].includes(command ?? ''))
    throw new Error(
      'Usage: bun scripts/railway-transfer.ts export|import|compare .local/backup.json',
    )
  const file = privateFile(path)
  const connectionString =
    command === 'export'
      ? process.env.DATABASE_URL_UNPOOLED
      : process.env.MIGRATION_TARGET_DATABASE_URL
  if (!connectionString) throw new Error('Explicit source or target database URL required')
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 15000,
    statement_timeout: 30000,
  })
  const db = await pool.connect()
  try {
    await db.query(
      command === 'import' ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
    )
    if (command === 'export') {
      const banned = await db.query(
        `SELECT count(*)::int AS count FROM neon_auth."user" u WHERE COALESCE((to_jsonb(u)->>'banned')::boolean, false)`,
      )
      if (z.object({ count: z.literal(0) }).safeParse(banned.rows[0]).success === false)
        throw new Error('Banned identities need explicit migration handling')
      const names = await db.query(
        "SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'students' AND column_name IN ('first_name', 'last_name')",
      )
      const count = z.object({ count: z.number() }).parse(names.rows[0]).count
      if (count !== 0 && count !== 2) throw new Error('Incomplete student name migration')
      const backup = await snapshot(db, count === 2)
      validateBackup(backup)
      await writeFile(file, JSON.stringify(backup), { mode: 0o600, flag: 'wx' })
      console.log(
        JSON.stringify({
          exported: backup.tables.map((table) => ({ table: table.name, rows: table.rows.length })),
        }),
      )
    } else {
      const backup = backupSchema.parse(JSON.parse(await readFile(file, 'utf8')))
      validateBackup(backup)
      if (command === 'import') {
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended('railway-transfer', 0))")
        for (const table of tables) {
          const result = await db.query(
            `SELECT count(*)::int AS count FROM ${sqlTable(table.name)}`,
          )
          if (!z.object({ count: z.literal(0) }).safeParse(result.rows[0]).success)
            throw new Error('Target must be empty; existing records were preserved')
        }
        for (const table of backup.tables) {
          for (const row of table.rows) {
            const columns = Object.keys(row)
            await db.query(
              `INSERT INTO ${sqlTable(table.name)} (${columns.map(quote).join(',')}) ${table.name === 'public.events' ? 'OVERRIDING SYSTEM VALUE ' : ''}VALUES (${columns.map((_, index) => '$' + (index + 1)).join(',')})`,
              columns.map((column) => row[column]),
            )
          }
        }
        await db.query(
          "SELECT setval(pg_get_serial_sequence('events', 'sequence'), GREATEST(COALESCE((SELECT max(sequence) FROM events), 1), 1), EXISTS(SELECT 1 FROM events))",
        )
      }
      const actual = await snapshot(db, backup.version === 2)
      for (const [index, table] of backup.tables.entries()) {
        const other = actual.tables[index]
        if (!other || digest(table.rows) !== digest(other.rows))
          throw new Error('Backup comparison failed for ' + table.name)
      }
      console.log(
        JSON.stringify({
          verified: backup.tables.map((table) => ({
            table: table.name,
            rows: table.rows.length,
            sha256: digest(table.rows),
          })),
        }),
      )
    }
    await db.query('COMMIT')
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  } finally {
    db.release()
    await pool.end()
  }
}
main().catch(() => {
  console.error(
    'Database transfer failed; no credentials or records were logged. Check configuration, schema and backup compatibility.',
  )
  process.exitCode = 1
})
