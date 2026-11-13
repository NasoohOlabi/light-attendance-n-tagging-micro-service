# Neon setup and operation

Neon is the current backend. The static React app signs users in through managed Neon Auth and sends a short-lived JWT to the `notebook` Neon Function. That Function verifies the signature and checks the server-owned application role, approval and expiry; Teacher access also checks mode and current student assignment. Students receive only their own projected attendance. Administrators manage other accounts and roster assignments. Neither a database password nor a management key is sent to the browser. Legacy SheetDB links remain compatible, with their earlier limitations. See [role permissions](roles.md).

## Four application tables

| Table          | Purpose                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `teachers`     | Links an approved Neon Auth user to a teacher; stores display name, active flag, read/write mode and optional access expiry.                |
| `students`     | Canonical read-only teacher roster with one current teacher assignment per student.                                                         |
| `events`       | Append-only attendance, notes and corrections. UUID primary keys prevent duplicate delivery; database sequence determines projection order. |
| `app_accounts` | Unique Auth identity-to-role mapping with an exclusive staff/student link, active state and optional expiry.                                |

Neon maintains its own `neon_auth` schema. There is no ORM and no duplicate application password table. Schema is versioned in `neon/001-notebook.sql` and `neon/002-application-roles.sql`. Migrations run atomically and are repeatable; the role backfill preserves existing account grants. The fourth table is required to enforce exactly one application role per Auth user while keeping staff ledger references intact. Approved Administrators can manage accounts and roster through the Function; the private owner CLI remains the bootstrap/recovery path. The browser cannot call Postgres directly, and no Data API is provisioned.

Historical events follow the student's current assignment when that assignment changes. An old teacher loses access; a newly assigned teacher can see the student's earlier history. Actors and received timestamps are authoritative server values. An exact retry reuses the event ID; a conflicting reused ID is rejected. A batch commits atomically. Direct owner database edits remain privileged administrative actions.

## Provision through the CLI

Use PowerShell. Existing project linkage is private in ignored `.neon`; services and the Function are declared in `neon.ts`.

```powershell
npm i -g neon@latest
neon init -y --org-id <your-org-id> --project-id <your-project-id> --branch production --services 'postgres,auth'
neon config plan
neon deploy --env .env.local
bun run db:migrate
npm run build
bun run dev
```

Quote the comma-separated service list in PowerShell. If the stored grant expires, run `neon login` and finish its browser sign-in. Do not create a replacement project. The requested project is in a supported Functions region. `neon deploy` deploys the declared Function as well as reconciling Auth/Postgres; it does not publish the frontend to GitHub Pages.

`neon deploy` pulls managed variables into `.env.local` (or an existing `.env`). Application traffic uses pooled `DATABASE_URL`; migrations/admin use `DATABASE_URL_UNPOOLED`. Vite derives the public Auth URL from `NEON_AUTH_BASE_URL` and the public API URL from `NEON_BRANCH_ID` / `NEON_FUNCTION_HOST_SUFFIX`. Explicit `VITE_NEON_AUTH_URL` and `VITE_NEON_API_URL` can override these for frontend hosting. They are public endpoints, not secrets. Never prefix a database URL or management credential with `VITE_`.

The Function's allowed browser origins are declared in `neon.ts`. Auth has a separate redirect/origin allowlist. Configure both through CLI; Neon's localhost shortcut does not cover `127.0.0.1`:

```powershell
neon neon-auth domain add http://127.0.0.1:5173
neon neon-auth domain add http://127.0.0.1:4173
neon neon-auth domain add https://nasooholabi.github.io
```

The current project has email/password signup enabled, verification not required and no signup/signin email sending. These existing settings were inspected, not weakened by this migration. Production auth email delivery needs the provider's [SMTP/production checklist](https://neon.com/docs/auth/production-checklist); password-reset email delivery has not been tested. Google sign-in is not required for teacher use.

## Bootstrap an Administrator and approve roles

Create the first sign-in through managed Auth, then prepare an ignored private input file (synthetic example):

```json
{
  "role": "administrator",
  "email": "owner@example.com",
  "name": "Administrator"
}
```

```powershell
bun run db:migrate
bun run neon:admin account grant .local/administrator.json
bun run neon:admin account disable <auth-user-id>
```

Use `authUserId` instead of `email` when appropriate. Keep actual account emails and all passwords in private inputs, never source/SQL or public commands. This grants an application role, not Neon project/database ownership. A Student grant uses `role: "student"`, the sign-in identity and an existing `studentId`, with optional `expiresAt`. A Teacher grant uses `role: "teacher"`, `name`, optional `mode` and `expiresAt`. Administrator grants always receive read/write access without expiry. Student links are unique, and signup alone has no application access. The Administrator's **Administration** screen approves other accounts and edits canonical roster assignments. It cannot change or disable the acting Administrator's own account; the private CLI can recover access.

