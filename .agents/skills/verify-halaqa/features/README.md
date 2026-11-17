# Halaqa verification features

The public homepage, sign-in and notebook screens have no development-release banner. `e2e/home.spec.ts` checks its absence in English/Arabic across page transitions and mobile overflow.

Run the affected scenarios and the full UI suite as directed by the [verification skill](../SKILL.md). The synthetic same-origin fixtures exercise real browser controls and storage; they do not establish live Railway behavior.

| Area                                    | Proof                                                       |
| --------------------------------------- | ----------------------------------------------------------- |
| [Attendance and summary](attendance.md) | Mark, filter, course-wide totals and correction projection. |
| [Notes](notes.md)                       | Student notes, tags and feed filters.                       |
| [Roster](roster.md)                     | Assigned students and sample roster editing.                |
| [Corrections](corrections.md)           | Append reversal and retain original history.                |
| [Access and delivery](access.md)        | Session, role scope, retries, storage and tabs.             |
| [Courses](courses.md)                   | Course enrollment and independent attendance.               |
| [Assignments](assigned.md)              | Teacher scope and reassignment.                             |

`e2e/neon.spec.ts` covers sign-in, session restoration, account switching, failed and uncertain requests, retries, storage denial/corruption, competing tabs, malformed snapshots and reassignment. `e2e/roles.spec.ts` covers Student privacy and denial, Administrator approval, roster management, self-protection and reset validation. `tests/neon-api.test.ts` tests server authorization and projection; `tests/railway-integration.test.ts` exercises password reset against a disposable database. The historically named files exercise Railway-compatible same-origin boundaries.

`e2e/notebook.spec.ts` drives the sample notebook. `e2e/home.spec.ts`, `e2e/home-routing.spec.ts` and `e2e/wartaq.spec.ts` cover homepage, routing and design samples. `e2e/mobile.spec.ts` and the Arabic authentication case cover language, responsive controls and RTL. `e2e/pwa.spec.ts` tests public shell caching, private request bypass, prompt wiring and updates; its prompt is simulated. Native OS installation remains unverified. See [PWA behavior](../../../../docs/pwa.md) and [mobile audit](../../../../docs/mobile-and-languages.md).

The notebook opens on a dashboard. Verify selected-date status counts include unmarked students and the recent chart counts present students on up to five recorded dates through the selected date, including zero-present dates, using effective projection. Take attendance offers fuzzy search or group accordions with an empty query; drafts survive search and filter changes. Add student opens the creation form for Administrators and sample users, without granting Teacher access. `e2e/dashboard.spec.ts` exercises these dashboard paths. Administrators open Settings explicitly. Course schedule and teacher details are placeholders; enrollment details are managed in Courses. Retain only synthetic screenshots and traces.
