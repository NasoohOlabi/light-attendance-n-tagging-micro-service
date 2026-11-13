# Security policy

This public repository contains application code and synthetic examples only. Do not file real tokens, personal student data or access links in public issues. Report a vulnerability privately through GitHub's **Security → Report a vulnerability** when enabled. For accidental disclosure, revoke the provider credential first, then contact the maintainer privately and retain a sanitized incident record.

## Account independence

The deployed teacher app has no embedded account, roster, API ID, bearer or management key. Its initial private magic link carries `version`, `username`, `apiId`, `token` and `sheet` in a URL fragment. The browser removes that fragment immediately and keeps access in session storage; the bearer travels only in the SheetDB Authorization header. A link is a reusable secret, not a login with enforced expiry. Anyone receiving it can copy its capabilities. Only the matching endpoint bearer belongs there; account management/Google credentials never do.

The owner runs `bun run manager` on `http://127.0.0.1:4174/`, supplies the frontend URL and each provider endpoint/bearer in input fields, then generates private links. Optional SheetDB App ID/Global key are process-local account tools. They are not required for manual credential import or normal teacher use and never enter `dist`. `.local/manager.json` holds plaintext teacher capabilities: protect it with OS permissions/device encryption and keep backups outside Git. No production credential is needed for code development, demo or synthetic HTTP tests.

## Trust boundary

Five trusted teachers share the intended notebook data. Client usernames, dates and IDs are assertions; there is no provider-enforced actor identity or per-row ownership. Dedicated SheetDB endpoints must enforce authenticated Read/Create access; browser code cannot establish those permissions. Use a dedicated workbook without unrelated tabs. Validate provider CORS, authentication, denied mutation/import routes, cross-endpoint freshness and revocation on disposable data before real use. Hard expiry, automatic bearer provisioning and rotation are not promised. The local manager's manual 404/410 observation is not proof that writes are revoked; verify deletion in the provider. Pending revocations block new link issuance across restarts.

App writes are RAW, append-only GET/POST; corrections preserve originals. Web Locks serialize browser pending writes; unsupported browsers fail closed. Pending event data persists in local storage until reconciled, even after session close. Clear it only after resolving delivery, and treat it as private student data. No third-party scripts, remote fonts or telemetry are loaded. The production CSP restricts scripts/styles to this site and outbound connections to SheetDB; the dev server removes that policy for Vite's local development scripts. GitHub Pages does not provide our app with custom response headers, so a meta CSP cannot enforce `frame-ancestors`.

## Repository protection

- Ignore `.local`, `.env*`, credentials, raw CSVs, private keys, local evidence and generated output. Ignore rules alone do not protect staged files.
- Hooks reject private paths and use Gitleaks default detection plus private-link/Global-URL rules. Full-history scans precede publication. Automated detection reduces risk; it cannot guarantee absence of every possible secret.
- CI uses frozen dependencies, auditing, commit-pinned actions, least-privilege workflow tokens, browser proofs and teacher-only artifact checks. No `pull_request_target` execution of untrusted contributions; test evidence is synthetic and must stay that way.
- GitHub secret scanning/push protection, private reports, dependency alerts and protected stable/nightly branches are enabled where the account supports them. Stable Pages is restricted to `main`; nightly workflows have no deployment permissions.

On a leaked capability: delete/revoke its provider endpoint, verify denial of reads **and appends** with isolated test data, replace credentials, and reconcile pending batches. Revocation cannot retract copied data. Do not silently rewrite history; obtain authorization for history cleanup and preserve an external incident record.
