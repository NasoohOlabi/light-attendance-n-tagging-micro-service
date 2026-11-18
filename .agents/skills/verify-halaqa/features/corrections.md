# History and corrections

## Sub-features

Inspect record details, undo note/attendance (and sample roster) with reason, retain originals, recompute projections and show duplicates/conflicts.

## How to get to it (user POV)

Open **History & corrections**, then the three-dot menu for the record. Choose **Undo** on a live ordinary record, enter **Reason**, then **Append correction**. Choose **Record details** to expand or collapse event JSON. Corrections and already-undone records offer details only.

## Driving it with Playwright

The `sample notebook` test scopes an `li` containing the saved Arabic note, clicks its Undo, fills Reason with تصحيح and appends. Assert the original row contains **Undone** and a separate **Correction: تصحيح** record exists. For changed correction behavior, also prove the note disappears from the student's attendance dialog for that day. Create two attendance statuses, undo the newest and verify the older status and summary return. Repeat with a renamed or regrouped student snapshot. Unit ledger tests cover forward/reversal-of-reversal rejection and duplicate/conflicting IDs.

## Gotchas

Student snapshot history keeps its student identity separate from labelled level and active-state fields. Assert that a roster change and its correction retain those independent values; raw JSON must remain unchanged. Attendance/note descriptions retain their existing date/status/text semantics.

Corrections append; there is no delete. Reversal-of-reversal is unsupported. Restoring intent uses a fresh ordinary event. Original malformed rows remain in database and are counted invalid, not erased.
