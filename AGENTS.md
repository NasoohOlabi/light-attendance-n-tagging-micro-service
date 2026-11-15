# light-attendance-n-tagging-micro-service

Implementation and public publication were authorized on 2026-11-13. Preserve historical prototype `2d8fbe5`. Railway replacement of Neon was requested on 2026-11-15: read `docs/railway-setup.md` for current deployment, data transfer and access management; preserve `backup/neon-current-2026-11-15` at `77cedae`; `docs/implementation-plan.md` tracks delivery. Local and synthetic tests never prove live provider behavior.

Independent attendance and tagged-note app. React/TypeScript + Vite frontend, Bun server with self-hosted Better Auth and Railway Postgres. Auth tables retain the `neon_auth` schema name for compatibility. Four application tables serve the concrete three-role requirement: `app_accounts` maps Auth identities to Administrator, Teacher or Student, alongside `teachers`, `students` and `events`. Add no further tables without a concrete requirement. Students receive only their own projected attendance, never notes or raw events. Role approval is server-owned; signup grants no application access. Database credentials and signing secrets stay in the Bun server and private local environment. Read `docs/architecture.md` before changing event semantics or retries.

Current teacher use case: `docs/assigned-roster.md`. Eligibility is a nonblank teacher assignment, ignoring the unmaintained old/former source flag. The server checks authenticated teacher identity, active assignment, access mode and expiry on the server. Signup alone grants no notebook access. Keep real roster data and credentials outside Git.

For role approval, roster import or access withdrawal, follow the private-input CLI in `docs/railway-setup.md`.

Use PowerShell and Bun. No worktrees without asking. Keep responses concise. This file is the canonical instruction source for every agent; host-specific instruction files only point here.

## Agent routing

The orchestrator scopes tasks, reviews diffs, runs gates and owns final commits/publication. Delegate every new feature implementation to a `gpt-6.1-terra` sub-agent with bounded acceptance criteria and explicit file ownership. If Terra is unavailable, report it; do not silently substitute. Workers implement and verify their unit without spawning further workers or committing shared state; the orchestrator stages and commits serially. Independent workers use disjoint files in this checkout. Small integration fixes and repository tooling can be completed by the orchestrator. Read only the relevant feature map and source; avoid rereading all docs or launching duplicate reviews.

## Validation and safety

- Run `bun run verify` before completing any repository change. For UI changes use `.agents/skills/verify-halaqa/SKILL.md` and the affected feature map. Run `bun run verify:release` before stable promotion/publication. Fix failed checks; document provider checks that cannot run locally.
- Append events only. Teacher transport permits GET and POST. Corrections reference existing event IDs. Projection uses database sequence order, never device clocks.
- Parse external data with Zod. Use named payload variants and derive types from schemas. Single quotes, no semicolons; React functions and hooks; Tailwind for the teacher UI.
- Keep view filters in `src/queryState.ts`. Railway uses same-origin HttpOnly Better Auth sessions; server session checks establish identity; never put tokens or database URLs in query parameters, source, assets or logs. Only public Auth/API endpoints may be bundled.
- Follow `CONTRIBUTING.md` for atomic commits, hooks, PRs and release rules. Inspect starting status/diff; preserve unrelated changes. Stage explicit paths/hunks, inspect staged diff and run `git diff --cached --check`. Append Asia/Damascus date/time, request/reason, changes, verification and limits to `docs/work-log.md`. Commit before handback unless instructed otherwise; incomplete work gets a WIP commit. Report hashes, remaining paths/ownership and push status. Rewrite/amend/push only with authorization; never bypass hooks to hide failures.
- Read `SECURITY.md` before touching credentials or publishing. Database URLs and signing secrets stay local/server-side. Neither production data nor real credentials belong in history, test fixtures, screenshots or reports. Disable traces for live Auth verification.
- Deploy only verified `main` to stable Railway with Wait for CI enabled. `nightly` produces candidate artifacts; legacy Pages publishing is retired. Retain Neon data/services for recovery; its old application grants are paused after cutover. Follow `docs/railway-setup.md` before any rollback. See `docs/releases.md`; the original Firebase workflow does not apply.

The first commit is an authorized snapshot of the original working copy, including changes of unknown provenance. It is preserved for reference; current behavior is described in this fork's docs.
