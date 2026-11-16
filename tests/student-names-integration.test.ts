import { expect, test } from 'bun:test'
import { mkdir, readFile, unlink } from 'node:fs/promises'
import { Pool } from 'pg'
import { z } from 'zod'
import { createHandler } from '../functions/notebook-service'
import { neonAdminBoardSchema } from '../shared/neon'

// Only point this at a disposable database; the test applies application migrations.
const databaseUrl = process.env.TEST_STUDENT_NAMES_DATABASE_URL
const integration = databaseUrl ? test : test.skip

integration('student names survive migration, structured saves and legacy writes', async () => {
  const pool = new Pool({ connectionString: databaseUrl })
  const admin = crypto.randomUUID()
  const teacher = crypto.randomUUID()
  const student = crypto.randomUUID()
  let migrated = false
  let addedBanColumn = false
  const exportPath = `.local/student-names-${student}.json`
  const bannedPath = `.local/student-names-banned-${student}.json`
  try {
    for (const file of [
      'railway/001-auth.sql',
      'neon/001-notebook.sql',
      'neon/002-application-roles.sql',
    ])
      await pool.query((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
    migrated = true
    await pool.query('INSERT INTO neon_auth."user" (id, name, email) VALUES ($1, $2, $3)', [
      admin,
      'Synthetic admin',
      `${admin}@example.test`,
    ])
    await pool.query(
      "INSERT INTO teachers (id, auth_user_id, name, access_mode) VALUES ($1, $2, 'Synthetic admin', 'read_write'), ($3, $4, 'Synthetic teacher', 'read_write')",
      [admin, admin, teacher, teacher],
    )
    await pool.query(
      "INSERT INTO app_accounts (auth_user_id, role, teacher_id) VALUES ($1::text, 'administrator', $1::uuid), ($2::text, 'teacher', $2::uuid)",
      [admin, teacher],
    )
    await pool.query(
      "INSERT INTO students (id, teacher_id, name, group_name) VALUES ($1, $2, 'Legacy Full Name', 'Level A')",
      [student, teacher],
    )
    const migration = await readFile('neon/004-student-names.sql', 'utf8')
    await pool.query(migration)
    await pool.query(migration)
    const handler = createHandler(pool, async () => admin, ['https://app.example'])
    const call = (body?: unknown) =>
      handler(
        new Request(`https://app.example/api/admin${body ? '/students' : ''}`, {
          method: body ? 'POST' : 'GET',
          headers: {
            Authorization: 'Bearer synthetic',
            Origin: 'https://app.example',
            'content-type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
      )
    const before = neonAdminBoardSchema.parse(await (await call()).json())
    expect(before.students.find((item) => item.studentId === student)).toMatchObject({
      name: 'Legacy Full Name',
      firstName: 'Legacy Full Name',
      lastName: '',
    })
    const fields = { studentId: student, teacherId: teacher, group: 'Level A', active: true }
    expect((await call({ ...fields, firstName: '  ', lastName: '' })).status).toBe(400)
    expect(
      (await call({ ...fields, firstName: 'First', lastName: '', name: 'Other' })).status,
    ).toBe(400)
    expect((await call({ ...fields, firstName: 'x'.repeat(200), lastName: 'y' })).status).toBe(400)
    expect(
      (await call({ ...fields, firstName: '  First Middle ', lastName: ' Last  ' })).status,
    ).toBe(200)
    expect(
      (
        await pool.query('SELECT name, first_name, last_name FROM students WHERE id = $1', [
          student,
        ])
      ).rows[0],
    ).toEqual({ name: 'First Middle Last', first_name: 'First Middle', last_name: 'Last' })
    await mkdir('.local', { recursive: true })
    const exportBackup = async (path: string) => {
      const child = Bun.spawn([process.execPath, 'scripts/railway-transfer.ts', 'export', path], {
        env: { ...process.env, DATABASE_URL_UNPOOLED: databaseUrl },
        stdout: 'ignore',
        stderr: 'ignore',
      })
      return child.exited
    }
    expect(await exportBackup(exportPath)).toBe(0)
    const backup = z
      .object({
        version: z.union([z.literal(2), z.literal(3)]),
        tables: z.array(
          z.object({
            name: z.string(),
            rows: z.array(z.record(z.string(), z.unknown())),
          }),
        ),
      })
      .parse(JSON.parse(await readFile(exportPath, 'utf8')))
    expect(
      backup.tables
        .find((table) => table.name === 'public.students')
        ?.rows.find((row) => row.id === student),
    ).toMatchObject({ first_name: 'First Middle', last_name: 'Last' })
    const columns = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema = 'neon_auth' AND table_name = 'user' AND column_name = 'banned'",
    )
    if (!columns.rows.length) {
      await pool.query('ALTER TABLE neon_auth."user" ADD COLUMN banned boolean DEFAULT false')
      addedBanColumn = true
    }
    await pool.query('UPDATE neon_auth."user" SET banned = true WHERE id = $1', [admin])
    expect(await exportBackup(bannedPath)).toBe(1)
    await pool.query('UPDATE neon_auth."user" SET banned = false WHERE id = $1', [admin])
    expect((await call({ ...fields, group: 'Level B', name: 'First Middle Last' })).status).toBe(
      200,
    )
    expect(
      (await pool.query('SELECT first_name, last_name FROM students WHERE id = $1', [student]))
        .rows[0],
    ).toEqual({ first_name: 'First Middle', last_name: 'Last' })
    expect((await call({ ...fields, name: 'Replacement Legacy Name' })).status).toBe(200)
    const after = neonAdminBoardSchema.parse(await (await call()).json())
    expect(after.students.find((item) => item.studentId === student)).toMatchObject({
      name: 'Replacement Legacy Name',
      firstName: 'Replacement Legacy Name',
      lastName: '',
    })
    expect(
      (await pool.query('SELECT first_name, last_name FROM students WHERE id = $1', [student]))
        .rows[0],
    ).toEqual({ first_name: null, last_name: null })
  } finally {
    await Promise.all(
      [exportPath, bannedPath].map(async (path) => {
        try {
          await unlink(path)
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
        }
      }),
    )
    if (migrated) {
      await pool.query('DELETE FROM app_accounts WHERE auth_user_id = ANY($1::text[])', [
        [admin, teacher],
      ])
      await pool.query('DELETE FROM students WHERE id = $1', [student])
      await pool.query('DELETE FROM teachers WHERE id = ANY($1::uuid[])', [[admin, teacher]])
      await pool.query('DELETE FROM neon_auth."user" WHERE id = $1', [admin])
      if (addedBanColumn) await pool.query('ALTER TABLE neon_auth."user" DROP COLUMN banned')
    }
    await pool.end()
  }
})
