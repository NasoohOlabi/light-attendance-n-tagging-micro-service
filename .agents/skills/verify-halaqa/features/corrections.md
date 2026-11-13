# History and corrections

## Sub-features

Inspect record details, undo note/attendance/roster with reason, retain originals, recompute projections and show duplicates/conflicts.

## How to get to it (user POV)

Open **History & corrections**. Choose **Undo** on a live ordinary record, enter **Reason**, then **Append correction**. **Record details** exposes event JSON without credentials.

## Driving it with Playwright

The `sample notebook` test scopes an `li` containing the saved Arabic note, clicks its Undo, fills Reason with تصحيح and appends. Assert the original row contains **Undone** and a separate **Correction: تصحيح** record exists. For changed correction behavior, also prove the note disappears from Notes; create two attendance statuses then undo newest and verify older status/summary returns; similarly undo a renamed/regrouped student snapshot. Unit ledger tests cover forward/reversal-of-reversal rejection and duplicate/conflicting IDs.

## Gotchas

Corrections append; there is no delete. Reversal-of-reversal is unsupported. Restoring intent uses a fresh ordinary event. Original malformed rows remain in provider storage and are counted invalid, not erased.
