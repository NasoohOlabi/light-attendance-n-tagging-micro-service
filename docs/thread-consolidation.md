# Consolidated delivery status

Checked 2026-11-16, Asia/Damascus (UTC+03:00). This note reconciles the project's T3 threads with GitHub and Railway; historical thread answers describe their own point in time.

## Verified baseline

GitHub `main` and the clean local checkout both started at `c0048e2`. Railway production deployment `5cecffe3-4499-450b-883f-a92c06a4a347` reported **SUCCESS** for that exact commit. Main Validation and CodeQL passed; the public `/health` returned `{"ok":true}`.

| Work                                                                                                 | Current state                              | Evidence                                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Attendance dashboard, search, grouping and administrator password reset                              | Merged and deployed                        | PR #34, followed by Settings routing in #36                                                                                 |
| Courses, many-to-many enrollments, per-course levels/scores and attendance                           | Merged and deployed                        | PR #38, main `b3f5f47`; live provider proof in the work log                                                                 |
| Compact Settings, removed acting-administrator card, five student columns and separately saved names | Merged and deployed                        | PR #40, main `a47d455`; provider proof merged in #42                                                                        |
| Main-only releases and bilingual development label                                                   | Merged and deployed                        | PR #41, main `7f3187e`; nightly workflow removed                                                                            |
| Mobile/Arabic layout, language controls, PWA and responsive login                                    | Incorporated into the current app          | Earlier publication PRs #11–30 and current source/browser checks                                                            |
| Neon setup and old link-based access                                                                 | Historical or superseded                   | Railway replaced Neon hosting/Auth in #31; SheetDB access was retired in #34. Preserve recovery data and backup references. |
| Render/Railway hosting explorations                                                                  | Research, not missing application features | Later Railway implementation supersedes the exploratory threads                                                             |

The recent deployment-check thread observed `7f3187e` waiting for CI and an outstanding proof note. Both subsequently completed: #42 is merged and Railway runs `c0048e2`. No application feature PR remains open. Open PRs #1, #2, #3, #4 and #6 concern dependencies/CI; #1 also includes its earlier CI repair and work-log note. They are not unpublished application screens and are outside this UX change.

The retained `nightly` branch is historical. Its diff against main includes reversals of newer work; merging its whole tree would regress Settings/names and reintroduce nightly configuration. Its remaining course deployment notes were already reconciled into main. Old local feature refs can differ because releases were squash-merged or replaced; a branch name alone does not establish missing work. No branches were deleted or blindly merged during this audit.

## Reproduced old-client behavior

On the real Railway URL, the normal preview profile loaded `assets/index-BhNhRtgZ.js`, lacked the development label, and had a controlling service worker with another version **waiting**. A fresh private profile loaded `assets/index-BF-mcy2h.js`, matching a fresh network read of `index.html`, displayed the development label and had no waiting update. This reproduces stale client code even while the server runs current main; it does not prove the precise state of the owner's separate browser.

The worker deliberately waits while existing app windows remain open, preserving drafts and pending delivery. Finish saving, close **all** Wartaq browser tabs and installed-app windows, then reopen the Railway URL. Reloading one window may retain the older worker. Do not clear site storage to update: it can contain pending attendance or notes.

The navigation refinement in this branch keeps the existing notebook rail on Settings and Add student, with role management still confined to explicit Settings. A bilingual waiting-update notice explains the safe update action. It cannot appear in a client still executing a bundle from before the notice existed; that client needs the close/reopen transition once. See the work log for verification and publication status of this refinement.

## Ongoing work

Use this conversation as the coordinating thread and main as the delivery target. Keep feature implementation, verification, commit/PR and exact deployed commit together in its handoff. Historical T3 threads remain intact; they have not been moved, archived or restarted.
