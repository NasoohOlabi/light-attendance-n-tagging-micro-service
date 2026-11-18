# Architecture and decisions

React uses same-origin Better Auth sessions and a Bun API backed by Railway Postgres. `app_accounts` maps authenticated identities to Administrator, Teacher or Student; `teachers`, `students`, `events`, `courses` and `course_enrollments` hold roster, ledger and course data. The internal `neon_auth` schema and some filenames retain their names for compatibility. See [roles](roles.md) and [Railway setup](railway-setup.md).

Teachers see active assigned students and their events, subject to server-enforced mode and expiry. Administrators use the full notebook and manage accounts and assignments. Student requests are projected on the server and return only the linked student's effective attendance. Reassignment changes the staff scope of historical events while student access follows the linked student ID.

## Events and projection

Attendance has three current statuses: **Present**, **Absent** and **Excused**. Existing `early` and `late` values remain valid in raw events and pending retries for compatibility; projection counts both as `present`. Controls, summaries, dashboards, human-readable history and Student responses use the three-status view. Original event payloads and exact duplicate-ID comparisons remain unchanged, so normalization never rewrites audit history or turns conflicting retries into identical records.

`shared/ledger.ts` defines validated event payloads: student snapshots, attendance, notes and reversals. Corrections append a reversal referencing a preceding non-reversal event; originals remain in history. Duplicate reversals are harmless; forward references and reversal-of-reversal are invalid. Projection uses database sequence order, never client time. The latest surviving attendance for a student/enrollment/date wins; historical unscoped events use a separate student/date namespace. Enrollment IDs are bound to their student by a database foreign key and validated against the active assigned roster before insertion; reversing it can reveal an earlier status. Notes remain separate. Duplicate event IDs count once, with conflicting values flagged. The API serializes validated payload JSON without a transport version field. Strict snapshot validation fails closed on malformed records; projection counts invalid correction references and conflicting IDs.

## Delivery

`src/useLedger.ts` persists a batch before sending and blocks new submissions while delivery is uncertain. Pending operations take a browser-wide Web Lock and the original account lock for compatibility with older open tabs. Retries and discards read the current stored batch again under those locks. Corrupt or unavailable storage and unsupported locks fail closed. A retry reads first and removes already visible IDs. The API enforces unique IDs so a retry cannot create another event for the same ID. The server checks duplicate IDs against the stored actor, assignment, PostgreSQL timestamp and payload. No POST is automatically retried. Pending storage is private data; reconcile it before clearing. Form drafts are memory-only. Reads occur on entry, refresh and save/retry, not continuous polling.

`bun run verify` checks the code and build; `bun run verify:ui` drives synthetic browser paths. Neither replaces live Railway verification. See the [verification skill](../.agents/skills/verify-halaqa/SKILL.md).

### Offline teacher notebook

A successful read/write notebook load automatically stores the last authorized active roster, phone numbers, open courses, active memberships, and effective attendance and notes in account-scoped IndexedDB. Teachers can open that roster after a restart and select any date for attendance in an eligible course. Every assigned student can receive notes and phone updates, including students without a current enrollment. A fresh authorized snapshot replaces the saved roster and removes obsolete sessions without deleting queued work. Explicit sign-out, account switch, known grant expiry and confirmed access withdrawal close the offline notebook. The online sign-in cookie may expire while the device is offline. Browser storage still depends on the current browser profile and can be cleared by the device or browser.

The device confirms a save after the IndexedDB transaction commits. Foreground sync uses the same-origin session for the original account, then checks current permissions and assignments. `POST /api/attendance/sync` checks the effective mark version before appending. `POST /api/student/sync` appends notes and changes only the student phone field. Phone changes compare against the previously seen number under a row lock. The update and a private receipt commit together, so a retried operation cannot overwrite a newer phone. The receipt contains a fingerprint rather than contact details and is excluded from notebook and student event projections. Different attendance and phone values are retained for review. A teacher can choose the server value or submit their value against the displayed version. Blocked writes remain visible and **Sync now** retries them after eligibility returns. Server order determines effective attendance, and accepted marks appear in the Student view.

A server rollback after any phone edit must retain the receipt filter on all event projections. Older servers would otherwise reject the receipt as an unknown ledger event. Preserve receipt rows in backup and restore.

## Courses

Administrators manage courses and one enrollment per student/course. Scores are optional numbers from 0 to 100. The server locks the student during enrollment changes and attendance checks, validates scope and keeps enrollment IDs stable. Historical unscoped attendance remains unassigned. See [courses](courses.md).
