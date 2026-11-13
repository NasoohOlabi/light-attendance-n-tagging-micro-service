# Student roster

## Sub-features

Add student, rename, regroup, deactivate/reactivate, include inactive and name/group filtering.

## How to get to it (user POV)

Open **Students**. Use **Student name**, optional **Group**, and **Add student**. Each row has Name/Group edits, **Save changes**, **Make inactive** or **Activate**.

## Driving it with Playwright

The `sample notebook` test fills **Student name** with ليلى and clicks **Add student**, observes saved feedback, then proves the same name is selectable in Attendance and Notes. Reload proves demo changes disappear. For roster edits, scope `getByRole('textbox', { name: 'Name', exact: true })` and **Save changes** to the chosen row form; verify changed group in Group filtering, inactive exclusion, **Include inactive** and Activate. History must retain every snapshot with a stable student ID.

## Gotchas

Use a row-scoped locator because editable names/groups repeat. Renaming must preserve attendance/note references. Deactivation does not delete history. Demo and live notebooks never merge.
