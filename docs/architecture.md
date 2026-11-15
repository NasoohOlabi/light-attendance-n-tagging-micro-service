# Architecture and decisions

React uses same-origin Better Auth sessions and a Bun API backed by Railway Postgres. `app_accounts` maps authenticated identities to Administrator, Teacher or Student; `teachers`, `students` and `events` complete the four application tables. The internal `neon_auth` schema and some filenames retain their names for compatibility. See [roles](roles.md) and [Railway setup](railway-setup.md).

Teachers see active assigned students and their events, subject to server-enforced mode and expiry. Administrators use the full notebook and manage accounts and assignments. Student requests are projected on the server and return only the linked student's effective attendance. Reassignment changes the staff scope of historical events while student access follows the linked student ID.

## Events and projection

`shared/ledger.ts` defines validated event payloads: student snapshots, attendance, notes and reversals. Corrections append a reversal referencing a preceding non-reversal event; originals remain in history. Duplicate reversals are harmless; forward references and reversal-of-reversal are invalid. Projection uses database sequence order, never client time. The latest surviving attendance for a student/date wins; reversing it can reveal an earlier status. Notes remain separate. Duplicate event IDs count once, with conflicting values flagged. The API serializes validated payload JSON without a transport version field. Strict snapshot validation fails closed on malformed records; projection counts invalid correction references and conflicting IDs.

## Delivery

`src/useLedger.ts` persists a batch before sending and blocks new submissions while delivery is uncertain. Web Locks serialize pending operations across tabs. Corrupt or unavailable storage and unsupported locks fail closed. A retry reads first and removes already visible IDs. The API enforces unique IDs so a retry cannot create another event for the same ID. No POST is automatically retried. Pending storage is private data; reconcile it before clearing. Form drafts are memory-only. Reads occur on entry, refresh and save/retry, not continuous polling.

`bun run verify` checks the code and build; `bun run verify:ui` drives synthetic browser paths. Neither replaces live Railway verification. See the [verification skill](../.agents/skills/verify-halaqa/SKILL.md).
