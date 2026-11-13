# Product and technical specification

Status: version-one acceptance target. Implementation/publication authorized 2026-11-13. Read [feasibility](feasibility.md) and the [task list](implementation-plan.md) for implemented software versus unrun live-account gates; not every target manager requirement is complete.

## Current assigned workflow

The 2026-11-13 real-use-case clarification supersedes the legacy shared working view below. See [assigned-roster.md](assigned-roster.md): use only students with a teacher assignment, ignore the unmaintained old/former flag, keep the canonical roster read-only, and scope attendance/notes/summary/history to the teacher in the normal app. Version-two links carry separate Roster and Events capabilities. Broader raw API access remains an explicitly accepted trust limit; a student entry link is navigation for its teacher.

## Legacy version-one users and constraints

- Five trusted teachers, each with an issued username and personal reusable access link.
- All five can read shared roster, attendance, notes and summaries; no private per-teacher records.
- Owner manages access from a local website and owns the SheetDB/Google spreadsheet connection.
- Static GitHub Pages frontend; no hosted application backend or teacher Google login.
- Attendance and tagged notes are primary. Structured note text is permitted for future features. Existing Quran-page, points and finals workflows are outside this fork's current scope.
- Writes append only. Corrections preserve the original records. Trusted users can technically alter their bearer link or bypass client validation; this is an accepted architectural limitation, not strong identity security.
- Hard credential expiry remains unresolved. Version one must not present advisory dates as enforced expiry.

## Teacher experience and acceptance criteria

| ID  | Requirement                               | Acceptance                                                                                                                                       |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| T1  | Consume a personal access link            | Username/endpoint/token/tab validate; malformed link gives recovery instructions; no Google popup                                                |
| T2  | Keep credentials out of normal sharing    | Access fragment consumed before ordinary UI; navigation URLs contain no bearer; no third-party scripts; session close forgets browser credential |
| T3  | Stamp the issuing username                | No teacher selector; every event receives the session username; UI identifies this as trusted attribution                                        |
| T4  | Read one shared notebook                  | All five endpoints render the same current roster and projections after refresh                                                                  |
| T5  | Mark attendance by date and student/group | Save only intended changes; unmarked is distinct from absent; same date/student has one effective status                                         |
| T6  | Record tagged notes                       | Student-specific or general; at least one tag; comma/Arabic-comma entry; preserve Arabic and structured text as data                             |
| T7  | Filter notes and summaries                | Shareable search/group/tag/date state; filters do not contain credentials; date bounds clearly defined                                           |
| T8  | Maintain roster                           | Stable student IDs; rename/group/active changes append snapshots and preserve history                                                            |
| T9  | Correct a mistake                         | A reason and reference to a prior event are appended; original remains in history; derived views recompute                                       |
| T10 | Survive uncertain delivery                | Persist pending IDs before sending, reconcile on retry, deduplicate projection, never create fresh IDs merely to retry                           |
| T11 | Show actionable access failures           | Distinguish revoked/unauthorized, quota/rate limit, connectivity and malformed data without leaking secrets                                      |
| T12 | Separate demo and real data               | Sample notebook makes no SheetDB requests and cannot be merged into a real notebook implicitly                                                   |

Attendance statuses proposed: present, early, late, absent, excused. Dates are calendar dates, not UTC-midnight timestamps; validate real ISO dates. Use local session date by default and store explicit dates for stable shared views. Missing attendance is not a negative vote. Corrections to attendance either append a replacement status, or reverse an earlier event; reversing the newest status reveals the last surviving prior status.

Roster editing is allowed to these trusted users in the proposed baseline. If the owner later wants administrative-only roster edits, a hidden button is insufficient enforcement with shared Read/Create ledger access; revisit capability partitioning before claiming that restriction.

## Proposed event contract

Use one ordered **Events** tab, with headers `id`, `actor`, `client_time`, `received_at`, `payload`. Keep the ledger physically unsorted. JSON payload is canonical. New payloads include `version: 1`; legacy unversioned payloads remain readable as version one. Unknown versions are isolated and counted; no automatic row migration.

| Field       | Contract                                                                            |
| ----------- | ----------------------------------------------------------------------------------- |
| id          | Generated UUID for a logical event; retries reuse it                                |
| actor       | Issued username asserted by client                                                  |
| client_time | Device ISO time for context, never ordering authority                               |
| received_at | Provider timestamp requested through supported sentinel; not guaranteed unforgeable |
| payload     | Validated discriminated object; strings are written with RAW mode                   |

Payload variants:

