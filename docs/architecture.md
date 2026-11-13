# Architecture and decisions

## Scope and inheritance

The user's revised scope is attendance and tag-based notes for five trusted users, shared stats and roster reads, static GitHub hosting, no hosted login/backend, and a local access manager. The source working tree was preserved in commit `f6fee1d` with permission, including pre-existing changes whose authorship was not established. The new app retains the React/TypeScript/Vite/Bun stack, Tailwind styling, Arabic-capable inputs and query-state convention. Google/Firebase auth, Google Sheets clients, old data schemas and page-specific screens are replaced.

## Data flow

The teacher browser consumes the link fragment, stores the credential for the tab, reads the Events sheet, parses validated events and projects the roster, notes and attendance. Writes append JSON rows directly to SheetDB with a bearer header. The local manager saves teacher access profiles and uses the documented SheetDB Global API for optional endpoint lifecycle operations. It is not in the teacher data path.

One endpoint per teacher is the intended capability boundary. All endpoints share the same ledger, so usernames need not determine partitioning. Username stamping is a convenience enforced by this client, not authenticated by SheetDB. Read/Create restriction must be configured at SheetDB; omitting edit buttons would not enforce it.

## Event schema

`shared/ledger.ts` is authoritative. Sheet columns:

| Column | Meaning |
| --- | --- |
| id | UUID of this event, stable across retries |
| actor | Username from the access link |
| client_time | Device ISO datetime for context |
| received_at | Provider DATETIME sentinel requested on append |
| payload | Validated JSON discriminated by kind |

Payload kinds: `student` (studentId, name, group, active), `attendance` (studentId, date, status), `note` (studentId or empty for general, date, tags, text), `reversal` (targetId, reason). Student snapshots permit future name/group changes without destructive writes. A feature can put structured data inside a tagged note now; if it becomes a formal feature, add a validated payload kind and define its projection and correction semantics.

Projection scans rows in returned sheet order. First occurrence of an event ID wins; duplicates are ignored. Reversals only affect an existing preceding non-reversal event. Duplicate reversals are harmless. Forward references and reversal-of-reversal are counted as invalid. The latest surviving student snapshot and latest surviving attendance per student/date determine current state. Notes remain separate events. Undoing a later snapshot reveals the preceding one. Corrections and original rows stay available in audit history.

Malformed/unknown rows are skipped and counted visibly. Client timestamps are never ordering inputs. Never sort the physical Events sheet. Concurrent edits use append order; this is intentional last-append-wins behavior, not transactional conflict detection.

## Delivery and cache behavior

`src/useLedger.ts` persists pending events before sending. New submissions remain blocked until an uncertain batch is resolved. Reads before retry eliminate already visible IDs, and projection deduplicates if a request races or the provider returns stale data. The system offers idempotent *projection*, not exactly-once physical writes. SheetDB does not document an idempotency key here.

Transport checks headers before POST, sends `mode=RAW`, checks created row count, times out and never automatically retries a POST. It does not surface provider response bodies containing credentials. App reads request `ignore_cache=1`; verify this against account behavior during live setup. Reads happen on entry, explicit refresh and save/retry, not continuous polling. On confirmation the local view merges submitted events; the next read supplies provider timestamps. General form drafts are memory-only. Pending batches are local to endpoint/tab/username; rotating endpoint IDs requires reconciliation of old pending storage.

The whole ledger is read into memory. This is appropriate for the stated small team initially, but request quotas and eventual ledger size should be monitored. Pagination, archival into a new ledger and roster migration are not silently added; those need explicit ordering/migration designs.

## Local manager

`manager/server.ts` serves a loopback-only HTML/JS interface. Its whitelist of server-side endpoints accepts only known JSON schemas and hard-codes SheetDB hosts. Host and Origin checks, Sec-Fetch-Site handling and a custom header guard browser-originated mutations. A single in-process writer serializes operations against one local state file; writes use a temp file plus rename. Account keys stay in process memory. Teacher tokens are plaintext in ignored `.local/manager.json`. These are access controls for a trusted local computer, not a multiuser hosted admin service.

The manager verifies authenticated reads, exact required headers and anonymous denial before saving a profile. Permission confirmation is explicitly manual because proving Delete/Update denial by actually trying them would risk changing data. Endpoint deletion is supported by the provider's management API; bearer rotation is a documented dashboard handoff. Tokens and manager source are excluded from the static artifact.

## Visual design

Retain the source app's indigo family and practical form language: indigo `#4338ca`, slate text `#182235`, secondary text `#59677c`, canvas `#f8fafc`, white `#ffffff`, amber for unresolved operations. Segoe UI/Tahoma support the Windows context and Arabic without third-party font requests. A compact notebook header leads to task tabs; attendance is a name/status list, notes pair composition with the shared feed, and manager setup precedes user access actions. Keep identity visible, errors actionable, and responsive forms usable on phones. No external tracking or remote assets are loaded.

## Verification boundaries

`bun run verify` checks link parsing, ledger correction/ordering/idempotency, transport restrictions, raw writes, schema failure and manager permission defaults, then lint and strict type checks/build. Tests mock only external SheetDB HTTP calls; they do not claim live provider verification. Browser sample flows exercise rendered controls. Live account configuration, independent endpoint allowance, CORS, token rotation, provider DATETIME expansion and GitHub publication must be checked with the owner's credentials.

Primary sources consulted 2026-11-13: [auth](https://docs.sheetdb.io/authentication), [permissions](https://docs.sheetdb.io/permissions), [create rows](https://docs.sheetdb.io/sheetdb-api/create), [read](https://docs.sheetdb.io/sheetdb-api/read), [RAW mode](https://docs.sheetdb.io/value-render-input-option), [create endpoint](https://docs.sheetdb.io/global-api/create-new-api), [delete endpoint](https://docs.sheetdb.io/global-api/delete-api). No undocumented refresh API is assumed.
