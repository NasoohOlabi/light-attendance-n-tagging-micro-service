# light-attendance-n-tagging-micro-service

Implementation and public publication were authorized on 2026-11-13. Preserve historical prototype `2d8fbe5`. Neon migration was subsequently requested: read `docs/neon-setup.md` for current setup, access management and provider verification; `docs/implementation-plan.md` tracks delivery. The SheetDB feasibility documents apply only to legacy integration. Local and synthetic tests never prove live provider behavior.

Independent attendance and tagged-note app. Static React/TypeScript + Vite frontend, Neon managed Auth and a Neon Function querying Postgres. Keep the database to the three application tables unless a concrete requirement needs more. Database credentials stay in the Function and private local environment. Legacy SheetDB links and the local Bun access manager remain for compatibility; the manager is never deployed. Read `docs/architecture.md` before changing event semantics or retries.

Current teacher use case: `docs/assigned-roster.md`. Eligibility is a nonblank teacher assignment, ignoring the unmaintained old/former source flag. Neon checks authenticated teacher identity, active assignment, access mode and expiry on the server. Signup alone grants no notebook access. Broader raw capabilities are an accepted limitation only of legacy SheetDB links. Keep real roster data and credentials outside Git.

For Neon teacher approval, roster import or access withdrawal, follow the private-input CLI in `docs/neon-setup.md`. For legacy SheetDB profile import, link generation or endpoint revocation, read `.agents/skills/manage-halaqa-access/SKILL.md`.

Use PowerShell and Bun. No worktrees without asking. Keep responses concise. This file is the canonical instruction source for every agent; host-specific instruction files only point here.

## Agent routing

The orchestrator scopes tasks, reviews diffs, runs gates and owns final commits/publication. Delegate every new feature implementation to a `gpt-6.1-terra` sub-agent with bounded acceptance criteria and explicit file ownership. If Terra is unavailable, report it; do not silently substitute. Workers implement and verify their unit without spawning further workers or committing shared state; the orchestrator stages and commits serially. Independent workers use disjoint files in this checkout. Small integration fixes and repository tooling can be completed by the orchestrator. Read only the relevant feature map and source; avoid rereading all docs or launching duplicate reviews.

## Validation and safety

- Run `bun run verify` before completing any repository change. For UI changes use `.agents/skills/verify-halaqa/SKILL.md` and the affected feature map. Run `bun run verify:release` before stable promotion/publication. Fix failed checks; document provider checks that cannot run locally.
- Append events only. Teacher transport permits GET and POST. Corrections reference existing event IDs. Projection uses database sequence order (sheet row order in legacy mode), never device clocks.
- Parse external data with Zod. Use named payload variants and derive types from schemas. Single quotes, no semicolons; React functions and hooks; Tailwind for the teacher UI.
- Keep view filters in `src/queryState.ts`. Neon uses managed sessions and short-lived JWTs; never put tokens or database URLs in query parameters, source, assets or logs. Only public Auth/API endpoints may be bundled. Legacy magic-link capabilities belong in the fragment and session storage.
- `.local/manager.json` contains teacher tokens. Global management credentials stay in server memory. Never commit either or bundle manager code into `dist`.
- Follow `CONTRIBUTING.md` for atomic commits, hooks, PRs and release rules. Inspect starting status/diff; preserve unrelated changes. Stage explicit paths/hunks, inspect staged diff and run `git diff --cached --check`. Append Asia/Damascus date/time, request/reason, changes, verification and limits to `docs/work-log.md`. Commit before handback unless instructed otherwise; incomplete work gets a WIP commit. Report hashes, remaining paths/ownership and push status. Rewrite/amend/push only with authorization; never bypass hooks to hide failures.
- Read `SECURITY.md` before touching credentials or publishing. Neon management keys and database URLs stay local/server-side. Neither production data nor real credentials belong in history, test fixtures, screenshots or reports. Disable traces for live Auth verification.
- Deploy only `main` through `.github/workflows/pages.yml` to stable GitHub Pages. `nightly` produces candidate artifacts and never deploys Pages. See `docs/releases.md`; the original Firebase workflow does not apply.

The first commit is an authorized snapshot of the original working copy, including changes of unknown provenance. It is preserved for reference; current behavior is described in this fork's docs.
