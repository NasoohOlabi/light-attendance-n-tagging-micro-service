# Halaqa verification features

Current Neon login, teacher scope, pending retries and account switching are covered by `e2e/neon.spec.ts` using synthetic provider boundaries. The explicit live-service path is `bun run verify:neon:live`; see [Neon setup](../../../../docs/neon-setup.md). The legacy entries below remain compatibility coverage.

Every user entry point below needs proof when affected. The runnable harness is `e2e/notebook.spec.ts` plus `tests/manager.test.ts`; consult the skill for launch/isolation/evidence.

Current assigned-teacher workflow: [assigned students and links](assigned.md), driven by `e2e/assigned.spec.ts`. The editable roster/general-note entries below describe legacy/demo mode; assigned mode keeps the roster read-only and requires student-specific records.

For Wartaq draft routes, shared brand assets or draft CSS, run `e2e/wartaq.spec.ts` and the full suite. `/?design=a` opens Rihab; `/?design=b` opens Midad. Verify both languages, native attendance/save and local note actions, draft switching, 320/390px portrait and 844px landscape, 44px targets/16px controls, zero external requests, and return to the normal notebook. Retain `.artifacts/wartaq/` screenshots. These routes are local design samples, not authenticated notebooks; see [design system](../../../../docs/wartaq-design-system.md).

For language, layout, form semantics or typography changes, run `e2e/mobile.spec.ts` and the Arabic authentication case in `e2e/neon.spec.ts`. They drive both languages through all notebook views, long names, draft preservation, Arabic comma tags, attendance/corrections, 320px portrait, 390px portrait, 844px landscape and 200% text enlargement. They assert document overflow, 44px buttons/selects/disclosures and 16px inputs; the summary table must scroll inside its labelled region. Manager checks spawn a private temporary store and preserve typed values on language switching. Evidence and limits: [mobile audit](../../../../docs/mobile-and-languages.md).

If port 4173 belongs to another preview, preserve it and set `$env:PLAYWRIGHT_PORT='4273'` before `bun run verify:ui`. The harness still refuses to reuse an existing server.

| Feature                                   | Entry points and proof                                          |
| ----------------------------------------- | --------------------------------------------------------------- |
| [Attendance and summary](attendance.md)   | Individual status, mark displayed group, date, summary bounds   |
| [Tagged notes](notes.md)                  | General/student notes, tags, date bounds, shared feed           |
| [Student roster](roster.md)               | Add, rename/group, inactive/active, search/group filters        |
| [History and corrections](corrections.md) | Undo with reason, original record retained, projection restored |
| [Access and delivery](access.md)          | Magic link/session, demo, retry/storage/tabs, local manager     |

The bootstrap suite covers one path through each area and delivery failure cases. Entries explicitly identify additional manual/agent browser variants; passing one sample scenario is not proof of every mapped control. No live-account certification is implied.
