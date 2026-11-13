# Assigned teacher workflow

## Sub-features

Version-two links with separate read-only roster and event credentials, teacher-only working views, per-student entry points, current-assignment write validation, same-page link replacement and read-only student information.

## How to get to it (user POV)

Open an owner-issued assigned-teacher link. Attendance shows only your students; Students lists the read-only roster. Use the Open student icon (localized tooltip/accessibility label) to focus a student, All my students to return, and Notes/Summary/History for that assignment. Refresh, language and session-exit utilities are also icon-only; notebook navigation and save actions remain visibly labelled. The owner issues teacher/student links from the local manager after loading roster teachers.

## Driving it with Playwright

Run `bun run verify:ui --grep 'assigned|reassignment|same-page'` or the full suite. `e2e/assigned.spec.ts` uses two synthetic teachers over shared provider data and proves each normal UI shows only the correct active roster, notes, summary and history. It inspects actual attendance/note POST student IDs and actor, forbids Roster POST and student/general-note editing, follows own and foreign student URLs, rejects an ambiguous roster, and retains a pending batch without POST after reassignment. A same-page hash navigation switches A to B, clears stale drafts, consumes the fragment and closes the session on malformed replacement. Synthetic screenshot: `.artifacts/verification/assigned-teacher.png`.

`bun test ./tests/manager.test.ts` verifies both endpoint credentials/auth headers, roster-derived identity, cross-student link rejection and refusal to revoke shared capabilities for one user. `tests/roster.test.ts` covers schema ambiguity, filtering, payload restrictions and fragment round-trips. Never substitute real roster data or credentials into these recorded tests.

## Gotchas

These are application restrictions; shared provider bearers remain broader by explicit user agreement. Do not describe this proof as server row authorization. A student entry URL is navigation under the teacher's capability. Legacy/demo behavior remains separate. Real source inventory is read-only, copied roster data stays private, and live provider permission/CORS/append/revocation checks remain separate gates.
