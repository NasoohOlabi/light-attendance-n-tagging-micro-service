# Pages SheetDB

Current task is research and planning only. Preserve the stopped prototype; do not extend, deploy, provision accounts or resume implementation unless the user asks. Treat existing setup/architecture docs as prototype notes until reconciled with the feasibility research and final specifications.

Independent attendance and tagged-note app for five trusted teachers. Static React/TypeScript + Vite frontend; direct SheetDB access. Local Bun access manager is never deployed. See `docs/setup.md` for account setup, deployment, permissions and rotation; `docs/architecture.md` before changing access links, event semantics or retries.

Use PowerShell and Bun. No worktrees without asking. Keep responses concise.

- Run `bun run verify` before completing changes. It runs ledger/transport tests, lint and both frontend/manager type checks plus the production build.
- Append events only. Teacher transport permits GET and POST. Corrections reference existing event IDs. Projection uses sheet row order, never device clocks.
- Parse external data with Zod. Use named payload variants and derive types from schemas. Single quotes, no semicolons; React functions and hooks; Tailwind for the teacher UI.
- Keep view filters in `src/queryState.ts`. Access credentials belong in the URL fragment and session storage, never query parameters, source, assets or logs.
- `.local/manager.json` contains teacher tokens. Global management credentials stay in server memory. Never commit either or bundle manager code into `dist`.
- Inspect starting Git status/diff and preserve unrelated work. Stage explicit paths, inspect staged diff and run `git diff --cached --check`. Document dated work (Asia/Damascus), reason, verification and limitations in `docs/work-log.md`, then commit before handing back. Report hashes, status and push state.
- Deploy this fork through `.github/workflows/pages.yml` on GitHub Pages. The original application's Firebase instructions do not apply here.

The first commit is an authorized snapshot of the original working copy, including changes of unknown provenance. It is preserved for reference; current behavior is described in this fork's docs.
