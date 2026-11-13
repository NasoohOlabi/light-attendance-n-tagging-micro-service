# light-attendance-n-tagging-micro-service

Implementation and public publication were authorized on 2026-11-13. Preserve historical prototype `2d8fbe5`. Current direction and task status: `docs/implementation-plan.md`; acceptance: `docs/specification.md`. Provider feasibility constraints in `docs/feasibility.md` and `docs/sheetdb-research.md` still apply. Local and synthetic tests never prove live provider behavior.

Independent attendance and tagged-note app for five trusted teachers. Static React/TypeScript + Vite frontend; direct SheetDB access. Local Bun access manager is never deployed. See `docs/setup.md` for account setup, deployment, permissions and rotation; `docs/architecture.md` before changing access links, event semantics or retries.

For agent-driven local profile import, link generation or requested revocation, read `.agents/skills/manage-halaqa-access/SKILL.md`. It uses the existing loopback API and keeps capabilities in private files rather than tool output.

Use PowerShell and Bun. No worktrees without asking. Keep responses concise. This file is the canonical instruction source for every agent; host-specific instruction files only point here.

## Agent routing

The orchestrator scopes tasks, reviews diffs, runs gates and owns final commits/publication. Delegate every new feature implementation to a `gpt-6.1-terra` sub-agent with bounded acceptance criteria and explicit file ownership. If Terra is unavailable, report it; do not silently substitute. Workers implement and verify their unit without spawning further workers or committing shared state; the orchestrator stages and commits serially. Independent workers use disjoint files in this checkout. Small integration fixes and repository tooling can be completed by the orchestrator. Read only the relevant feature map and source; avoid rereading all docs or launching duplicate reviews.

## Validation and safety

- Run `bun run verify` before completing any repository change. For UI changes use `.agents/skills/verify-halaqa/SKILL.md` and the affected feature map. Run `bun run verify:release` before stable promotion/publication. Fix failed checks; document provider checks that cannot run locally.
- Append events only. Teacher transport permits GET and POST. Corrections reference existing event IDs. Projection uses sheet row order, never device clocks.
- Parse external data with Zod. Use named payload variants and derive types from schemas. Single quotes, no semicolons; React functions and hooks; Tailwind for the teacher UI.
- Keep view filters in `src/queryState.ts`. Access credentials belong in the URL fragment and session storage, never query parameters, source, assets or logs.
- `.local/manager.json` contains teacher tokens. Global management credentials stay in server memory. Never commit either or bundle manager code into `dist`.
- Follow `CONTRIBUTING.md` for atomic commits, hooks, PRs and release rules. Inspect starting status/diff; preserve unrelated changes. Stage explicit paths/hunks, inspect staged diff and run `git diff --cached --check`. Append Asia/Damascus date/time, request/reason, changes, verification and limits to `docs/work-log.md`. Commit before handback unless instructed otherwise; incomplete work gets a WIP commit. Report hashes, remaining paths/ownership and push status. Rewrite/amend/push only with authorization; never bypass hooks to hide failures.
- Read `SECURITY.md` before touching credentials or publishing. Teacher capabilities come only from private magic links; management keys stay local. Neither production data nor real links belong in history, test fixtures, screenshots or reports.
- Deploy only `main` through `.github/workflows/pages.yml` to stable GitHub Pages. `nightly` produces candidate artifacts and never deploys Pages. See `docs/releases.md`; the original Firebase workflow does not apply.

The first commit is an authorized snapshot of the original working copy, including changes of unknown provenance. It is preserved for reference; current behavior is described in this fork's docs.
