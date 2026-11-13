# Halaqa verification features

Current Neon login, teacher scope, pending retries and account switching are covered by `e2e/neon.spec.ts` using synthetic provider boundaries. The explicit live-service path is `bun run verify:neon:live`; see [Neon setup](../../../../docs/neon-setup.md). The legacy entries below remain compatibility coverage.

Every user entry point below needs proof when affected. The runnable harness is `e2e/notebook.spec.ts` plus `tests/manager.test.ts`; consult the skill for launch/isolation/evidence.

Current assigned-teacher workflow: [assigned students and links](assigned.md), driven by `e2e/assigned.spec.ts`. The editable roster/general-note entries below describe legacy/demo mode; assigned mode keeps the roster read-only and requires student-specific records.

| Feature                                   | Entry points and proof                                          |
| ----------------------------------------- | --------------------------------------------------------------- |
| [Attendance and summary](attendance.md)   | Individual status, mark displayed group, date, summary bounds   |
| [Tagged notes](notes.md)                  | General/student notes, tags, date bounds, shared feed           |
| [Student roster](roster.md)               | Add, rename/group, inactive/active, search/group filters        |
| [History and corrections](corrections.md) | Undo with reason, original record retained, projection restored |
| [Access and delivery](access.md)          | Magic link/session, demo, retry/storage/tabs, local manager     |

The bootstrap suite covers one path through each area and delivery failure cases. Entries explicitly identify additional manual/agent browser variants; passing one sample scenario is not proof of every mapped control. No live-account certification is implied.
