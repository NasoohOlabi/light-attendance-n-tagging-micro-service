# Tagged notes

## Sub-features

Student notes from attendance rows, saved notes for the selected day, Arabic text and optional normalized comma-separated tags.

## How to get to it (user POV)

Open **Attendance**, choose the **Session date**, and use the amber **Add note** icon beside the status buttons on a student's row. Read the selected student and session date in the dialog. Enter the note and choose **Save note**. Blank tags use the default attendance tag. Reopen the row dialog to read saved notes for that day. Administrators can also review earlier notes in **Profile → Settings → History & corrections**.

## Driving it with Playwright

The synthetic authenticated notebook scenario opens the dialog for ليلى, tests Escape and focus return, saves Arabic text and tags, and reopens the row to read the note. It checks isolation by student and date and keeps the unsaved attendance mark while saving the note. It writes `.artifacts/verification/notebook.png`. A separate authenticated scenario verifies a legacy Notes bookmark redirects to Attendance and saves a note with the exact student and date, then reads it after reload. The phone scenario opens and saves the dialog in Arabic at 320px and checks its layout at 390px and in landscape.

## Gotchas

Notes remain student-scoped across courses. React renders the note as text and the API validates the payload. Tags normalize to lowercase, blank notes are rejected, and corrections hide the effective note while preserving its original History record. Legacy Notes bookmarks open Attendance.