## Existing teacher CLI compatibility

Teachers create their accounts in the app. Signup grants no notebook access. The owner/agent prepares a JSON file under ignored `.local`, then runs the private CLI:

```powershell
bun run neon:admin teacher grant .local/teacher.json
bun run neon:admin students upsert .local/students.json
bun run neon:admin teacher disable <teacher-uuid>
```

Teacher file shape (synthetic example):

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "email": "teacher@example.com",
  "name": "Teacher",
  "mode": "read_write",
  "expiresAt": null
}
```

Use an existing signup email; the CLI resolves its Auth ID. Alternatively supply `authUserId` instead of `email`. Modes are `read_write`, `read_only`, `write_only`; an ISO UTC `expiresAt` enforces an access deadline. Disabled/expired teachers are denied even with a previously issued valid JWT. Write-only API access works, but the interactive notebook requires reads and explains that restriction. Re-granting an existing Auth user preserves its existing teacher ID.

Students file shape:

```json
[
  {
    "id": "22222222-2222-4222-8222-222222222222",
    "teacherId": "11111111-1111-4111-8111-111111111111",
    "name": "Student",
    "group": "Group",
    "active": true
  }
]
```

Preserve existing IDs when refreshing a roster. Import students with nonblank teacher assignments; ignore the unmaintained old/former source flag. Real roster data and teacher emails remain outside Git. The initial migration did not import real roster data or approve real teachers; subsequent private imports are recorded in the work log.

### Imported teachers awaiting sign-in identities

An owner-authorized roster import may preserve assignments before teachers sign up. These placeholders use the existing `teachers` table, source-stable IDs and provisional source display labels, with `active=false`, `access_mode=read_only` and a reserved `auth_user_id` of `pending-roster:<teacher-uuid>`. They have no managed Auth user or `app_accounts` grant and cannot sign in or access the notebook. This does not create an additional table or a teacher login.

Keep the source-to-ID mapping and import receipt under ignored `.local`. Once a teacher has a real signup, the owner must reconcile that identity privately, replace only the matching placeholder's reserved identity while preserving its teacher ID, then use the existing teacher/account grant CLI. A normal grant alone cannot claim a placeholder ID; do not create a duplicate teacher and strand the students. Until linked and approved, placeholders do not appear in the approved-teacher selector; student assignments remain owner-managed. Never grant access merely by matching a display name. The November 13 private import and its actual verification are recorded in the work log.

## Verification and publication

`npm run build` compiles the actual configured app. `bun run verify` adds unit/boundary checks, lint and the static artifact credential boundary. `bun run verify:ui` builds an offline verification artifact and exercises desktop/mobile samples, legacy access, and synthetic Neon Auth/API boundaries; it never uses live Auth credentials. A normal build restores the configured artifact afterward.

For explicit live verification, start the normal production preview on an allowed local origin (4173 or 5173), set `NEON_VERIFY_APP_URL` if using a non-default port, then run `bun run verify:neon:live`. It creates synthetic Auth accounts and scoped students, verifies real browser signup/signin/reload and saved Arabic notes, and tests Administrator approval/roster changes, Student attendance isolation and denied writes, teacher isolation, modes, expiry, immediate disable and concurrent retry behavior against the deployed API/database. It removes only its fixtures afterward. Tracing is disabled. Sanitized results and a synthetic screenshot remain under ignored `.artifacts/verification`; an interrupted cleanup is described by ignored `.local/neon-verification-cleanup.json`. Do not run multiple live verification scripts concurrently, or reuse/terminate another owner's preview.

Schema was tested twice on an isolated Neon branch before production. The initial SQL BOM error, local Auth origin rejection, SDK token-transport mismatch and invalid-password error handling were fixed and retested. Public status/compilation alone is not service proof; see the work log for actual results.

Frontend publication remains a separate main-only Pages promotion. Set public GitHub repository variables `VITE_NEON_AUTH_URL` / `VITE_NEON_API_URL` to the linked branch's public endpoints before that promotion; `gh variable set` can do this without a dashboard. Do not put database or Neon management credentials in Pages. The workflow rebuilds the configured frontend after offline browser checks. The migration task deploys the backend and verifies the frontend locally; it does not push or promote the public site.

Installed Neon skills and authenticated CLI support the complete provisioning/admin workflow. Project `.codex/config.toml` also registers the Neon MCP URL with OAuth; MCP has its own client consent and is not made authenticated merely by a successful CLI login. CLI operations were verified; no authenticated MCP invocation is claimed.
