import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { Pool } from 'pg'
import { z } from 'zod'

// The database user must be allowed to create disposable databases on a synthetic-only server.
const url = process.env.TEST_STUDENT_TRANSFER_DATABASE_URL
const integration = url ? test : test.skip

integration(
  'versioned backups round-trip students, courses, enrollments and events',
  async () => {
    if (!url) throw new Error('Disposable database required')
    const admin = new Pool({ connectionString: url })
    const names = Array.from(
      { length: 11 },
      () => `transfer_${crypto.randomUUID().replaceAll('-', '')}`,
    )
    const pools: Pool[] = []
    await mkdir(resolve('.local'), { recursive: true })
    const directory = await mkdtemp(resolve('.local/transfer-test-'))
    const localPath = relative(resolve('.local'), directory)
    if (
      isAbsolute(localPath) ||
      localPath.startsWith('..') ||
      !localPath.startsWith('transfer-test-')
    )
      throw new Error('Refusing cleanup outside the disposable transfer directory')
    const files = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((version) =>
      resolve(directory, `v${version}.json`),
    )
    const run = (command: string, file: string, dbUrl: string, succeeds = true) => {
      const result = Bun.spawnSync(
        [process.execPath, 'run', 'scripts/railway-transfer.ts', command, file],
        {
          env: {
            ...process.env,
            DATABASE_URL_UNPOOLED: dbUrl,
            MIGRATION_TARGET_DATABASE_URL: dbUrl,
          },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      )
      if (succeeds) expect(result.exitCode, result.stderr.toString()).toBe(0)
      else expect(result.exitCode).not.toBe(0)
    }
    const migrate = async (pool: Pool, file: string) =>
      pool.query((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
    try {
      for (const name of names) await admin.query(`CREATE DATABASE "${name}"`)
      const urls = names.map((name) => {
        const target = new URL(url)
        target.pathname = `/${name}`
        return target.toString()
      })
      for (const dbUrl of urls) pools.push(new Pool({ connectionString: dbUrl }))
      for (const pool of pools) {
        for (const file of [
          'railway/001-auth.sql',
          'neon/001-notebook.sql',
          'neon/002-application-roles.sql',
        ])
          await migrate(pool, file)
      }
      const [source, ...targets] = pools
      const teacher = crypto.randomUUID(),
        student = crypto.randomUUID()
      const courseA = crypto.randomUUID(),
        courseB = crypto.randomUUID()
      const enrollmentA = crypto.randomUUID(),
        enrollmentB = crypto.randomUUID()
      await source.query(
        "INSERT INTO teachers (id, auth_user_id, name, access_mode) VALUES ($1, 'synthetic', 'Synthetic teacher', 'read_write')",
        [teacher],
      )
      await source.query(
        "INSERT INTO students (id, teacher_id, name, group_name) VALUES ($1, $2, 'Legacy name', 'Level')",
        [student, teacher],
      )
      run('export', files[0], urls[0])
      await migrate(source, 'neon/004-student-names.sql')
      await source.query(
        "UPDATE students SET name = 'First Last', first_name = 'First', last_name = 'Last' WHERE id = $1",
        [student],
      )
      run('export', files[1], urls[0])
      await source.query('CREATE TABLE courses (id uuid PRIMARY KEY, name text NOT NULL)')
      run('export', resolve(directory, 'partial.json'), urls[0], false)
      await source.query('DROP TABLE courses')
      await migrate(source, 'neon/003-courses.sql')
      await source.query(
        "INSERT INTO courses (id, name) VALUES ($1, 'Course A'), ($2, 'Course B')",
        [courseA, courseB],
      )
      await source.query(
        "INSERT INTO course_enrollments (id, course_id, student_id, level, practical, theory) VALUES ($1, $2, $3, 'One', 87.5, 92), ($4, $5, $3, 'Two', 71, 81.5)",
        [enrollmentA, courseA, student, enrollmentB, courseB],
      )
      for (const enrollment of [enrollmentA, enrollmentB]) {
        const event = crypto.randomUUID()
        await source.query(
          "INSERT INTO events (id, teacher_id, student_id, enrollment_id, actor, client_time, payload) VALUES ($1, $2, $3, $4, 'Synthetic teacher', now(), $5)",
          [
            event,
            teacher,
            student,
            enrollment,
            JSON.stringify({
              kind: 'attendance',
              studentId: student,
              enrollmentId: enrollment,
              date: '2026-11-16',
              status: 'present',
            }),
          ],
        )
      }
      run('export', files[2], urls[0])
      await source.query('ALTER TABLE course_enrollments ADD COLUMN active text')
      run('export', resolve(directory, 'partial-active.json'), urls[0], false)
      await source.query('ALTER TABLE course_enrollments DROP COLUMN active')
      await migrate(source, 'neon/005-active-enrollments.sql')
      await source.query('UPDATE course_enrollments SET active = false WHERE id = $1', [
        enrollmentA,
      ])
      run('export', files[3], urls[0])
      run('compare', files[2], urls[0], false)
      await migrate(source, 'neon/006-closed-courses.sql')
      await migrate(source, 'neon/006-closed-courses.sql')
      expect(
        (await source.query('SELECT bool_and(open) AS all_open FROM courses')).rows[0].all_open,
      ).toBe(true)
      await source.query('UPDATE courses SET open = false WHERE id = $1', [courseA])
      run('export', files[4], urls[0])
      run('compare', files[3], urls[0], false)
      await migrate(source, 'neon/007-student-profiles-handbooks.sql')
      await migrate(source, 'neon/007-student-profiles-handbooks.sql')
      await source.query(
        "UPDATE students SET whatsapp = '+123', location = 'Area', birth_year = 2000",
      )
      await source.query('UPDATE course_enrollments SET handbook_received = true WHERE id = $1', [
        enrollmentA,
      ])
      run('export', files[5], urls[0])
      run('compare', files[4], urls[0], false)
      await migrate(source, 'neon/008-course-grading.sql')
      await migrate(source, 'neon/008-course-grading.sql')
      await source.query(
        'UPDATE courses SET attendance_minimum = 60, practical_minimum = 75.5, theory_minimum = 90 WHERE id = $1',
        [courseA],
      )
      run('export', files[6], urls[0])
      run('compare', files[5], urls[0], false)
      await migrate(source, 'neon/009-unassigned-students.sql')
      await migrate(source, 'neon/009-unassigned-students.sql')
      const unassigned = crypto.randomUUID()
      await source.query(
        "INSERT INTO students (id, teacher_id, name, group_name, active) VALUES ($1, NULL, 'Synthetic unassigned', 'Level', false)",
        [unassigned],
      )
      run('export', files[7], urls[0])
      run('compare', files[6], urls[0], false)
      await migrate(source, 'neon/010-enrollment-notes.sql')
      await migrate(source, 'neon/010-enrollment-notes.sql')
      await source.query("UPDATE course_enrollments SET notes = 'Synthetic note' WHERE id = $1", [
        enrollmentA,
      ])
      run('export', files[8], urls[0])
      run('compare', files[7], urls[0], false)
      await migrate(source, 'neon/011-grade-decisions.sql')
      await migrate(source, 'neon/011-grade-decisions.sql')
      const decision = [
        {
          requestId: crypto.randomUUID(),
          result: 'pass',
          note: 'Synthetic decision',
          actor: 'synthetic',
          at: new Date().toISOString(),
        },
      ]
      await source.query(
        'UPDATE course_enrollments SET grade_decisions = $2::jsonb WHERE id = $1',
        [enrollmentA, JSON.stringify(decision)],
      )
      run('export', files[9], urls[0])
      run('compare', files[8], urls[0], false)
      for (let index = 0; index < targets.length; index++) {
        await migrate(targets[index], 'neon/003-courses.sql')
        await migrate(targets[index], 'neon/004-student-names.sql')
        await migrate(targets[index], 'neon/005-active-enrollments.sql')
        await migrate(targets[index], 'neon/006-closed-courses.sql')
        await migrate(targets[index], 'neon/007-student-profiles-handbooks.sql')
        await migrate(targets[index], 'neon/008-course-grading.sql')
        if (index >= 7) {
          run('import', files[index], urls[index + 1], false)
          await migrate(targets[index], 'neon/009-unassigned-students.sql')
        }
        if (index >= 8) {
          run('import', files[index], urls[index + 1], false)
          await migrate(targets[index], 'neon/010-enrollment-notes.sql')
        }
        if (index === 9) {
          run('import', files[index], urls[index + 1], false)
          await migrate(targets[index], 'neon/011-grade-decisions.sql')
        }
        run('import', files[index], urls[index + 1])
        run('compare', files[index], urls[index + 1])
      }
      expect(
        await Promise.all(
          files.map(
            async (file) =>
              z.object({ version: z.number() }).parse(JSON.parse(await readFile(file, 'utf8')))
                .version,
          ),
        ),
      ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      expect(
        (
          await targets[9].query('SELECT grade_decisions FROM course_enrollments WHERE id = $1', [
            enrollmentA,
          ])
        ).rows[0].grade_decisions,
      ).toEqual(decision)
      expect(
        (
          await targets[8].query('SELECT notes FROM course_enrollments WHERE id = $1', [
            enrollmentA,
          ])
        ).rows[0].notes,
      ).toBe('Synthetic note')
      expect(
        (
          await targets[7].query('SELECT teacher_id, active FROM students WHERE id = $1', [
            unassigned,
          ])
        ).rows[0],
      ).toEqual({ teacher_id: null, active: false })
      expect(
        (await targets[5].query('SELECT whatsapp, location, birth_year FROM students')).rows[0],
      ).toEqual({ whatsapp: '+123', location: 'Area', birth_year: 2000 })
      expect(
        (
          await targets[5].query('SELECT handbook_received FROM course_enrollments WHERE id = $1', [
            enrollmentA,
          ])
        ).rows[0].handbook_received,
      ).toBe(true)
      expect(
        (
          await targets[6].query(
            'SELECT attendance_minimum, practical_minimum, theory_minimum FROM courses WHERE id = $1',
            [courseA],
          )
        ).rows[0],
      ).toEqual({ attendance_minimum: 60, practical_minimum: 75.5, theory_minimum: 90 })
      expect(
        (
          await targets[5].query(
            'SELECT attendance_minimum, practical_minimum, theory_minimum FROM courses WHERE id = $1',
            [courseA],
          )
        ).rows[0],
      ).toEqual({ attendance_minimum: 70, practical_minimum: 80, theory_minimum: 80 })
      const stored = await targets[2].query(
        'SELECT level, practical::text, theory::text FROM course_enrollments ORDER BY level',
      )
      expect(stored.rows).toEqual([
        { level: 'One', practical: '87.5', theory: '92' },
        { level: 'Two', practical: '71', theory: '81.5' },
      ])
      expect(
        (
          await targets[2].query(
            "SELECT count(*)::int AS count FROM events WHERE enrollment_id::text = payload->>'enrollmentId'",
          )
        ).rows[0].count,
      ).toBe(2)
      expect(
        (await targets[2].query('SELECT first_name, last_name FROM students')).rows[0],
      ).toEqual({ first_name: 'First', last_name: 'Last' })
      expect(
        (
          await targets[3].query('SELECT active FROM course_enrollments WHERE id = $1', [
            enrollmentA,
          ])
        ).rows[0].active,
      ).toBe(false)
      expect(
        (await targets[4].query('SELECT open FROM courses WHERE id = $1', [courseA])).rows[0].open,
      ).toBe(false)
      await targets[0].query("INSERT INTO courses (id, name) VALUES ($1, 'Extra course')", [
        crypto.randomUUID(),
      ])
      run('compare', files[0], urls[1], false)
    } finally {
      await Promise.all(pools.map((pool) => pool.end()))
      for (const name of names) await admin.query(`DROP DATABASE IF EXISTS "${name}"`)
      await admin.end()
      await rm(directory, { recursive: true, force: true })
    }
  },
  120000,
)
