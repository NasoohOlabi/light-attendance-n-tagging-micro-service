# Railway setup and migration

Railway replaces Neon hosting, managed Auth and Postgres. A Bun server serves React, Better Auth at `/api/auth`, and the notebook API on one HTTPS origin. The four application tables retain all role/assignment restrictions. Better Auth uses separate tables in the retained `neon_auth` schema; the name preserves queries without contacting Neon. Source filenames containing `neon` remain for compatibility.

## Deployment

Use existing project `perfect-insight`, environment `production`, and the repository service. Authenticate with `railway login`; no token is needed after browser consent. Keep credentials in private files/service variables.

`Dockerfile` builds the frontend and installs frozen production dependencies. Its allowlisted context excludes private inputs, manager and Git history. Configure Docker builds, health path `/health`, and port 3000 on the Railway service. Health verifies database tables. Set server-only `DATABASE_URL` to the private Railway Postgres connection, `BETTER_AUTH_SECRET` to a random value of at least 32 characters, `BETTER_AUTH_URL` to the public HTTPS origin, and `PORT=3000`. No browser endpoint variables are needed. Deploy verified `main` only. Legacy Pages publishing is retired.

Apply `railway/001-auth.sql`, then ordered `neon/*.sql` application migrations to the new database. These are repeatable; preserve the Neon source data and record any access pause separately. Run `bun run verify:release` before stable promotion. The service's main deployment trigger has **Wait for CI** enabled.

For local authenticated use, set private server variables against a disposable database and run `bun run build`, then `bun run start`. Open port 3000 directly so Auth and notebook share the configured origin. Plain Vite preview supports the public shell/sample; authenticated operation needs Bun.

## Transfer and recovery

The pushed code backup is `backup/neon-current-2026-11-15` at `77cedae`. The data snapshot is separate: it contains personal roster and password hashes. Keep it in ignored `.local`, restrict its Windows ACL and retain a protected external copy. Git ignore does not encrypt a file.

The private transfer CLI uses source `DATABASE_URL_UNPOOLED` for export and destination `MIGRATION_TARGET_DATABASE_URL` for import/compare:

```powershell
bun scripts/railway-transfer.ts export .local/neon-backup.json
bun scripts/railway-transfer.ts import .local/neon-backup.json
bun scripts/railway-transfer.ts compare .local/neon-backup.json
```

Export takes a consistent read-only snapshot, refusing unsupported credentials and banned identities. Import requires an empty migrated destination, commits atomically after comparing every transferred row, and preserves event sequence and its next value. Hash comparisons include original credential hashes. UUIDs, application grants and roster assignments are retained. Sessions, signing keys, OAuth/SMTP configuration and organization tables are excluded; users sign in again at the new origin. Password reset remains unavailable until mail delivery is implemented and verified, and the UI says so.

Take a final snapshot after stopping old-host writes and compare the destination before cutover. At the 2026-11-15 cutover, the source snapshot still exactly matched the copied data. The one active source application grant was then set inactive, preventing old Pages/installed clients from writing to a separate database. The original grant is retained privately in `.local/neon-cutover-original-grants.json` and the original backup; Railway retains its active Administrator grant. The source data and Neon services remain for recovery. Once Railway accepts writes, returning to Neon requires reconciling new events before restoring those original grants; a hosting rollback alone cannot transfer database writes. Never overwrite a nonempty destination.

## Observed publication

PR #31 passed required Verify, CodeQL and security checks, then merged to main `e9408cd`. Railway Docker deployment `08b82682-730b-4d8c-b6be-738c49042e96` built successfully and passed `/health`. The [public site](https://light-attendance-n-tagging-micro-service-production.up.railway.app/) served the actual main implementation. Real synthetic signup, secure HttpOnly cookies, unapproved denial, forged-identity and foreign-origin rejection, teacher assignment scope, phone sign-in, attendance/note appends, Postgres readback, reload, Arabic layout and signout passed. All synthetic rows were cleaned; target rows/hashes again matched the original private snapshot. Browser traffic stayed on the Railway origin. Sanitized JSON and a synthetic phone screenshot remain ignored under `.artifacts/verification/railway-live*`.

The first live browser attempt hit a known Bun/Windows launch stall; Node completed the browser run. A subsequent test incorrectly reloaded when matching the note still in its input, before the network save finished. Waiting for the actual successful POST and database count resolved that verification error; no application change was needed. This proves the new account path and migrated hash compatibility, not an interactive sign-in with the owner's existing password. SMTP/reset delivery and physical-device installation remain unverified/unavailable as described above.

## Administration and verification

The existing private-input `scripts/neon-admin.ts` works against Railway when `DATABASE_URL_UNPOOLED` explicitly points there; its historical name does not select a provider. Existing `account grant`, `account disable`, `teacher grant`, and `students upsert` examples remain in [the original runbook](neon-setup.md#bootstrap-an-administrator-and-approve-roles). Signup grants no role. Seven inactive provisional teacher placeholders need identity reconciliation before approval.

The temporary public Postgres TCP proxy and migration SSH key were removed after cutover; production uses private Railway networking. For local owner administration, establish temporary Railway database access, retrieve its CA through an authenticated provider channel, and explicitly target that connection. Remove temporary access afterward. Generated migration connection files and the disposable test database were also removed; retained private data snapshots and the original-grant manifest remain protected locally.

`TEST_RAILWAY_DATABASE_URL` enables the real-session integration test against a migrated disposable database. It creates synthetic identities/application fixtures and cleans them up. The desktop/mobile suite uses synthetic HTTP boundaries and does not prove provider behavior. Live proof must cover actual-origin login/reload/signout, database persistence and denied access. Disable traces and keep real account/roster information out of screenshots and reports.
