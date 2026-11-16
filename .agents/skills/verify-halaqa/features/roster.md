# Student roster

## Sub-features

Administrators manage assignments in Settings. The sample supports local roster edits; authenticated Teachers see their assigned roster.

In the notebook **Students** list, verify distinct Student, Level, Active and Actions columns rather than concatenated name/level text. With no course selected, Level shows the roster group value. With a course selected, it shows only the matching enrollment level; a blank enrollment shows an em dash. Use one synthetic student with different roster, Course A and Course B levels, switch courses and reload, and verify the exact Level cell and Open student action. Preserve visible headers and bounded keyboard scrolling at 320/390px in English and Arabic.

In Administrator **Settings → Students**, and the dashboard's dedicated **Add student** destination, verify five separate table columns: **First name**, **Last name**, **Level**, **Active**, **Actions**. Create and edit a synthetic student with separate given/family names, save, and reopen Edit to confirm each field persisted independently. Include a compound Arabic given/family name, a mononym with blank family name, active/inactive students and a legacy unsplit name. Level uses the roster group value. Legacy names remain intact until edited.

## How to get to it (user POV)

In the sample, open **Students**. Use **Student name**, optional **Group**, and **Add student**. Each row has Name/Group edits, **Save changes**, **Make inactive** or **Activate**.

## Driving it with Playwright

The `sample notebook` test fills **Student name** with ليلى and clicks **Add student**, observes saved feedback, then proves the same name is selectable in Attendance and Notes. Reload proves demo changes disappear. For sample roster edits, scope `getByRole('textbox', { name: 'Name', exact: true })` and **Save changes** to the chosen row form; verify changed group in Group filtering, inactive exclusion, **Include inactive** and Activate. History must retain every snapshot with a stable student ID.

## Gotchas

Use a row-scoped locator because editable names/groups repeat. Renaming must preserve attendance/note references. Deactivation does not delete history. Demo and live notebooks never merge.

The Administrator table retains all five columns at phone widths through a bounded, named, keyboard-focusable horizontal scrolling region. Verify English and Arabic headers/cell order, row-scoped Edit, scroll reachability and no page-level overflow at 320px. Keep synthetic table screenshots under ignored `.artifacts/verification/`. Apply `neon/004-student-names.sql` before testing the updated administrator API against a disposable database; local/synthetic proof does not establish deployed migration status.
