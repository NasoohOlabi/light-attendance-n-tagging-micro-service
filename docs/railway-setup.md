# Railway setup and migration

Railway replaces Neon hosting, managed Auth and Postgres. A Bun server serves React, Better Auth at `/api/auth`, and the notebook API on one HTTPS origin. The six application tables retain all role/assignment restrictions and store courses and student enrollments. See [courses](courses.md) for enrollment fields and attendance scope. Better Auth uses separate tables in the retained `neon_auth` schema; the name preserves queries without contacting Neon. Source filenames containing `neon` remain for compatibility.

## Deployment

Use the `wartaqi` project, the `production` environment, and the service linked to `NasoohOlabi/wartaqi`. The [production origin](https://wartaqi.up.railway.app/) also serves Auth and MCP OAuth. Authenticate with `railway login`; no token is needed after browser consent. Keep credentials in private files/service variables.

During the v0.1.0 development release, all changes deploy from `main`. There is no nightly Railway environment or service; nightly builds and deployments remain disabled until the owner explicitly requests them. Keep the existing production application and Postgres service only.

`Dockerfile` builds the frontend and installs frozen production dependencies. Its allowlisted context excludes private inputs and Git history. Configure Docker builds, health path `/health`, and port 3000 on the Railway service. Health verifies database tables. Set server-only `DATABASE_URL` to the private Railway Postgres connection, `BETTER_AUTH_SECRET` to a random value of at least 32 characters, `BETTER_AUTH_URL` to the public HTTPS origin, and `PORT=3000`. No browser endpoint variables are needed. Deploy verified `main` only. Legacy Pages publishing is retired.

Apply the ordered `railway/*.sql` authentication migrations, then ordered `neon/*.sql` application migrations to the new database. These are repeatable; preserve the Neon source data and record any access pause separately. Run `bun run verify:release` before stable promotion. The service's main deployment trigger has **Wait for CI** enabled.

Apply `railway/002-mcp-oauth.sql` before deploying the [MCP endpoint](mcp.md). Run the file with `psql` using `ON_ERROR_STOP=1` and a single transaction through the private Railway database network. The migration creates only Better Auth provider tables in `neon_auth`. `/health` checks that those tables exist. The same `BETTER_AUTH_URL` determines the public OAuth issuer and MCP resource. Moving to a different database or origin requires clients to reconnect.

The separate-name student editor requires `neon/004-student-names.sql` before deploying its API/UI. The migration adds nullable `first_name` and `last_name` columns without guessing how existing full names should split. Version 3 backups retain name parts, courses, enrollment levels/scores and attendance enrollment references in dependency order. Version 1 (original schema) and version 2 (name parts only) remain supported; legacy comparisons refuse to hide courses in the target. Partial schemas fail closed. Keep the protected original recovery snapshots unchanged.

The searchable course-membership workflow additionally requires `neon/005-active-enrollments.sql` before deployment. It adds `course_enrollments.active` with an existing-row default of true; the health check requires this column. Membership switches preserve the enrollment ID, attendance and scores. Version 4 backups preserve active/inactive membership; versions 1–3 still import into a compatible empty target. Legacy comparisons refuse to hide inactive target enrollments, and partial membership schemas fail closed.

For local authenticated use, set private server variables against a disposable database and run `bun run build`, then `bun run server/index.ts`. Open port 3000 directly so Auth and notebook share the configured origin. Plain Vite preview supports the public shell/sample; authenticated operation needs Bun.

## Transfer and recovery

Course closure requires `neon/006-closed-courses.sql` before deployment. Existing courses default open; version 5 backups preserve status. Older backups import courses as open and comparison refuses to hide closed target courses.

The pushed code backup is `backup/neon-current-2026-11-15` at `77cedae`. The data snapshot is separate: it contains personal roster and password hashes. Keep it in ignored `.local`, restrict its Windows ACL and retain a protected external copy. Git ignore does not encrypt a file.

The private transfer CLI uses source `DATABASE_URL_UNPOOLED` for export and destination `MIGRATION_TARGET_DATABASE_URL` for import/compare:

```powershell
bun scripts/railway-transfer.ts export .local/neon-backup.json
bun scripts/railway-transfer.ts import .local/neon-backup.json
bun scripts/railway-transfer.ts compare .local/neon-backup.json
```

Event sequences are exported as decimal strings to retain PostgreSQL bigint precision. The importer accepts older numeric sequences in the JavaScript safe-integer range and rejects ambiguous values. It locks the destination tables before checking that they are empty.

Export takes a consistent read-only snapshot, refusing unsupported credentials and banned identities. Import requires an empty migrated destination, commits atomically after comparing every transferred row, and resumes numbering after the largest restored event sequence. Hash comparisons include original credential hashes. UUIDs, application grants and roster assignments are retained. Sessions, signing keys, OAuth/SMTP configuration and organization tables are excluded; users sign in again at the new origin. Administrators can reset another credential user's password in Settings without SMTP; reset invalidates that user's sessions.

Take a final snapshot after stopping old-host writes and compare the destination before cutover. At the 2026-11-15 cutover, the source snapshot still exactly matched the copied data. The one active source application grant was then set inactive, preventing old Pages/installed clients from writing to a separate database. The original grant is retained privately in `.local/neon-cutover-original-grants.json` and the original backup; Railway retains its active Administrator grant. The source data and Neon services remain for recovery. Once Railway accepts writes, returning to Neon requires reconciling new events before restoring those original grants; a hosting rollback alone cannot transfer database writes. Never overwrite a nonempty destination.

## Observed publication

PR #31 passed required Verify, CodeQL and security checks, then merged to main `e9408cd`. Railway Docker deployment `08b82682-730b-4d8c-b6be-738c49042e96` built successfully and passed `/health`. The original public hostname served that deployment. Real synthetic signup, secure HttpOnly cookies, unapproved denial, forged-identity and foreign-origin rejection, teacher assignment scope, phone sign-in, attendance/note appends, Postgres readback, reload, Arabic layout and signout passed. All synthetic rows were cleaned; target rows/hashes again matched the original private snapshot. Browser traffic stayed on the Railway origin. Sanitized JSON and a synthetic phone screenshot remain ignored under `.artifacts/verification/railway-live*`.

The first live browser attempt hit a known Bun/Windows launch stall; Node completed the browser run. A subsequent test incorrectly reloaded when matching the note still in its input, before the network save finished. Waiting for the actual successful POST and database count resolved that verification error; no application change was needed. This proves the new account path and migrated hash compatibility, not an interactive sign-in with the owner's existing password. Native installation on a physical device remains unverified.

## Administration and verification

The existing private-input `scripts/neon-admin.ts` works against Railway when `DATABASE_URL_UNPOOLED` explicitly points there; its historical name does not select a provider. Use the private-input examples below. Signup grants no role. Seven inactive provisional teacher placeholders need identity reconciliation before approval.

The temporary public Postgres TCP proxy and migration SSH key were removed after cutover; production uses private Railway networking. For local owner administration, establish temporary Railway database access, retrieve its CA through an authenticated provider channel, and explicitly target that connection. Remove temporary access afterward. Generated migration connection files and the disposable test database were also removed; retained private data snapshots and the original-grant manifest remain protected locally.

`TEST_RAILWAY_DATABASE_URL` enables the real-session integration test against a migrated disposable database. It creates synthetic identities/application fixtures and cleans them up. The desktop/mobile suite uses synthetic HTTP boundaries and does not prove provider behavior. Live proof must cover actual-origin login/reload/signout, database persistence and denied access. Disable traces and keep real account/roster information out of screenshots and reports.

## Private CLI inputs

Apply `neon/013-invitations.sql` before deploying account invitations. Its columns are additive and existing accounts continue to sign in with email. Version 12 backups include invitation request IDs, usernames, phone numbers, dates of birth and setup status. Earlier backups can restore to an empty migrated database. Legacy comparisons reject invitation data that the older format cannot represent. Protect these backups as private personal and credential data.

Set `DATABASE_URL_UNPOOLED` to the intended Railway database. Create the first identity through signup, then grant its role using an ignored private JSON file. Synthetic example:

```json
{ "role": "administrator", "email": "owner@example.com", "name": "Administrator" }
```

```powershell
bun run db:migrate
bun run neon:admin account grant .local/administrator.json
bun run neon:admin account disable <auth-user-id>
bun run neon:admin teacher grant .local/teacher.json
bun run neon:admin students upsert .local/students.json
bun run neon:admin teacher disable <teacher-uuid>
```

A Teacher input contains `id`, an existing signup `email` or `authUserId`, `name`, `mode` (`read_write`, `read_only`, or `write_only`), and optional ISO `expiresAt`. A Student grant uses `role: "student"`, an identity, an existing `studentId`, and optional `expiresAt`. A roster input is an array of objects with `id`, `teacherId`, `name`, `group`, and `active`. Preserve stable IDs and keep real identities and records in private files. The browser Settings screen manages other accounts and roster assignments; it cannot change, disable or reset the acting Administrator.

Apply `neon/007-student-profiles-handbooks.sql` before deploying this version. Version 6 backups preserve optional student profile fields and each enrollment handbook flag. Older backups restore blank profiles and false handbook flags; comparisons reject targets containing values older backups cannot represent. Private roster imports accept optional `whatsapp`, `location` and numeric `birthYear`; omitted fields are preserved. Null clears any profile field, and blank text clears WhatsApp or location. Test on a disposable database first.

Migration 008 adds per-course grading thresholds (attendance 70%, practical 80, theory 80 by default). Version 7 transfers preserve them; older backups restore defaults and cannot compare against non-default target thresholds.

Apply `neon/009-unassigned-students.sql` before deploying unassigned-student support. It permits `students.teacher_id` to be null while retaining its foreign key. The full administrator register retains historical students without assignments; Teacher access still requires an active assigned student. Private roster inputs accept `teacherId: null`. Version 8 backups preserve unassigned students, require a compatible target and retain versions 1–7 for legacy recovery; legacy comparisons reject a target containing unassigned students. Profile edits can retain an existing provisional or inactive assignment, while a new assignment requires an approved active Teacher.

Apply `neon/010-enrollment-notes.sql` before deploying enrollment notes. Version 9 transfers preserve notes; older backups restore empty notes and comparison rejects targets with nonempty notes.

Apply `neon/011-grade-decisions.sql` before deploying grade overrides. Version 10 backups retain the decision history; legacy backups cannot compare with a target containing decisions. Verify migration and backup/restore on a disposable database first.

Apply `neon/012-enrollment-teacher.sql` before deploying course teacher assignments. Version 11 backups preserve the nullable enrollment teacher. Earlier backups restore without course teacher assignments and comparison rejects targets containing them.

After migration 012, a validated private historical enrollment plan can populate course teacher assignments without changing the roster or other enrollment fields. The command requires each existing enrollment and roster assignment to match the plan and rejects a conflicting course teacher. It updates only blank assignments; reruns are idempotent. Set `DATABASE_URL_UNPOOLED` privately, run a dry run first, then apply the same validated plan. The dry run rolls back its transaction. Keep the plan, workbook and credentials outside Git; the importer does not create enrollments or infer teachers for blank workbook cells.

For the historical workbook, prepare a new private plan by checking its student and teacher cells against the original import plan and its private pre-import roster snapshot. This requires Python with `openpyxl` installed. The output path must not already exist. The adapter rejects unmatched or duplicate students and ambiguous or unmatched teachers; blank teacher cells are skipped.

```powershell
python scripts/prepare-enrollment-teachers.py <workbook.xlsx> <historical-plan.json> <before-import.json> <validated-plan.json>
bun scripts/import-enrollment-teachers.ts dry-run <validated-plan.json>
bun scripts/import-enrollment-teachers.ts apply <validated-plan.json>
```
