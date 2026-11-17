# Security

The Bun server serves Better Auth and the notebook API on the same origin. Database credentials and signing secrets remain server-side. Signup grants no application access: every private request checks the session and server-owned role, active state and expiry. Teachers are scoped to active assigned students and their access mode; Students receive only their own projected attendance, never notes or raw events. Administrators manage accounts and roster assignments. See [roles](docs/roles.md) and [Railway setup](docs/railway-setup.md).

Administrators cannot change their own application access, disable themselves or reset their own password from account management. Personal profile settings let approved users change their own display name and photo through the current Auth session; these updates cannot change roles, assignments or another identity. Photos use bounded PNG, JPEG or WebP data URLs with server-side size and signature checks; the browser resizes uploads before saving. Signup cannot inject a photo. No new storage tables or public upload URLs are used.

Administrators can reset another credential account's password using matching 8 to 128 character fields; the server hashes it and deletes that user's sessions. Users contact an Administrator for reset; email delivery is not required. Private CLI bootstrap and recovery remain available.

Events are append-only through the API. Pending batches can contain private student information in browser storage; reconcile uncertain delivery before clearing storage. Revocation cannot retract data already downloaded; an idle view clears on the next denied request. Keep real accounts, records, credentials and private snapshots out of Git, logs, screenshots and recorded traces. Live checks use synthetic fixtures with tracing disabled and clean up afterward.

[Railway setup](docs/railway-setup.md) covers deployment and recovery. Preserve the Neon source services and data and backup branch `backup/neon-current-2026-11-15` (`77cedae`). Local and synthetic tests do not prove live provider behavior.

The frontend CSP permits three exact SHA-256 style hashes for dnd kit 0.5.3's feedback, grabbing cursor and selection rules. Arbitrary inline styles remain blocked. When upgrading dnd kit, regenerate hashes from its exact emitted style text and verify the actual dragged pill position under the production CSP; ordering alone does not prove the preview works. The synthetic table browser scenario asserts that visual geometry.
