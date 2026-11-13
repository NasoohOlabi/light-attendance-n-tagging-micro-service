# Work log

## 2026-11-13 — Asia/Damascus (UTC+03:00)

**Request/reason:** Fork the current project into a completely separate repository for five trusted users, replacing Google sign-in with reusable username/SheetDB access links, append-only attendance and tagged notes, shared reads, GitHub Pages hosting and a local access manager. User explicitly authorized including the current working copy and destination `D:\Masjid\main-production-work\pages-sheetdb`.

**Starting state/provenance:** Original repository had modifications to `docs/data-cache.md`, `docs/url-state.md`, `scripts/student-activation.test.js`, `src/form/EntryForm.tsx`, `src/form/StudentAutocomplete.tsx`, `src/i18n/translations.ts`, `src/sheets/rosterClient.ts` and untracked `src/sheets/pageLogging.ts`. These are pre-existing user/workspace changes, not authored in this task. They were copied into initial snapshot commit `f6fee1d`; sensitive local files were excluded. No worktree, original-source edit, remote push or sheet mutation was performed.

**Changes:** Independent Git repository and T3 project registration; focused React attendance/notes/roster/summary/history app; fragment access links; direct GET/POST SheetDB client; typed event ledger and append-only correction projection; pending-batch recovery; local manager with saved teacher credentials, same-origin guards, endpoint lifecycle tooling and explicit manual bearer rotation; GitHub Pages workflow; setup and architecture docs.

**Verification:** `bun run verify` passed: 12 tests, 32 assertions, lint, strict frontend/manager type checks and Vite production build. An initial test mock typing failure (Bun fetch requires preconnect) was fixed before the passing run. Both local servers returned successful HTTP responses; manager state showed no configured credentials/users. Browser workflow verification was interrupted by the scope correction and is not claimed. T3's environment-port preview resolved to localhost while the manager accepts only 127.0.0.1; this remains a prototype integration issue to address in a future authorized implementation phase.

**Limitations:** No real SheetDB credentials or GitHub repository destination supplied. Live provider provisioning, multiple-endpoint plan eligibility, CORS, DATETIME expansion, token revocation and deployed Pages behavior remain unverified. Trusted usernames/timestamps are client-supplied; no server-side signed identity or exactly-once append guarantee is claimed. UI supports Arabic content but is not a full translated Arabic interface. No existing production data migration requested/performed.

**Scope correction:** User clarified that only feasibility, plans and specs were requested, then explicitly instructed that the base implementation must not be discarded. Coding stopped; both local servers and the preview tab were closed. Preserve this work as a clearly labeled WIP prototype. Remaining work is research and documentation only, especially actual SheetDB management keys, agent MCP access, revocability, expiry and paid-plan constraints. No implementation checks were failing at stop; browser and live-account verification are unfinished.

## 2026-11-13 — planning follow-up, Asia/Damascus (UTC+03:00)

**Request/reason:** Complete feasibility and implementation planning only; explore SheetDB management keys, agent access, revocation and expiring tokens while retaining the base implementation unchanged.

**Changes:** Added cited `sheetdb-research.md`, decision/gate assessment in `feasibility.md`, `agent-access.md`, requirements and acceptance criteria in `specification.md`, and staged future work/validation in `implementation-plan.md`. README now indexes the planning package. Updated prototype notes to distinguish documented endpoint deletion from unverified bearer rotation and to identify optional Global-key second-factor support absent from the prototype. No application code changed after WIP commit `2d8fbe5`.

**Evidence/provenance:** A delegated researcher wrote only the research document using official SheetDB docs, pricing and OpenAPI. Parent read that artifact, independently inspected the live OpenAPI operations, security schemes and creation schema, verified the dedicated limits/pricing/cache guidance, and reconciled proposed permissions to Read/Create (Search only if needed). Findings identify missing documented expiry/rotation/issuance APIs rather than asserting those capabilities are impossible. Rate-limit documentation has conflicting per-IP/per-API descriptions, recorded as an account validation question.

**Verification:** Documentation links, staged whitespace, and prototype immutability are checked before this documentation commit. The earlier successful 12-test/build/lint run applies only to the frozen prototype; no new live-provider or browser verification is claimed. Original repository was inspected read-only; later source changes/commits, if any, are external to this task.

**Limitations and next step:** No credential request, login, API connection installation, provider support message, live data mutation, account provisioning, billing action, deployment or push. Hard teacher-token expiry and completely automatic protected credential issuance remain unestablished. Future implementation requires a new user instruction and the provider validation gates described in the plan. Git remote remains unset.
