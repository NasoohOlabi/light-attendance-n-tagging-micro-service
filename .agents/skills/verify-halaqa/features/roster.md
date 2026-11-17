# Student roster

## Sub-features

Administrators manage assignments in Settings. The sample supports local roster edits; authenticated Teachers see their assigned roster.

In the notebook **Students** list, verify distinct Student, Level, Active and Actions columns rather than concatenated name/level text. With no course selected, Level shows the roster group value. With a course selected, it shows only the matching enrollment level; a blank enrollment shows an em dash. Use one synthetic student with different roster, Course A and Course B levels, switch courses and reload, and verify the exact Level cell and Open student action. Preserve distinctly labelled fields with no horizontal scrolling at 320/390/430px in English and Arabic.

In Administrator **Settings → Students**, and the dashboard's dedicated **Add student** destination, verify separate table columns: **First name**, **Last name**, **Level**, **WhatsApp**, **Location**, **Birth year**, **Teacher**, **Active**, **Actions**. Create and edit a synthetic student with separate given/family names, save, and reopen Edit to confirm each field persisted independently. Include a compound Arabic given/family name, a mononym with blank family name, active/inactive students and a legacy unsplit name. Level uses the roster group value. Legacy names remain intact until edited.

As an Administrator, enter Students from a selected course and verify **All students** is the default. Active, inactive assigned and inactive unassigned students appear with the full register count. Search/group filters narrow the table without altering stored active state. An explicit course filter survives reload; clearing it restores the full list. Current attendance, dashboard and Grades retain their prior active-only scope, while historical course summaries retain inactive memberships; Teacher responses remain restricted to active assigned students. Attempt a new note/attendance event for an inactive student directly against the server and verify denial with no appended rows; exact event retries for eligible students remain accepted.

Verify a distinct labelled **Courses** column with localized None for zero active memberships and all four named badges for a four-course student, including a closed course but excluding a withdrawn membership. Keep course names separate from roster/enrollment levels. Check course-filter switching, reload, desktop/landscape use of space and an expandable course list at 320/390px in English/Arabic; every course name must remain reachable without page-level overflow. Account actions use the existing profile menu and `e2e/profileActions.ts` helpers.

## How to get to it (user POV)

Verify the primary Students columns **First name**, **Last name**, **Phone**, **Attendance** before Level/Courses/status/actions. Use explicit compound names, a leading-zero phone, a missing phone and an inactive historical student. Open student must show Student information with those values, status totals, effective recorded-session percentage and history; the old attendance-entry destination is a separate eligible action. All students aggregates attendance across accessible courses and unscoped marks, while a course filter narrows it. Include corrections, legacy statuses and genuinely unmarked dates. Reload, Back, unknown/foreign student IDs, read-only Teachers and English/Arabic 320/390px paths must preserve profile privacy, labelled fields, LTR phones and no horizontal table scrolling. Student responses must not include staff contact/name-part fields.

The Student portal also keeps Student and Roster level in separate labelled fields; it must not imply that the roster level is every course's level. Account-to-student selectors show only the student's name. Student snapshot history exposes Level and Active as distinct fields, retaining the raw record under Record details. Check these in `e2e/roles.spec.ts` and `e2e/dashboard.spec.ts` alongside attendance so a fix cannot leave another rendering path unchanged.

In the sample, open **Students**. Use **Student name**, optional **Group**, and **Add student**. Each row has Name/Group edits, **Save changes**, **Make inactive** or **Activate**.

## Driving it with Playwright

The `sample notebook` test fills **Student name** with ليلى and clicks **Add student**, observes saved feedback, then proves the same name is selectable in Attendance and Notes. Reload proves demo changes disappear. For sample roster edits, scope `getByRole('textbox', { name: 'Name', exact: true })` and **Save changes** to the chosen row form; verify changed group in Group filtering, inactive exclusion, **Include inactive** and Activate. History must retain every snapshot with a stable student ID.

## Gotchas

Use a row-scoped locator because editable names/groups repeat. Renaming must preserve attendance/note references. Deactivation does not delete history. Demo and live notebooks never merge.

The Administrator register stacks distinctly labelled fields at phone widths. Verify English and Arabic labels, row-scoped Edit, and no horizontal table or page overflow at 320/390/430px. Keep synthetic table screenshots under ignored `.artifacts/verification/`. Apply ordered migrations through `neon/007-student-profiles-handbooks.sql` before testing the updated administrator API against a disposable database; local/synthetic proof does not establish deployed migration status.

Verify optional WhatsApp, location and birth year fields on create and edit, including blank clearing, reload and distinct labelled roster columns at 320/390px in both languages. Birth year is a year only.

Check notebook Students and grouped/searched attendance column geometry on desktop in both languages: Level stays compact, Student receives the remaining width, and level text is centered under its header even when the text direction differs. Check labelled mobile fields, direct actions and readable longer course levels without horizontal scrolling. `expectCompactLevel` in `e2e/courses.spec.ts` measures actual rendered widths and text alignment.

The notebook Students status cells use a circled check for active students and a circled minus for inactive students. Verify symbols replace visible status words while localized accessible image names and tooltips retain the meaning in English and Arabic. Keep the separate status column and centered icons at desktop and phone widths.

Verify an active and an inactive unassigned student appear in the full administrator list with localized Unassigned, edit and save without an assignment, then assign an approved active teacher. Existing inactive or provisional teacher assignments remain selectable for profile edits but cannot be newly assigned. Verify teachers cannot access unassigned students. Apply `neon/009-unassigned-students.sql` to disposable databases.

Staff phone displays in Students, Student information and Administrator register use isolated LTR dial links: verify synthetic local leading-zero, bare international, explicit +/00, missing and invalid values in English and Arabic at phone widths. Editing retains raw values; filters and sorting use the stored values.

Whole-number decimal levels display without the zero-only fraction in roster, filters, profile, history and student portal. Editing a different field preserves the original stored level. Fractional and named levels remain unchanged.
