# Implementation plan and task list

## Public course homepage

- [x] Replace the attendance-tool marketing page with an Arabic/English course introduction, proposed outcomes/curriculum and explicit teacher/schedule/enrollment/contact placeholders.
- [x] Keep plain root public even with a stored legacy capability; preserve explicit private links and the separate `?page=app` entry.
- [x] Verify course anchors, sample isolation, mobile/RTL layouts and existing app/PWA flows.
- [x] Publish the course-focused homepage through nightly and main-only Pages: main `e482fb3`, successful Stable Pages run `43460220354`; the actual public course content and placeholders were observed at root.
- [ ] Finish the route-aware localized browser-title follow-up found during public verification, then repeat public-root proof.

## Three application roles

- [x] Server-owned Administrator, Teacher and Student roles; signup grants no role or data access.
- [x] Student read-only view contains only their own effective attendance, with no notes, raw events or peer roster.
- [x] Administrator account approval, role/link changes, disable and canonical roster assignment; self-management blocked.
- [x] Repeatable role migration tested twice on an isolated Neon branch, then applied to production; owner-designated first Administrator granted privately and verified without recording personal identity here.
- [x] Arabic/English phone UI, synthetic API/UI checks and real Neon Auth/JWT/Postgres verification with fixture cleanup.
- [x] Promote the role UI through nightly and main-only Pages: PR #17, main `340be7a`, successful Stable Pages run `43456101107`; public configured assets and Arabic/English Administrator/Student phone screens verified with synthetic service boundaries. Actual Neon permissions were verified separately above.

See [role permissions](roles.md) for scope, private bootstrap and limitations.

## Current Neon migration

The user subsequently requested Neon Postgres and managed Auth instead of relying on SheetDB capabilities. [Neon setup](neon-setup.md) is authoritative for the current backend. The assigned-teacher workflow remains; signup requires owner approval and the Function enforces identity, assignment, modes and expiry. The original SheetDB acceptance matrix below is legacy-only.

- [x] Preserve staged assigned-roster work in authorized baseline `cc4e279`.
- [x] Install Neon CLI/skills, authenticate, link the requested production branch and reconcile Postgres/Auth.
- [x] Version and test the three-table migration on an isolated Neon branch; apply it to production.
- [x] Deploy the authenticated notebook Function and wire managed Auth and API public URLs into React.
- [x] Verify real signup/signin/reload, persisted notes, two-user scope, permissions/expiry/disable and concurrent retry deduplication; clean synthetic accounts/data.
- [ ] Import the real roster and approve real teacher accounts from private owner inputs.
- [ ] Verify production auth email delivery/custom SMTP if password-reset or verification emails are required.
- [x] Promote the Neon frontend through main-only Pages with public URL variables: PR #11, main `f353a5e`, successful Stable Pages run `43435144322`; public English/Arabic sample flow verified on 2026-11-13. The earlier migration task was local/backend-only; publication was subsequently requested explicitly.

Updated 2026-11-13, Asia/Damascus (UTC+03:00). The user explicitly authorized setup, implementation and public publication, replacing the earlier planning-only stop. Preserve source snapshot `f6fee1d` and prototype `2d8fbe5`. Current delivery is the account-independent software and sample notebook; live-account readiness requires separate evidence, not credentials in Git.

## Current assigned-student delivery

- [x] Select source students by nonblank teacher assignment; ignore the unmaintained old/former flag.
- [x] Create and read back a private normalized copy with stable IDs; keep source read-only and personal data outside Git.
- [x] Implement version-two links with separate roster/event capabilities, read-only Students and teacher-scoped views/writes.
- [x] Validate pending retries against current assignment and replace same-page sessions safely.
- [x] Extend local manager to verify both endpoint reads, select roster teachers, issue teacher/student links and refuse shared collateral revocation.
- [x] Add synthetic unit, HTTP and desktop/mobile proof for teacher isolation in the app, malformed roster and same-page link switching.
- [ ] Configure and verify actual private SheetDB Roster Read-only and Events Read/Create capabilities; no usable API endpoints or bearer values have been supplied to this run.
- [ ] Issue actual private teacher/student entry links and perform a live append/read-back after provider setup. OAuth login alone does not supply endpoint bearers or attach missing tools to this running chat.

See [assigned-roster.md](assigned-roster.md) for the authoritative current contract. Shared raw capabilities remain broader by explicit user agreement; the older five-user independently revocable rollout matrix below is an alternative and is not claimed by the new shared-endpoint mode.

## Original baseline direction

