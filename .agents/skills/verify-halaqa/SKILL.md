---
name: verify-halaqa
description: Verify the Halaqa notebook UI after attendance, note, roster, correction, access or delivery changes using desktop and mobile browser paths.
---

# Verify Halaqa

Read root `AGENTS.md` and the affected entries in [features/README.md](features/README.md). Run from the repository root in PowerShell. Use synthetic data for recorded evidence; never record real identities, records or credentials.

1. Install dependencies with `bun install --frozen-lockfile`, configure hooks with `bun run setup:security`, and install Chromium with `bunx playwright install chromium` when needed.
2. Run `bun run verify` and `bun run verify:ui`. The UI harness builds verification mode, launches its own preview on port 4173, and refuses to reuse an existing server. If that port is occupied, preserve the process and set `$env:PLAYWRIGHT_PORT='4273'` before running. On Windows, put the real Bun runtime directory first in PATH if its shim causes child-process issues.
3. Drive the affected user controls and assert resulting state and side effects described in the feature map. The historically named `e2e/neon.spec.ts` and `e2e/roles.spec.ts` intercept synthetic same-origin `/api/auth` and `/api` routes; they do not contact live Auth. Preserve synthetic `.artifacts/playwright-report/`, test results and relevant screenshots. Do not claim native installation from simulated prompt tests.
4. For real sessions, run the built app with `bun run server/index.ts` against a configured disposable database. `TEST_RAILWAY_DATABASE_URL` enables `tests/railway-integration.test.ts` against a migrated disposable database only. Live provider checks use synthetic accounts and records, disable tracing and clean up fixtures; see [Railway setup](../../../docs/railway-setup.md).
5. Confirm the report and artifact checks passed. Playwright tears down its preview and contexts; after interruption stop only processes started by this run and preserve evidence. Report failures and any unverified live or physical-device behavior.

`bun run verify:release` adds formatting, security/history, browser and dependency checks before stable promotion. Synthetic browser and database checks do not prove live provider behavior.
