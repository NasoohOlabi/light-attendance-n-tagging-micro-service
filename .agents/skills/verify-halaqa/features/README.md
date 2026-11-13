# Halaqa verification features

Current Neon login, teacher scope, pending retries and account switching are covered by `e2e/neon.spec.ts` using synthetic provider boundaries. The explicit live-service path is `bun run verify:neon:live`; see [Neon setup](../../../../docs/neon-setup.md). The legacy entries below remain compatibility coverage.

Three-role changes also run `e2e/roles.spec.ts`: real Arabic/English phone Student attendance, no staff API calls or notebook controls, stale access removal on 403, signup without role selection, Administrator self-protection, Teacher approval modes, Student identity linking and canonical roster creation. `tests/neon-api.test.ts` checks server denials and projected attendance privacy. Live verification separately proves actual Auth/JWT/Postgres behavior and removes synthetic fixtures; offline mocks cannot prove provider authorization.

Every user entry point below needs proof when affected. The runnable harness is `e2e/notebook.spec.ts` plus `tests/manager.test.ts`; consult the skill for launch/isolation/evidence.

For PWA/install changes, run `e2e/pwa.spec.ts` and the full suite. It serves the built site under an isolated `/notebook/` prefix and proves manifest/icon/worker URLs, clean offline entry, private/authenticated/query/POST cache bypass, native prompt wiring and single use, Arabic/iPad instructions, standalone hiding and waiting updates preserving an unsaved note. Keep `.artifacts/pwa/` screenshots. Native OS installation is simulated only at the prompt callback; browser cache and network behavior are real. Physical-device installation and live provider access remain separate. See [PWA behavior](../../../../docs/pwa.md).

The selected Wartaq/Midad site has a public course homepage at root and a separate `?page=app` managed account/notebook entry. Run `e2e/home.spec.ts` for bilingual course content/placeholder notices, home anchors/disclosures, responsive targets, demo/back/sign-in separation and close-to-home behavior. `e2e/home-routing.spec.ts` proves plain root stays public with a stored legacy capability, explicit private links enter the app after fragment removal, and samples do not use a stored provider capability. `e2e/neon.spec.ts` enters sign-in from home, resumes the app across reload, switches accounts and proves an incoming reset token is consumed from memory after URL removal. Retain `.artifacts/wartaq-final/` home/app captures. Fresh legacy links must still open their notebook directly; teacher replacement preserves the selected view while clearing form state. Mobile teacher navigation has five labelled destinations and safe-area clearance. Course teacher/schedule/enrollment particulars are draft placeholders, not working registration or confirmed offerings.

Current assigned-teacher workflow: [assigned students and links](assigned.md), driven by `e2e/assigned.spec.ts`. The editable roster/general-note entries below describe legacy/demo mode; assigned mode keeps the roster read-only and requires student-specific records.

For Wartaq draft routes, shared brand assets or draft CSS, run `e2e/wartaq.spec.ts` and the full suite. `/?design=a` opens Rihab; `/?design=b` opens Midad. Verify both languages, native attendance/save and local note actions, draft switching, 320/390px portrait and 844px landscape, 44px targets/16px controls, zero external requests, and return to the normal notebook. Retain `.artifacts/wartaq/` screenshots. These routes are local design samples, not authenticated notebooks; see [design system](../../../../docs/wartaq-design-system.md).

For language, layout, form semantics or typography changes, run `e2e/mobile.spec.ts` and the Arabic authentication case in `e2e/neon.spec.ts`. They drive both languages through all notebook views, long names, draft preservation, Arabic comma tags, attendance/corrections, 320px portrait, 390px portrait, 844px landscape and 200% text enlargement. They assert document overflow, 44px buttons/selects/disclosures and 16px inputs; the summary table must scroll inside its labelled region. Manager checks spawn a private temporary store and preserve typed values on language switching. Evidence and limits: [mobile audit](../../../../docs/mobile-and-languages.md).

The shared homepage/app language control is one icon-only Lucide globe button with the destination language as its accessible name. `e2e/home.spec.ts` checks its single-button structure, decorative Lucide icon, absence of visible text and keyboard activation. `e2e/roles.spec.ts` checks icon-only language, administration, sign-out, refresh and open-student utilities in both languages, their tooltips and 44px targets, refresh reads, keyboard student entry and return to administration. Retain `.artifacts/verification/utility-icons-ar.png` using synthetic data only. The language/mobile/Auth cases above cover switching and preserved state across shared app surfaces.

`e2e/headerLayout.ts` checks actual header geometry: actions sit at physical left on one row with no more than 8px between targets, and role/Auth brands sit at right. Role and authentication cases run this proof in both languages, including 320/390/844px notebook/account layouts. Retain the synthetic `.artifacts/verification/compact-role-header-ar.png` capture; never use the owner's real account screenshot as evidence.

If port 4173 belongs to another preview, preserve it and set `$env:PLAYWRIGHT_PORT='4273'` before `bun run verify:ui`. The harness still refuses to reuse an existing server.

| Feature                                   | Entry points and proof                                          |
| ----------------------------------------- | --------------------------------------------------------------- |
| [Attendance and summary](attendance.md)   | Individual status, mark displayed group, date, summary bounds   |
| [Tagged notes](notes.md)                  | General/student notes, tags, date bounds, shared feed           |
| [Student roster](roster.md)               | Add, rename/group, inactive/active, search/group filters        |
| [History and corrections](corrections.md) | Undo with reason, original record retained, projection restored |
| [Access and delivery](access.md)          | Magic link/session, demo, retry/storage/tabs, local manager     |

The bootstrap suite covers one path through each area and delivery failure cases. Entries explicitly identify additional manual/agent browser variants; passing one sample scenario is not proof of every mapped control. No live-account certification is implied.