- `student`: studentId, name, group, active; latest surviving snapshot wins.
- `attendance`: studentId, date, status; latest surviving event for that student/date wins.
- `note`: studentId (empty for general), date, tags[], text; text may contain future feature-specific JSON but is not executed.
- `reversal`: targetId, reason; refers to an already-present non-reversal event. No reversal-of-reversal in version one; restore intent with a fresh ordinary event.

Process physical sheet order, not client timestamps. Keep the first occurrence of each event ID and visibly count duplicate deliveries. Invalid JSON/unknown kinds are isolated and counted; never erase them. A reversal targeting a nonexistent/later event is invalid. Different repeated reversal IDs targeting the same valid record have one effective exclusion. Retain original and correction records in history.

No claim of atomic uniqueness, exactly-once delivery, multi-row transactions or server-enforced actor binding. If a malicious caller reuses another event ID with conflicting data, the app cannot establish which is authentic; flag the conflict for owner inspection. Conflicting actor/client time/payload duplicates are flagged while the first occurrence wins; provider receipt-time changes alone are not a conflict.

## Local owner-manager requirements

| ID  | Requirement                          | Acceptance                                                                                                               |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| M1  | Configure frontend URL and notebook  | Valid HTTPS Pages URL or explicit loopback dev URL; endpoint binding restricted to this notebook                         |
| M2  | Inventory five users                 | Username, endpoint ID, credential version/reference, lifecycle state and last verified time; no routine secret exposure  |
| M3  | Import provisioned credentials       | Verify authenticated read, expected headers, anonymous denial; record manual permission confirmation                     |
| M4  | Issue private links                  | Encode only that user's bearer capability; copying is explicit; no automatic messages                                    |
| M5  | Revoke real access                   | Provider operation succeeds and old credential is checked; local deletion alone never displays 'revoked'                 |
| M6  | Replace access                       | Reconcile pending batches, record retired endpoint, configure replacement and issue new link; show limited-slot downtime |
| M7  | Optional Global lifecycle operations | List/create/delete with explicit permissions and scoped registry; support configured additional authentication factor    |
| M8  | Honest unsupported features          | Token refresh/expiry shown only after supported provider operation is verified; no made-up endpoints                     |
| M9  | Local boundary                       | Loopback binding, same-origin mutations, Host checks, JSON/custom-header gate, no public manager bundle                  |
| M10 | Protect/recover local data           | Explicit storage policy, sanitized logs, backup instructions, durable state updates; no account secrets in Git           |

Lifecycle should distinguish draft, awaiting provider configuration, verified active, revocation pending, verified revoked, and uncertain outcome. Record operation intent and result without secret values. A failed local save after a successful remote revoke must not leave an apparently active usable credential; reconciliation is required. The prototype has simpler states and needs review before reuse.

## Transport and concurrency

Teacher HTTP allowlist: GET reads and POST append route; no generic URL/method facility. Send bearer via Authorization, use fixed SheetDB origin, validated endpoint/tab, RAW values and bounded request timeouts. Validate headers before first write, and decide a safe validation-cache lifetime.

Classify a timed-out write as uncertain, not failed. Persist a pending batch atomically before sending, retain original IDs, read current events before retry and submit missing IDs. Duplicate physical rows are acceptable if the projection is idempotent. Reload, account switch, token rotation, storage failure and partial batch responses must not silently lose pending work. No automatic POST retry with fresh IDs.

Read refresh must account for multiple APIs over the same spreadsheet; provider cache invalidation may be per API. Validate `ignore_cache=1` and document freshness. Implement bounded rate-limit handling using Retry-After; respect quota exhaustion. Bulk attendance uses one POST where possible. Full-ledger reads are acceptable only while measured data sizes remain practical; pagination/archival needs a later explicit ordering design.

## Privacy, recovery and delivery

The public GitHub repository/deployed assets contain application code, not roster data, links, bearer values or manager state. A dedicated spreadsheet contains only data all trusted users may read. Browsers can cache/read what their bearer allows; revocation cannot retract copies already obtained. Keep independent spreadsheet snapshots and record owner recovery steps.

Deploy only the teacher build to GitHub Pages. Keep manager and Global credentials local. Test repository-subpath assets and CORS with the final origin. Do not import existing production records without an explicit mapping and migration request. Public software publication is authorized. Provider account acceptance remains unrun and no production migration is authorized.

## Definition of ready for implementation

Feasibility gates resolved, expiry expectations accepted, management approach selected, account plan confirmed, schema version strategy chosen and unknown provider controls verified or removed from scope. Implementation/publication was authorized on 2026-11-13; live acceptance is tracked separately. These documents specify intended behavior, not a claim that the preserved prototype satisfies every requirement.
