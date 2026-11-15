# Attendance and summary

## Sub-features

Individual statuses, group marking of displayed active students, calendar date, unmarked distinction and inclusive summary bounds.

## How to get to it (user POV)

Sign in or choose **Explore with sample students**. The dashboard opens first. Use **Take attendance** to find a student by fuzzy search or browse group accordions when the query is empty. Drafts survive search and filter changes. The dashboard shows effective status counts for the selected date, including unmarked, and marked-student counts for up to five recorded dates through that date. **Summary** shows totals for the filtered roster.

## Driving it with Playwright

The `sample notebook` test adds ليلى, selects `getByLabel('Attendance for ليلى').selectOption('late')`, clicks **Save attendance (1)** and asserts `getByLabel('late: 1')` on Summary. Also exercise **Mark displayed students present**, **Session date**, **Group**, **Find a student**, **From** and **To** when those branches change; prove saved count matches displayed intended changes and unmarked students do not become absent. Existing status cannot be cleared silently: use History correction.

## Gotchas

Same student/date uses last surviving event in database sequence, never device clock. Undoing newest attendance reveals the prior surviving status. Filtered-out/inactive students must not be saved by group marking. Summary dates are inclusive; reversed bounds show an error.
