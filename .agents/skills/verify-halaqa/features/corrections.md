# History and corrections

## Sub-features

Inspect record details, undo note/attendance (and sample roster) with reason, retain originals, recompute projections and show duplicates/conflicts.

## How to get to it (user POV)

As an Administrator, open **Profile → Settings → History & corrections**. Use the Course picker to select open courses, closed courses, or records without a course. A course row's **History** action opens the same page for that course. In the editable sample, open History from the profile menu.

Open the three-dot menu for a record. Choose **Undo** on an ordinary record, enter **Reason**, then **Append correction**. Choose **Record details** to expand or collapse event JSON. Corrections and already-undone records offer details only.

## Driving it with Playwright

`e2e/courses.spec.ts` checks Settings navigation, reload and Back, old history URLs, course selection including closed courses, inactive student search, and appending a correction. Exercise both languages on desktop and mobile. Verify no History tab appears in the notebook navigation. `e2e/neon.spec.ts` checks that a Teacher opening either history URL reaches the dashboard. `e2e/roles.spec.ts` checks the Student portal on the history URL.

The `sample notebook` test scopes an `li` containing the saved Arabic note, clicks its Undo, fills Reason with تصحيح and appends. Assert the original row contains **Undone** and a separate **Correction: تصحيح** record exists. For changed correction behavior, also prove the note disappears from the student's attendance dialog for that day. Create two attendance statuses, undo the newest and verify the older status and summary return. Repeat with a renamed or regrouped student snapshot. Unit ledger tests cover forward/reversal-of-reversal rejection and duplicate/conflicting IDs.

## Gotchas

Student snapshot history keeps its student identity separate from labelled level and active-state fields. Assert that a roster change and its correction retain those independent values; raw JSON must remain unchanged. Attendance/note descriptions retain their existing date/status/text semantics.

Corrections append; there is no delete. Reversal-of-reversal is unsupported. Restoring intent uses a fresh ordinary event. Original malformed rows remain in database and are counted invalid, not erased.
