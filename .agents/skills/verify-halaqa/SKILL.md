---
name: verify-halaqa
description: Verify the Halaqa notebook teacher web UI and local access manager after attendance, note, roster, correction, access or delivery changes; launch the production build, drive desktop/mobile Playwright paths and retain proof.
---

# Verify Halaqa

Neon is the current backend: read [Neon setup](../../../docs/neon-setup.md) for Auth, Function and database boundaries. `bun run verify:ui` first builds offline verification mode, then runs the synthetic desktop/mobile suite including `e2e/neon.spec.ts`; it does not send credentials to live Auth. Rebuild with `npm run build` before a configured production preview.

When explicitly verifying real Neon services, start that configured preview separately on port 4173 and run `bun run verify:neon:live`. This harness uses synthetic accounts/records only, disables tracing, tests signed authentication and actual database persistence/authorization, then removes its fixtures. Retain only sanitized `.artifacts/verification/neon-live.json` and its synthetic screenshot; private cleanup state stays in `.local`. Never run the live harness simultaneously with another live harness or the preview-owning Playwright suite.

Run from the repository root in PowerShell. Read root `AGENTS.md`, then only the affected entries in [features/README.md](features/README.md). The teacher UI is primary; the loopback manager is a second surface. Production SheetDB/account credentials are unnecessary and must not enter artifacts.

## Launch

Install once with `bun install --frozen-lockfile`, `bun run setup:security` and `bunx playwright install chromium`. Build with `bun run verify`. The harness `bun run verify:ui` launches `bun run preview -- --port 4173 --strictPort` at `http://127.0.0.1:4173/`, waits for HTTP readiness, creates isolated browser contexts and stops its server when done. It refuses to reuse a running server. Do not run a separate preview first.

Use `bun run manager` only for a deliberate local owner session; default `http://127.0.0.1:4174/` stores real profiles in ignored `.local`. Automated manager verification is `bun test ./tests/manager.test.ts`: it starts its own child on port 0, sets `MANAGER_DIRECTORY` to a unique temporary directory, checks real HTTP/CSRF/restart behavior and kills only that child. Never double-drive the owner's manager or use its directory for tests.

## Doctor

Run `bun run check:artifact` to read/check the built teacher artifact, its relative asset paths and security policies. Run `bunx playwright test --list` to confirm both desktop and mobile projects and mapped scenarios are discoverable. On startup trouble, inspect `Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue`: an existing listener means stop this attempt, identify its owner and choose a separate explicit port/config before driving; never kill an unrelated process. `bun run verify` is the clean rebuild if artifact checks fail. Browser console/page errors fail the harness, except the deliberately simulated failed SheetDB response.

## Drive

Run `bun run verify:ui --project=chromium --grep 'sample notebook'` for a quick one-feature proof, or `bun run verify:ui` for all desktop/mobile scenarios. `e2e/notebook.spec.ts` uses the real rendered controls: **Explore with sample students**, **Students**, **Student name**, **Add student**, **Attendance for ليلى**, **Save attendance (1)**, **Notes**, **Tags, separated by commas**, **Save note**, **Filter tag**, **History & corrections**, **Undo**, **Reason**, **Append correction**. Use the feature map for other entry points and resulting side effects.

Synthetic provider tests intercept only the existing external `https://sheetdb.io/**` boundary. They open an actual fragment access link with a generated test token, click real forms, inspect GET/POST + RAW bodies, retain submitted IDs, deliberately lose a response, retry and prove one logical record. Storage corruption/write denial and competing tabs must prevent additional POSTs. No internal React setter or test-only application endpoint is used.

## Evidence

Proof must include the action and resulting state, plus side effects. The suite asserts real student/attendance/note/correction changes, original history retention, zero external demo requests and actual captured synthetic append bodies/IDs. Unit projection tests alone are insufficient UI proof. Only provider HTTP is simulated; local browser, storage, manager and build are real. Live provider permissions/CORS/revocation remain the separate unrun A1–A7 matrix in `docs/implementation-plan.md`.

Retain `.artifacts/playwright-report/index.html`, `.artifacts/test-results/` traces and `.artifacts/verification/notebook.png`. The screenshot is from the synthetic Arabic note flow, not real student data. Traces preserve actions/assertions and synthetic traffic; never run these recording settings with production tokens. All artifacts are ignored by Git. CI uploads the synthetic HTML report for seven days. Run `Test-Path .artifacts/verification/notebook.png` after teardown and read the report result; screenshots alone do not prove a flow passed.

## Cleanup

Playwright tears down its own preview child and browser contexts on pass or failure. Manager tests kill their exact spawned PID and remove their unique scratch directory in `finally`. Re-run cleanup after failed attempts; if a runner is interrupted, stop only the process tree whose PID/session you started. Never kill by process name. Do not delete `.artifacts` or browser reports during cleanup: evidence survives. Default manager state is never touched by automated verification.

## Helpers

`bun run verify` runs the unit/HTTP tests, lint, strict checks, production build and `scripts/check-artifact.ts`. `bun run verify:ui` runs `playwright.config.ts` + `e2e/notebook.spec.ts`; no helper requires manual interpretation. `bun run verify:release` adds formatting, full-history secrets and dependency audit. Future feature work updates the map and harness; use `maintain-verification-skill` when auditing their accuracy.
