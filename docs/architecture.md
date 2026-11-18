# Architecture and decisions

React uses same-origin Better Auth sessions and a Bun API backed by Railway Postgres. `app_accounts` maps authenticated identities to Administrator, Teacher or Student; `teachers`, `students`, `events`, `courses` and `course_enrollments` hold roster, ledger and course data. The internal `neon_auth` schema and some filenames retain their names for compatibility. See [roles](roles.md) and [Railway setup](railway-setup.md).

Teachers see active assigned students and their events, subject to server-enforced mode and expiry. Administrators use the full notebook and manage accounts and assignments. Student requests are projected on the server and return only the linked student's effective attendance. Reassignment changes the staff scope of historical events while student access follows the linked student ID.

## Events and projection

Attendance has three current statuses: **Present**, **Absent** and **Excused**. Existing `early` and `late` values remain valid in raw events and pending retries for compatibility; projection counts both as `present`. Controls, summaries, dashboards, human-readable history and Student responses use the three-status view. Original event payloads and exact duplicate-ID comparisons remain unchanged, so normalization never rewrites audit history or turns conflicting retries into identical records.

`shared/ledger.ts` defines validated event payloads: student snapshots, attendance, notes and reversals. Corrections append a reversal referencing a preceding non-reversal event; originals remain in history. Duplicate reversals are harmless; forward references and reversal-of-reversal are invalid. Projection uses database sequence order, never client time. The latest surviving attendance for a student/enrollment/date wins; historical unscoped events use a separate student/date namespace. Enrollment IDs are bound to their student by a database foreign key and validated against the active assigned roster before insertion; reversing it can reveal an earlier status. Notes remain separate. Duplicate event IDs count once, with conflicting values flagged. The API serializes validated payload JSON without a transport version field. Strict snapshot validation fails closed on malformed records; projection counts invalid correction references and conflicting IDs.

## Delivery

`src/useLedger.ts` persists a batch before sending and blocks new submissions while delivery is uncertain. Pending operations take a browser-wide Web Lock and the original account lock for compatibility with older open tabs. Retries and discards read the current stored batch again under those locks. Corrupt or unavailable storage and unsupported locks fail closed. A retry reads first and removes already visible IDs. The API enforces unique IDs so a retry cannot create another event for the same ID. The server checks duplicate IDs against the stored actor, assignment, PostgreSQL timestamp and payload. No POST is automatically retried. Pending storage is private data; reconcile it before clearing. Form drafts are memory-only. Reads occur on entry, refresh and save/retry, not continuous polling.

`bun run verify` checks the code and build; `bun run verify:ui` drives synthetic browser paths. Neither replaces live Railway verification. See the [verification skill](../.agents/skills/verify-halaqa/SKILL.md).

### Offline attendance

A read/write teacher prepares an open course and session date on a trusted device. IndexedDB stores a minimal account-scoped roster with the confirmed attendance status and event ID for each enrollment. The offline screen saves marks locally before acknowledging them and keeps the original event IDs across app restarts and retries. Its device access expires and is separate from server authentication. Local storage can still be cleared by the device or browser.

Foreground sync uses the existing same-origin session and confirms the authenticated account. `POST /api/attendance/sync` checks current account and roster permissions, locks attendance writers, compares each mark against the effective event version, and appends accepted marks. A different status at a changed version is retained for the teacher to review. The teacher can keep the server value or submit their value against the newly displayed version. A closed course, withdrawn enrollment, or lost assignment blocks the queued write. Receipt times and device times are available for history; database order determines effective attendance. Students see the accepted marks through their existing attendance view.

## Courses

Administrators manage courses and one enrollment per student/course. Scores are optional numbers from 0 to 100. The server locks the student during enrollment changes and attendance checks, validates scope and keeps enrollment IDs stable. Historical unscoped attendance remains unassigned. See [courses](courses.md).
