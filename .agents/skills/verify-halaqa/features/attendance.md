# Attendance and summary

## Sub-features

Present, Absent and Excused only; bulk marking of visible eligible unmarked students, calendar date, unmarked distinction and course-wide summary across all dates. Historical early/late marks display and count as Present while their raw events remain unchanged.

## How to get to it (user POV)

Sign in or choose **Explore with sample students**. The dashboard opens first. For signed-in users, use **Take attendance** and choose an open course on Attendance to mark its enrolled students in name order. Resume a partly marked session on the same course and date. Toggle Show unmarked and verify drafts survive both filters and student lookups. The dashboard lists the current students with the most explicit absences in the last six recorded sessions through the selected date. Open a name to review the student. Reversing an absence changes the outreach list. **Summary** shows all-date totals for the selected course's authorized roster, including inactive memberships, with per-column table filters. Notes remain student-scoped and count across all dates.

## Driving it with Playwright

Open Attendance without a course and follow the course selection action. In Courses, choose an open course as current, then open Attendance and read the alphabetical roster without typing or expanding a group. Check the enrollment-specific Teacher and Level cells and mark a student by name. Check both Arabic and English on desktop and at 320/390/430px. A closed course permits historical inspection only.

At phone widths, verify Sort and Filter beside the Attendance title. Each record starts with its student name above the labelled level, teacher and attendance fields. The attendance field has three 44px segments in one pill-shaped track, with a transparent, borderless amber Add note button on its right in English and Arabic. Confirm the layout at 320/390/430px and on desktop. The same toolbar sits beside the Summary title. Desktop tables show sortable column headings.

The `sample notebook` test adds ليلى, presses **Absent** in the **Attendance for ليلى** group, clicks **Save attendance (1)** and asserts the matching Absent tally on Summary. Verify the selected tile has a green Present, red Absent or amber Excused tint in both themes and languages. Arrow keys move focus in the page's reading direction, and Space selects the focused status. An unmarked row has zero pressed buttons. Press the selected status again to clear an unsaved mark on a previously unmarked row. Use **Correct this mark** to reverse a saved mark when permitted. Confirm legacy early/late events contribute to Present.

Click or tap Absent twice on an unmarked row. The first activation selects it with a red tint, and the second restores the neutral track even with the pointer still on the button. With keyboard navigation, the focused tile retains a visible outline after clearing.

Exercise bulk marking, **Session date**, and optional Attendance filters. Save one Excused mark and leave a second as a draft before applying the bulk action. Check both exceptions survive. On phones check the pending Save clears the bottom navigation. Verify the saved count matches the intended changes. Combine per-column filters, including a no-match query, and confirm bulk marking leaves hidden drafts untouched.

For Summary, use historical and current attendance in two courses. Assert course switching and reload retain independent all-date totals and inactive membership history. Saved `from`, `to`, `date`, `q`, `group`, `student` and `all` parameters must not narrow Summary. The page-level date, student-search and group controls are absent; per-column table filters narrow its rows without changing the overview totals. Other tabs retain their page controls. Check desktop/mobile in English/Arabic. Previous / no course counts only unscoped attendance.

In `e2e/summary.spec.ts`, inspect the dates ranked by recorded absences and expand one to check names and marks. Verify the remaining dates, historical memberships, course switching, no records and zero absences. Check the labelled bars in English and Arabic, phone overflow and the exact counts in the student table.

Open **Export attendance chart** on Summary with a read-only teacher and a multi-page course. Verify that the sorted percentages and fractions reflect corrected marks in this course, students with no records appear last, and classmates keep anonymous labels when one student is highlighted. Check the downloaded PNG against the preview, the named export opt-in, navigation to the highlighted student's page, and privacy defaults after closing. Open the ZIP and check all page images. Exercise file sharing, cancellation, and download on a browser without file sharing. Check English and Arabic at phone and desktop widths. The simulated share target in `e2e/summary.spec.ts` verifies the file passed to the browser. Physical-device delivery is a separate check.

## Gotchas

Same student/date uses last surviving event in database sequence, never device clock. Undoing newest attendance reveals the prior surviving status. Filtered-out/inactive students must not be saved by group marking. Summary ignores saved date ranges, including reversed bounds.

Keep a legacy raw mark in projection/API tests, reverse a newer mark to reveal it as Present, and verify the original status remains in the raw event. An identical legacy retry stays idempotent; reusing its ID for a different raw status still conflicts even if both statuses project to Present. Course enrollment scopes remain independent.

## Offline attendance

Check that the dashboard and Attendance page have no offline shortcut in their content. Find **Open offline notebook** in the Profile menu, then close the menu and disconnect. The offline notebook should open automatically.

Open the notebook once online as an approved read/write teacher. Reopen Wartaq offline after its online session would have expired and inspect every assigned student. Pick an open course and date, mark students, add two notes and change the phone for an unenrolled student. Reload and verify all five changes plus the full roster remain available. Reconnect with competing attendance and phone values, a lost successful reply, and a temporarily rejected mark. Verify that notes remain independent, retries preserve IDs, **Sync now** retries the blocked mark after eligibility returns, and an authorized refresh prunes a student reassigned away. Exercise the scenario on desktop and a touch-emulated phone with `e2e/offline-attendance.spec.ts`.
