# Railway setup and migration

Railway replaces Neon hosting, managed Auth and Postgres. A Bun server serves React, Better Auth at `/api/auth`, and the notebook API on one HTTPS origin. The six application tables retain all role/assignment restrictions and store courses and student enrollments. See [courses](courses.md) for enrollment fields and attendance scope. Better Auth uses separate tables in the retained `neon_auth` schema; the name preserves queries without contacting Neon. Source filenames containing `neon` remain for compatibility.

## Deployment

Use existing project `perfect-insight`, environment `production`, and the repository service. Authenticate with `railway login`; no token is needed after browser consent. Keep credentials in private files/service variables.

During the v0.1.0 development release, all changes deploy from `main`. There is no nightly Railway environment or service; nightly builds and deployments remain disabled until the owner explicitly requests them. Keep the existing production application and Postgres service only.

`Dockerfile` builds the frontend and installs frozen production dependencies. Its allowlisted context excludes private inputs and Git history. Configure Docker builds, health path `/health`, and port 3000 on the Railway service. Health verifies database tables. Set server-only `DATABASE_URL` to the private Railway Postgres connection, `BETTER_AUTH_SECRET` to a random value of at least 32 characters, `BETTER_AUTH_URL` to the public HTTPS origin, and `PORT=3000`. No browser endpoint variables are needed. Deploy verified `main` only. Legacy Pages publishing is retired.

Apply `railway/001-auth.sql`, then ordered `neon/*.sql` application migrations to the new database. These are repeatable; preserve the Neon source data and record any access pause separately. Run `bun run verify:release` before stable promotion. The service's main deployment trigger has **Wait for CI** enabled.

The separate-name student editor requires `neon/004-student-names.sql` before deploying its API/UI. The migration adds nullable `first_name` and `last_name` columns without guessing how existing full names should split. Current backups use version 3 to retain name parts, courses, enrollment levels/scores and attendance enrollment references in dependency order. Version 1 (original schema) and version 2 (name parts only) remain supported; legacy comparisons refuse to hide courses in the target. Partial schemas fail closed. Keep the protected original recovery snapshots unchanged.

For local authenticated use, set private server variables against a disposable database and run `bun run build`, then `bun run server/index.ts`. Open port 3000 directly so Auth and notebook share the configured origin. Plain Vite preview supports the public shell/sample; authenticated operation needs Bun.

## Transfer and recovery

The pushed code backup is `backup/neon-current-2026-11-15` at `77cedae`. The data snapshot is separate: it contains personal roster and password hashes. Keep it in ignored `.local`, restrict its Windows ACL and retain a protected external copy. Git ignore does not encrypt a file.

The private transfer CLI uses source `DATABASE_URL_UNPOOLED` for export and destination `MIGRATION_TARGET_DATABASE_URL` for import/compare:

```powershell
bun scripts/railway-transfer.ts export .local/neon-backup.json
bun scripts/railway-transfer.ts import .local/neon-backup.json
bun scripts/railway-transfer.ts compare .local/neon-backup.json
```

Export takes a consistent read-only snapshot, refusing unsupported credentials and banned identities. Import requires an empty migrated destination, commits atomically after comparing every transferred row, and preserves event sequence and its next value. Hash comparisons include original credential hashes. UUIDs, application grants and roster assignments are retained. Sessions, signing keys, OAuth/SMTP configuration and organization tables are excluded; users sign in again at the new origin. Administrators can reset another credential user's password in Settings without SMTP; reset invalidates that user's sessions.

Take a final snapshot after stopping old-host writes and compare the destination before cutover. At the 2026-11-15 cutover, the source snapshot still exactly matched the copied data. The one active source application grant was then set inactive, preventing old Pages/installed clients from writing to a separate database. The original grant is retained privately in `.local/neon-cutover-original-grants.json` and the original backup; Railway retains its active Administrator grant. The source data and Neon services remain for recovery. Once Railway accepts writes, returning to Neon requires reconciling new events before restoring those original grants; a hosting rollback alone cannot transfer database writes. Never overwrite a nonempty destination.

## Observed publication

PR #31 passed required Verify, CodeQL and security checks, then merged to main `e9408cd`. Railway Docker deployment `08b82682-730b-4d8c-b6be-738c49042e96` built successfully and passed `/health`. The [public site](https://light-attendance-n-tagging-micro-service-production.up.railway.app/) served the actual main implementation. Real synthetic signup, secure HttpOnly cookies, unapproved denial, forged-identity and foreign-origin rejection, teacher assignment scope, phone sign-in, attendance/note appends, Postgres readback, reload, Arabic layout and signout passed. All synthetic rows were cleaned; target rows/hashes again matched the original private snapshot. Browser traffic stayed on the Railway origin. Sanitized JSON and a synthetic phone screenshot remain ignored under `.artifacts/verification/railway-live*`.

The first live browser attempt hit a known Bun/Windows launch stall; Node completed the browser run. A subsequent test incorrectly reloaded when matching the note still in its input, before the network save finished. Waiting for the actual successful POST and database count resolved that verification error; no application change was needed. This proves the new account path and migrated hash compatibility, not an interactive sign-in with the owner's existing password. Native installation on a physical device remains unverified.

## Administration and verification

The existing private-input `scripts/neon-admin.ts` works against Railway when `DATABASE_URL_UNPOOLED` explicitly points there; its historical name does not select a provider. Use the private-input examples below. Signup grants no role. Seven inactive provisional teacher placeholders need identity reconciliation before approval.

The temporary public Postgres TCP proxy and migration SSH key were removed after cutover; production uses private Railway networking. For local owner administration, establish temporary Railway database access, retrieve its CA through an authenticated provider channel, and explicitly target that connection. Remove temporary access afterward. Generated migration connection files and the disposable test database were also removed; retained private data snapshots and the original-grant manifest remain protected locally.

`TEST_RAILWAY_DATABASE_URL` enables the real-session integration test against a migrated disposable database. It creates synthetic identities/application fixtures and cleans them up. The desktop/mobile suite uses synthetic HTTP boundaries and does not prove provider behavior. Live proof must cover actual-origin login/reload/signout, database persistence and denied access. Disable traces and keep real account/roster information out of screenshots and reports.

## Private CLI inputs

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
