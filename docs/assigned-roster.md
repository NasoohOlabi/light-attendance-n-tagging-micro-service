# Assigned students and teacher links

**Current Neon path:** teachers sign in with managed Auth; `students.teacher_id` is canonical assignment and the API scopes every roster/event query to it. The roster remains read-only for teachers; owner import uses the private CLI. Assignment eligibility and stable IDs below still apply. Separate workbook capabilities and version-two magic links describe the legacy SheetDB path only. See [Neon setup](neon-setup.md).

Current teacher workflow, agreed 2026-11-13. This supersedes the original shared-notebook UI requirements. The old `قديم` checkbox is unmaintained: import a named student when the source has a nonblank teacher assignment. Do not infer activity from that checkbox, attendance percentages or row colors. Read the source inventory only; publish a separate normalized copy.

## Two data sources

| Source                          | Columns                                                            | Teacher capability                                                            |
| ------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Roster workbook / `Roster` tab  | `studentId`, `name`, `teacherId`, `teacherName`, `group`, `active` | Authenticated Read only; teacher transport sends GET only                     |
| Records workbook / `Events` tab | `id`, `actor`, `client_time`, `received_at`, `payload`             | Authenticated Read + Create; teacher transport sends GET and append-only POST |

Use separate workbooks and separate API IDs. SheetDB permits selecting tabs via a request parameter, so placing a roster beside writable Events does not make that roster provider-read-only. The app rejects a version-two link that reuses one API ID for both roles. Provider permissions must still be configured and verified; a GET-only client does not establish provider permissions.

The source import creates stable UUIDs for each student and teacher, retains names and source level as `group`, and sets imported assigned students `active=TRUE`. Local import provenance maps IDs back to source rows outside Git. Do not regenerate IDs on a routine refresh: reconcile existing IDs before publishing an updated copy. No contact numbers, birth dates, old attendance columns or unassigned students are needed for this first import. Normalized `active` is explicit eligibility in the published copy, not a translation of `قديم`.

## Teacher experience

Version-two private links contain the Events endpoint, Roster endpoint, teacher ID and display name in the fragment. On entry the fragment is consumed into session storage. The app reads the canonical roster and shows only that teacher's active assigned students in Attendance, Students, Notes, Summary and History. Shared ledger student snapshots cannot replace canonical roster values. General notes and roster changes are unavailable in assigned mode; notes and attendance reference an assigned student ID. Corrections target an ordinary event for an assigned student.

Students is a read-only list. **Open student** focuses a student's attendance and related views; **All my students** clears the focus. The local manager can issue a private link per teacher or a student entry link after checking current ownership. A student entry link uses the teacher capability and is navigation for that teacher, not a student login or a narrower security credential. Do not send it to a student as if it grants a student-only role.

Each save/retry rereads the roster before POST. If the student is reassigned or removed, the app keeps the pending batch and blocks its replay. Reconcile that intent with the owner; never silently send it under another teacher or create fresh retry IDs. Same-page replacement magic links remount the session, clear old in-memory drafts and reread the new scope; malformed replacements close the old session.

## Accepted trust limit

The owner explicitly accepts optimistic application restrictions. The normal app does not show another teacher's students or records, but shared bearer capabilities can read broader data through direct API calls, and a recipient can alter a copied link or submit direct requests. This is not server-enforced teacher identity, row authorization or confidentiality between mutually untrusted users. Hard isolation would require separately scoped provider stores/credentials or a backend that enforces it.

Shared endpoints also mean individual provider revocation is unavailable. The local manager refuses a revoke that would affect other active saved profiles. Reissuing a link or changing a username does not invalidate an old capability. Deleting a sole profile's Events endpoint leaves its separate Roster credential usable; revoke both provider capabilities when full access withdrawal is intended.

## Local setup and proof

1. Owner supplies/configures a private Read-only Roster endpoint and a separate private Read/Create Events endpoint. Enable bearer auth and final-origin CORS; disable other mutations. Keep account keys local.
2. Run `bun run manager` at `http://127.0.0.1:4174/`. Enter the Events settings and Roster settings, choose **Load roster teachers**, select a roster-derived teacher and confirm actual provider permissions before saving.
3. Use **Get link** for the teacher or choose one of their current students for a student entry link. Link output and saved state are private; never attach them to issues, logs or public evidence.
4. Exercise `bun run verify:release` and the [assigned verification map](../.agents/skills/verify-halaqa/features/assigned.md). Synthetic provider tests prove application behavior. They do not certify live Read-only permissions, CORS, import safety or credential revocation.

Legacy version-one links and the memory-only sample keep the earlier shared editable notebook behavior for compatibility. Issue version-two links for this use case. Actual source/copy IDs and student data live only in private owner files/Drive, never the public repository.
