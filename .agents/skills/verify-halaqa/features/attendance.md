# Attendance and summary

## Sub-features

Present, Absent and Excused only; group marking of displayed active students, calendar date, unmarked distinction and inclusive summary bounds. Historical early/late marks display and count as Present while their raw events remain unchanged.

## How to get to it (user POV)

Sign in or choose **Explore with sample students**. The dashboard opens first. Use **Take attendance** to find a student by fuzzy search or browse group accordions when the query is empty. Drafts survive search and filter changes. The dashboard shows effective status counts for the selected date, including unmarked, and marked-student counts for up to five recorded dates through that date. **Summary** shows totals for the filtered roster.

## Driving it with Playwright

Both grouped and searched attendance use the same student-row renderer. Assert separate Student, Level and Attendance cells, with no level in the Student cell. Course selection uses only that enrollment's level, including a blank level; no-course uses the roster level. Accordion headings use the displayed level and do not require a repeated level beside each name. Exercise search, collapse/reopen, course switching and save without losing drafts. Check labelled columns and keyboard-reachable table scrolling at 320/390px in English and Arabic. `e2e/dashboard.spec.ts` and `e2e/courses.spec.ts` cover these alternate paths together.

The `sample notebook` test adds ليلى, selects `getByLabel('Attendance for ليلى').selectOption('absent')`, clicks **Save attendance (1)** and asserts the matching Absent tally on Summary. Assert only Present, Absent and Excused options/columns in both languages, and that legacy early/late events contribute to Present rather than disappearing. Also exercise **Mark displayed students present**, **Session date**, **Group**, **Find a student**, **From** and **To** when those branches change; prove saved count matches displayed intended changes and unmarked students do not become absent. Existing status cannot be cleared silently: use History correction.

## Gotchas

Same student/date uses last surviving event in database sequence, never device clock. Undoing newest attendance reveals the prior surviving status. Filtered-out/inactive students must not be saved by group marking. Summary dates are inclusive; reversed bounds show an error.

Keep a legacy raw mark in projection/API tests, reverse a newer mark to reveal it as Present, and verify the original status remains in the raw event. An identical legacy retry stays idempotent; reusing its ID for a different raw status still conflicts even if both statuses project to Present. Course enrollment scopes remain independent.
