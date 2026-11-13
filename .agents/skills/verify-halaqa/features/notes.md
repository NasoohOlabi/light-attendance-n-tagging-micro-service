# Tagged notes

## Sub-features

Student/general notes, Arabic text/tags, normalized comma-separated tags, date bounds, tag buttons and dropdown filtering.

## How to get to it (user POV)

Open **Notes**. Choose a student or **General note**, enter date, tags and text, then **Save note**. Read the shared feed beside the form.

## Driving it with Playwright

The `sample notebook` test selects ليلى, fills **Tags, separated by commas** with `مراجعة, قراءة` and **Note** with `راجعت السورة اليوم`, clicks **Save note**, filters **Filter tag** to `مراجعة`, and proves the Arabic note remains while the unrelated sample note disappears. It writes `.artifacts/verification/notebook.png`. For affected branches also drive General note, Arabic comma, duplicate/blank tags, a tag chip, date range and no-match state. Observe the appended note in History and the student's Summary note count.

## Gotchas

Notes are data, including JSON/formula-looking strings; React renders text and transport uses RAW. Tags normalize to lowercase. No-tag/blank notes are rejected. Date range and roster filters combine; clear them before concluding a note was lost.
