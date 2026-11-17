# Security

The Bun server serves Better Auth and the notebook API on the same origin. Database credentials and signing secrets remain server-side. Signup grants no application access: every private request checks the session and server-owned role, active state and expiry. Teachers are scoped to active assigned students and their access mode; Students receive only their own projected attendance, never notes or raw events. Administrators manage accounts and roster assignments. See [roles](docs/roles.md) and [Railway setup](docs/railway-setup.md).

Administrators cannot change, disable or reset their own account from the browser. They can reset another credential account's password using matching 8 to 128 character fields; the server hashes it and deletes that user's sessions. Users contact an Administrator for reset; email delivery is not required. Private CLI bootstrap and recovery remain available.

Events are append-only through the API. Pending batches can contain private student information in browser storage; reconcile uncertain delivery before clearing storage. Revocation cannot retract data already downloaded; an idle view clears on the next denied request. Keep real accounts, records, credentials and private snapshots out of Git, logs, screenshots and recorded traces. Live checks use synthetic fixtures with tracing disabled and clean up afterward.

[Railway setup](docs/railway-setup.md) covers deployment and recovery. Preserve the Neon source services and data and backup branch `backup/neon-current-2026-11-15` (`77cedae`). Local and synthetic tests do not prove live provider behavior.

The frontend CSP permits three exact SHA-256 style hashes for dnd kit 0.5.3's feedback, grabbing cursor and selection rules. Arbitrary inline styles remain blocked. When upgrading dnd kit, regenerate hashes from its exact emitted style text and verify the actual dragged pill position under the production CSP; ordering alone does not prove the preview works. The synthetic table browser scenario asserts that visual geometry.

## Temporary picomatch mitigation

[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) affects repeated extglobs in picomatch through 4.0.7, with no published fixed version as of 2026-11-17. Pin all build-tool consumers to 4.0.7 and apply the tracked Bun patch: the parser rejects `+(...)` and `*(...)` before constructing a regular expression. These unbounded extglobs are deliberately unavailable; ordinary wildcards, braces and non-repeating extglobs remain supported. The app does not accept user-supplied glob patterns, and picomatch is not a production runtime dependency.

Run `bun run security:audit` for the release audit. It first exercises the actual picomatch loaded by Vite, lint-staged and tinyglobby, requiring the pinned version, rejecting the reported patterns through matcher/parser/regex APIs, and checking ordinary globs. A missing patch, stale nested copy or changed version fails this guard. Docker copies the patch before frozen installs.

Until **2026-12-01 00:00 UTC**, the subsequent audit policy permits only this exact advisory/package because the registry cannot identify locally patched code. It prints the full report and exception explicitly, rejects every other advisory or malformed/failed report, and requires an unfiltered `bun audit --prod` to pass. Moving picomatch into production therefore fails the gate. The exception fails on its expiry date; plain `bun audit` continues to report the upstream version finding honestly. CI and the release gate use this combined command.

Replace the override and patch with a verified upstream release when available, then remove the dedicated guard and advisory exception together. Do not remove the patch while retaining the exception.
