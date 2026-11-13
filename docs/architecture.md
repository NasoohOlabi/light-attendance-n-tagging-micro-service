# Architecture and decisions

**Current backend:** [Neon setup and schema](neon-setup.md). React uses managed Auth sessions and a JWT-authenticated Function with server-scoped Postgres queries. Database sequence replaces sheet order; events remain immutable through teacher APIs and retries use unique IDs. The existing projection/UI and canonical assigned-roster behavior are reused. Provider-specific SheetDB/link sections below document legacy compatibility, not the current authorization boundary.

**Application roles:** `app_accounts` is the single server-owned mapping from a verified Auth subject to Administrator, Teacher or Student. Database constraints require an exclusive staff/student identity link; managed Auth still owns passwords and sessions. Existing approved teachers are backfilled without replacing later role grants. Teachers retain assignment/mode/expiry checks. Administrators manage accounts and canonical roster assignments and can read/write the all-student notebook. Student requests bypass the notebook snapshot: the Function projects that student's ordered events internally and serializes only their identity and effective attendance dates/statuses. Notes, raw history, actors and correction reasons never cross the student boundary. The student React surface never mounts `useLedger`. Role/active-state changes take effect on the next server request, including requests using an already issued JWT. Browser management cannot change the acting Administrator's own role/access; private CLI bootstrap remains available. See [roles](roles.md) for the permission matrix and operation details.

This describes the version-one implementation. Development/publication was authorized on 2026-11-13; historical prototype `2d8fbe5` remains preserved. [Feasibility](feasibility.md), [specification](specification.md) and [implementation plan](implementation-plan.md) identify the remaining provider questions and prototype gaps, and take precedence where assumptions differ.

## Current assigned-teacher flow

See [assigned-roster.md](assigned-roster.md) for the current contract. A version-two link contains a teacher UUID, the Read/Create Events capability and a separate Read-only Roster capability. The source inventory is never mutated; its assigned students are copied into a normalized roster with stable student/teacher IDs. The current published roster is authoritative, not ledger student snapshots. Reads combine roster and ledger; the app filters records before projection, blocks student/general-note writes in assigned mode, revalidates assignment before a pending retry and remounts on replacement fragments.

Teacher working views do not expose other assignments; raw shared provider credentials remain broader by explicit agreement. These application checks are not signed identity or row authorization. Shared endpoints cannot support independent provider revocation, so the manager refuses a single-profile revoke that affects others. The details below also describe retained version-one/demo behavior; editable roster/general notes apply only to that compatibility path.

## Legacy scope and inheritance

The user's revised scope is attendance and tag-based notes for five trusted users, shared stats and roster reads, static GitHub hosting, no hosted login/backend, and a local access manager. The source working tree was preserved in commit `f6fee1d` with permission, including pre-existing changes whose authorship was not established. The new app retains the React/TypeScript/Vite/Bun stack, Tailwind styling, Arabic-capable inputs and query-state convention. Google/Firebase auth, Google Sheets clients, old data schemas and page-specific screens are replaced.

## Data flow

The teacher browser consumes the link fragment, stores the credential for the tab, reads the Events sheet, parses validated events and projects the roster, notes and attendance. Writes append JSON rows directly to SheetDB with a bearer header. The local manager saves teacher access profiles and uses the documented SheetDB Global API for optional endpoint lifecycle operations. It is not in the teacher data path.

One endpoint per teacher is the intended capability boundary. All endpoints share the same ledger, so usernames need not determine partitioning. Username stamping is a convenience enforced by this client, not authenticated by SheetDB. Read/Create restriction must be configured at SheetDB; omitting edit buttons would not enforce it.

## Event schema

`shared/ledger.ts` is authoritative. Sheet columns:

| Column      | Meaning                                        |
| ----------- | ---------------------------------------------- |
| id          | UUID of this event, stable across retries      |
| actor       | Username from the access link                  |
| client_time | Device ISO datetime for context                |
| received_at | Provider DATETIME sentinel requested on append |
| payload     | Validated JSON discriminated by kind           |

Payload kinds: `student` (studentId, name, group, active), `attendance` (studentId, date, status), `note` (studentId or empty for general, date, tags, text), `reversal` (targetId, reason). Student snapshots permit future name/group changes without destructive writes. A feature can put structured data inside a tagged note now; if it becomes a formal feature, add a validated payload kind and define its projection and correction semantics.