Serve five trusted teachers with static Pages, private self-contained links, shared attendance/notes/roster, append-only corrections and resilient pending delivery. Run the access manager only on loopback. Prefer manual-first provider credential import; account-level automation is optional. The deployed app is agnostic to the owner's SheetDB account and contains no baked-in endpoint or token. Account management keys never enter teacher links.

## Delivery tasks

- [x] Audit plans/source/history and replace contradictory planning-only instructions with current authorization.
- [x] Canonical `AGENTS.md`, thin host pointers, bounded Terra feature delegation, atomic commit/PR etiquette and dated work log.
- [x] Bun hooks: staged formatting/secret checks/typecheck/tests/lint; pre-push verification and full-history scan.
- [x] CI: frozen install, dependency audit, pinned actions, formatting, lint, typechecks, tests, artifact boundary and desktop/mobile Playwright paths.
- [x] Stable main-only Pages workflow; nightly branch artifacts; documented promotion and rollback.
- [x] Teacher event schema version 1 writes with legacy compatibility; unknown versions isolated; conflicting duplicate IDs flagged.
- [x] Persistent pending batches, stable IDs, reconciliation, fail-closed storage errors and cross-tab Web Locks.
- [x] Attendance change/correction guidance, date-filtered tagged notes, roster, summaries, history and sanitized view URLs.
- [x] Manager: loopback/CSRF boundary, isolated test state, durable save-before-remote revocation intent, blocked uncertain links and retired endpoint metadata.
- [x] Verification skill and feature map with executable real browser proof and retained synthetic evidence.
- [x] Publication acceptance: public GitHub repository, protections, stable deployment HTTP/UI check and release tag. Record actual remote/build result in the work log.

Completed checkboxes describe implemented and locally tested software. Publication passed GitHub validation/nightly/Pages workflows and deployed desktop/mobile sample checks; see the work log. Account tasks below remain open until observed.

## Live SheetDB acceptance — blocked on private account access

No credentials are required for local development or sample publication. Before distributing real links, an authorized agent uses account access outside source/history and runs these on a dedicated disposable workbook. No paid subscription or production migration has been selected.

| Task                                       | Proof required                                                                                                                       | Current state |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| A1: endpoint capacity and notebook binding | Two independently authenticated APIs point to the same workbook; capacity for five confirmed                                         | Unrun         |
| A2: permissions and import                 | Authenticated Read/Create work; anonymous requests and forbidden update/delete/tab/import overwrite routes fail; sentinels preserved | Unrun         |
| A3: CORS and freshness                     | Final Pages origin reads/appends; endpoint B sees endpoint A writes with fresh reads                                                 | Unrun         |
| A4: independent revocation                 | Provider deletion succeeds; old bearer fails reads and appends while another endpoint still works                                    | Unrun         |
| A5: provider RAW/timestamps                | Arabic/formula strings remain data; actual timestamp substitution observed                                                           | Unrun         |
| A6: account lifecycle                      | Supported bearer setup/replacement, plan limits and optional Global auth factor inspected                                            | Unrun         |
| A7: recovery                               | Export independent sheet snapshot; reconcile old pending IDs before endpoint replacement                                             | Unrun         |

Manual 404/410 observations are advisory, not proof of Create denial. A generic read denial never establishes revocation. Client dates/usernames are not signed identity. No expiry guarantee, exactly-once physical write or per-teacher data privacy is claimed.

## Bounded follow-up tasks

- [ ] M6/M7: optional Global bearer/Basic second factor after real account requirements are known. Current local form supports App ID/key only; use manual import when a second factor is required.
- [ ] M1: prove all imported endpoints share the intended workbook. Current imports validate headers/auth but cannot establish notebook identity; do not claim stronger binding.
- [ ] Manager lifecycle: reconcile provider deletion after process/disk failure using live account evidence; local restart path is covered synthetically.
- [ ] Pending recovery: guided sanitized export/import for changed endpoint IDs. Current version deliberately blocks cross-link pending work and requires reconciling the old link.
- [ ] Measure ledger size/quota before pagination or archival. Keep physical ordering semantics explicit.
- [x] Arabic/English Wartaq Midad homepage and real teacher workspace, with phone bottom navigation and retained data/auth flows; synthetic desktop/mobile coverage. Physical-device/assistive-technology certification remains unrun.

Use [CONTRIBUTING](../CONTRIBUTING.md) for implementation/PR steps and the [verification feature map](../.agents/skills/verify-halaqa/features/README.md) for acceptance proof. Maintain this one task list rather than parallel model-specific plans. Update statuses with observed evidence and record limitations in [work-log.md](work-log.md).
