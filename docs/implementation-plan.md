# Implementation plan and task list

Updated 2026-11-13, Asia/Damascus (UTC+03:00). The user explicitly authorized setup, implementation and public publication, replacing the earlier planning-only stop. Preserve source snapshot `f6fee1d` and prototype `2d8fbe5`. Current delivery is the account-independent software and sample notebook; live-account readiness requires separate evidence, not credentials in Git.

## Direction

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
- [ ] Publication acceptance: public GitHub repository, protections, stable deployment HTTP/UI check and release tag. Record actual remote/build result in the work log.

Completed checkboxes describe implemented and locally tested software. Publication status is finalized in the work log after remote checks; account tasks below remain open until observed.

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
- [ ] Full Arabic translation and wider browser/device coverage if requested; Arabic content and mobile Chromium paths already work.

Use [CONTRIBUTING](../CONTRIBUTING.md) for implementation/PR steps and the [verification feature map](../.agents/skills/verify-halaqa/features/README.md) for acceptance proof. Maintain this one task list rather than parallel model-specific plans. Update statuses with observed evidence and record limitations in [work-log.md](work-log.md).