Projection scans rows in returned sheet order. First occurrence of an event ID wins; duplicates count once and conflicting actor/client time/payload values are flagged. New payloads include `version: 1`; unversioned legacy payloads remain readable and future versions are counted invalid. Reversals only affect an existing preceding non-reversal event. Duplicate reversals are harmless. Forward references and reversal-of-reversal are counted as invalid. The latest surviving student snapshot and latest surviving attendance per student/date determine current state. Notes remain separate events. Undoing a later snapshot reveals the preceding one. Corrections and original rows stay available in audit history.

Malformed/unknown rows are skipped and counted visibly. Client timestamps are never ordering inputs. Never sort the physical Events sheet. Concurrent edits use append order; this is intentional last-append-wins behavior, not transactional conflict detection.

## Delivery and cache behavior

`src/useLedger.ts` persists pending events before sending. New submissions remain blocked until an uncertain batch is resolved. Browser Web Locks serialize save/discard operations for the same pending key across tabs, including read, append and cleanup. Unsupported browsers and corrupt/unavailable storage fail closed with persistent guidance. Pending data for another link blocks new saves until reconciled. Reads before retry eliminate already visible IDs, and projection deduplicates if a request races or the provider returns stale data. The system offers idempotent _projection_, not exactly-once physical writes. SheetDB does not document an idempotency key here.

Transport checks headers before POST, sends `mode=RAW`, checks created row count, times out and never automatically retries a POST. It does not surface provider response bodies containing credentials. App reads request `ignore_cache=1`; verify this against account behavior during live setup. Reads happen on entry, explicit refresh and save/retry, not continuous polling. On confirmation the local view merges submitted events; the next read supplies provider timestamps. General form drafts are memory-only. Pending batches are local to endpoint/tab/username; rotating endpoint IDs requires reconciliation of old pending storage.

The whole ledger is read into memory. This is appropriate for the stated small team initially, but request quotas and eventual ledger size should be monitored. Pagination, archival into a new ledger and roster migration are not silently added; those need explicit ordering/migration designs.

## Local manager

`manager/server.ts` serves a loopback-only HTML/JS interface. Its whitelist of server-side endpoints accepts only known JSON schemas and hard-codes SheetDB hosts. Host and Origin checks, Sec-Fetch-Site handling and a custom header guard browser-originated mutations. A single in-process writer serializes operations against one local state file; writes use a temp file plus rename. Account keys stay in process memory. Teacher tokens are plaintext in ignored `.local/manager.json`. These are access controls for a trusted local computer, not a multiuser hosted admin service.

The manager verifies authenticated reads, required headers and anonymous denial before saving a profile; it cannot prove that independently imported endpoints target the same workbook. Revocation intent is persisted before remote calls and blocks links across restart; retired endpoint metadata is retained. Manual 404/410 is advisory rather than proof of append denial. Permission confirmation is explicitly manual because proving Delete/Update denial by actually trying them would risk changing data. Endpoint deletion is supported by the provider's management API; bearer rotation is a documented dashboard handoff. Tokens and manager source are excluded from the static artifact.

## Visual design

Retain the source app's indigo family and practical form language: indigo `#4338ca`, slate text `#182235`, secondary text `#59677c`, canvas `#f8fafc`, white `#ffffff`, amber for unresolved operations. Segoe UI/Tahoma support the Windows context and Arabic without third-party font requests. A compact notebook header leads to task tabs; attendance is a name/status list, notes pair composition with the shared feed, and manager setup precedes user access actions. Keep identity visible, errors actionable, and responsive forms usable on phones. No external tracking or remote assets are loaded.

## Verification boundaries

`bun run verify` checks link parsing, ledger correction/ordering/idempotency, transport restrictions, raw writes, schema failure and manager permission defaults, then lint and strict type checks/build. Tests mock only external SheetDB HTTP calls; they do not claim live provider verification. Browser sample flows exercise rendered controls. Live account configuration, independent endpoint allowance, CORS, token rotation, provider DATETIME expansion and GitHub publication must be checked with the owner's credentials.

Primary sources consulted 2026-11-13: [auth](https://docs.sheetdb.io/authentication), [permissions](https://docs.sheetdb.io/permissions), [create rows](https://docs.sheetdb.io/sheetdb-api/create), [read](https://docs.sheetdb.io/sheetdb-api/read), [RAW mode](https://docs.sheetdb.io/value-render-input-option), [create endpoint](https://docs.sheetdb.io/global-api/create-new-api), [delete endpoint](https://docs.sheetdb.io/global-api/delete-api). No undocumented refresh API is assumed.
