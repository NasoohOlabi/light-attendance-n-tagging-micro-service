# Attendance and summary

## Sub-features

Present, Absent and Excused only; bulk marking of visible eligible unmarked students, calendar date, unmarked distinction and course-wide summary across all dates. Historical early/late marks display and count as Present while their raw events remain unchanged.

## How to get to it (user POV)

Sign in or choose **Explore with sample students**. The dashboard opens first. For signed-in users, use **Take attendance** and choose an open course on Attendance to mark its enrolled students in name order. For a partially recorded session, continue on the same date and course. Try Show unmarked. Drafts survive table filter changes and a visit to student information. The dashboard shows effective status counts for the selected date, including unmarked, and present-student counts for up to five recorded dates through that date, including dates with zero present. **Summary** shows all-date totals for the selected course's authorized roster, including inactive memberships, with per-column table filters. Notes remain student-scoped and count across all dates.

## Driving it with Playwright

Open Attendance without a course and follow the course selection action. In Courses, choose an open course as current, then open Attendance and read the alphabetical roster without typing or expanding a group. Check the enrollment-specific Teacher and Level cells and mark a student by name. Check both Arabic and English on desktop and at 320/390/430px. A closed course permits historical inspection only.

At phone widths, verify Sort and Filter beside the Attendance title. Each record starts with its student name above the labelled level, teacher and attendance fields. Verify that the date, bulk action, attendance selector and Add note stay reachable. The same toolbar sits beside the Summary title. Desktop tables show sortable column headings.

The `sample notebook` test adds ليلى, selects `getByLabel('Attendance for ليلى').selectOption('absent')`, clicks **Save attendance (1)** and asserts the matching Absent tally on Summary. Assert only Present, Absent and Excused options/columns in both languages, and that legacy early/late events contribute to Present rather than disappearing. Exercise bulk marking, **Session date**, and optional Attendance filters. Save one Excused mark and leave a second as a draft before applying the bulk action. Check both exceptions survive. On phones check the pending Save clears the bottom navigation. Then prove saved count matches displayed intended changes and unmarked students do not become absent. Combine per-column filters, including a no-match query, and confirm bulk marking leaves hidden drafts untouched. Existing status cannot be cleared silently: use History correction.

For Summary, use historical and current attendance in two courses. Assert course switching and reload retain independent all-date totals and inactive membership history. Saved `from`, `to`, `date`, `q`, `group`, `student` and `all` parameters must not narrow Summary. The page-level date, student-search and group controls are absent; per-column table filters narrow its rows without changing the overview totals. Other tabs retain their page controls. Check desktop/mobile in English/Arabic. Previous / no course counts only unscoped attendance.

Overview meters display each status's percentage of recorded student-sessions to one decimal place, with unmarked days excluded. In `e2e/summary.spec.ts`, verify mixed-status rounding, zero-share status, course switching, and no-records messaging without fabricated percentages. Check meter accessibility, flat brand styling, RTL fill direction and phone overflow; per-student table cells keep exact counts.

## Gotchas

Same student/date uses last surviving event in database sequence, never device clock. Undoing newest attendance reveals the prior surviving status. Filtered-out/inactive students must not be saved by group marking. Summary ignores saved date ranges, including reversed bounds.

Keep a legacy raw mark in projection/API tests, reverse a newer mark to reveal it as Present, and verify the original status remains in the raw event. An identical legacy retry stays idempotent; reusing its ID for a different raw status still conflicts even if both statuses project to Present. Course enrollment scopes remain independent.
