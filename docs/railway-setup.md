# Railway setup and migration

Railway replaces Neon hosting, managed Auth and Postgres. A Bun server serves React, Better Auth at `/api/auth`, and the notebook API on one HTTPS origin. The four application tables retain all role/assignment restrictions. Better Auth uses separate tables in the retained `neon_auth` schema; the name preserves queries without contacting Neon. Source filenames containing `neon` remain for compatibility.

## Deployment

Use existing project `perfect-insight`, environment `production`, and the repository service. Authenticate with `railway login`; no token is needed after browser consent. Keep credentials in private files/service variables.

`Dockerfile` builds the frontend and installs frozen production dependencies. Its allowlisted context excludes private inputs, manager and Git history. Configure Docker builds, health path `/health`, and port 3000 on the Railway service. Health verifies database tables. Set server-only `DATABASE_URL` to the private Railway Postgres connection, `BETTER_AUTH_SECRET` to a random value of at least 32 characters, `BETTER_AUTH_URL` to the public HTTPS origin, and `PORT=3000`. No browser endpoint variables are needed. Deploy verified `main` only. Legacy Pages publishing is retired.

Apply `railway/001-auth.sql`, then ordered `neon/*.sql` application migrations to the new database. These are repeatable; keep the Neon source unchanged. Run `bun run verify:release` before stable promotion.

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

Take a final snapshot after stopping old-host writes and compare the destination before cutover. Keep Neon services for recovery. Once Railway accepts writes, returning to Neon requires reconciling new events first; a hosting rollback alone cannot transfer database writes. Never overwrite a nonempty destination.

## Administration and verification

The existing private-input `scripts/neon-admin.ts` works against Railway when `DATABASE_URL_UNPOOLED` explicitly points there; its historical name does not select a provider. Existing `account grant`, `account disable`, `teacher grant`, and `students upsert` examples remain in [the original runbook](neon-setup.md#bootstrap-an-administrator-and-approve-roles). Signup grants no role. Seven inactive provisional teacher placeholders need identity reconciliation before approval.

`TEST_RAILWAY_DATABASE_URL` enables the real-session integration test against a migrated disposable database. It creates synthetic identities/application fixtures and cleans them up. The desktop/mobile suite uses synthetic HTTP boundaries and does not prove provider behavior. Live proof must cover actual-origin login/reload/signout, database persistence and denied access. Disable traces and keep real account/roster information out of screenshots and reports.
