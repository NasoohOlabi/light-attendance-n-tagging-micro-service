# Security policy

This public repository contains application code and synthetic examples only. Do not file real tokens, personal student data or access links in public issues. Report a vulnerability privately through GitHub's **Security → Report a vulnerability** when enabled. For accidental disclosure, revoke the provider credential first, then contact the maintainer privately and retain a sanitized incident record.

## Neon authentication and data access

Neon is the current backend. The browser receives only public Auth/API URLs. Managed Auth handles sign-up, sign-in and sessions; the notebook Function verifies the signed JWT and checks the teacher's active state, expiry and access mode on every request. Signup alone does not authorize a teacher. All data queries use the current teacher/student assignment; teacher requests cannot edit the roster or mutate/delete existing events. Database URLs and Neon management keys must never use a `VITE_` prefix or enter the static bundle.

The application has three tables: `teachers`, `students`, `events`. Neon owns its separate `neon_auth` schema. The Function uses a server-only pooled connection; the private admin CLI uses an unpooled connection. Teacher disable/expiry is checked even for a still-valid JWT. Signing out ends the browser session; an already issued JWT may remain valid until its provider expiry. Revocation cannot retract data already downloaded.

Live verification creates only synthetic accounts/records, turns off browser traces, and removes its fixtures. Keep its private cleanup manifest and screenshots ignored. Email/password verification settings and production SMTP requirements are documented in [Neon setup](docs/neon-setup.md).

## Installed app and offline cache

The PWA worker caches only build-listed public frontend assets. Auth/API responses, authorization-bearing requests, query URLs, cross-origin traffic and writes bypass it. Installation does not grant teacher access or add background/offline saves. Existing pending batches remain governed by the ledger's storage/retry rules. The installed browser context may ask the teacher to sign in again; legacy links remain session-scoped. Updates wait for old clients to close, without forced reloads. See [PWA behavior and proof](docs/pwa.md).

The remaining capability/link sections describe legacy SheetDB integration only.

## Legacy account independence

The deployed teacher app has no embedded account, roster, API ID, bearer or management key. Its initial private magic link carries `version`, `username`, `apiId`, `token` and `sheet` in a URL fragment. The browser removes that fragment immediately and keeps access in session storage; the bearer travels only in the SheetDB Authorization header. A link is a reusable secret, not a login with enforced expiry. Anyone receiving it can copy its capabilities. Only the matching endpoint bearer belongs there; account management/Google credentials never do.

The owner runs `bun run manager` on `http://127.0.0.1:4174/`, supplies the frontend URL and each provider endpoint/bearer in input fields, then generates private links. Optional SheetDB App ID/Global key are process-local account tools. They are not required for manual credential import or normal teacher use and never enter `dist`. `.local/manager.json` holds plaintext teacher capabilities: protect it with OS permissions/device encryption and keep backups outside Git. No production credential is needed for code development, demo or synthetic HTTP tests.

## Current assigned-teacher boundary

For version-two links, the app shows only the current teacher's active assigned students and related records across every working view. Roster data is fetched with GET through a separate Read-only endpoint/workbook; events append through the Events capability. Incoming ledger student snapshots cannot mutate the canonical roster, pending retries check current assignment, and replacement links clear the old working session. Teacher/student data and source/copy IDs stay in private Drive/local files.

The owner explicitly accepts optimistic application restrictions: shared bearer capabilities can read broader records and submit direct requests. Do not describe these filters as server authorization or confidentiality between untrusted teachers. Student entry links carry the teacher capability and are not student accounts. Individual provider revocation is unavailable on shared endpoints; the manager refuses collateral revocation, and a sole Events revoke does not also revoke its Roster credential. See [assigned workflow](docs/assigned-roster.md). The shared editable behavior below is retained only for legacy/demo mode.

## Legacy trust boundary

Five trusted teachers share the intended notebook data. Client usernames, dates and IDs are assertions; there is no provider-enforced actor identity or per-row ownership. Dedicated SheetDB endpoints must enforce authenticated Read/Create access; browser code cannot establish those permissions. Use a dedicated workbook without unrelated tabs. Validate provider CORS, authentication, denied mutation/import routes, cross-endpoint freshness and revocation on disposable data before real use. Hard expiry, automatic bearer provisioning and rotation are not promised. The local manager's manual 404/410 observation is not proof that writes are revoked; verify deletion in the provider. Pending revocations block new link issuance across restarts.

App writes are RAW, append-only GET/POST; corrections preserve originals. Web Locks serialize browser pending writes; unsupported browsers fail closed. Pending event data persists in local storage until reconciled, even after session close. Clear it only after resolving delivery, and treat it as private student data. No third-party scripts, remote fonts or telemetry are loaded. The production CSP restricts scripts/styles to this site and outbound connections to SheetDB; the dev server removes that policy for Vite's local development scripts. GitHub Pages does not provide our app with custom response headers, so a meta CSP cannot enforce `frame-ancestors`.

## Repository protection

- Ignore `.local`, `.env*`, credentials, raw CSVs, private keys, local evidence and generated output. Ignore rules alone do not protect staged files.
- Hooks reject private paths and use Gitleaks default detection plus private-link/Global-URL rules. Full-history scans precede publication. Automated detection reduces risk; it cannot guarantee absence of every possible secret.
- CI uses frozen dependencies, auditing, commit-pinned actions, least-privilege workflow tokens, browser proofs and teacher-only artifact checks. No `pull_request_target` execution of untrusted contributions; test evidence is synthetic and must stay that way.
- GitHub secret scanning/push protection, private reports, dependency alerts and protected stable/nightly branches are enabled where the account supports them. Stable Pages is restricted to `main`; nightly workflows have no deployment permissions.

On a leaked capability: delete/revoke its provider endpoint, verify denial of reads **and appends** with isolated test data, replace credentials, and reconcile pending batches. Revocation cannot retract copied data. Do not silently rewrite history; obtain authorization for history cleanup and preserve an external incident record.
