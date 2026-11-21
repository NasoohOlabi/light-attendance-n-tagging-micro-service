# URL state

`src/queryState.ts` owns view state: tab, date, from/to summary bounds, student search q, group, tag, student and all (include inactive). Tabs push history; filters replace it. Absent date defaults to local today; absent summary bounds mean this calendar month through today. Explicit date values make shared views stable across days. Tab changes clear the note-specific student/tag filters, keeping global search/group filters.

Drafts, open correction forms, temporary status and fetched data stay in React. Better Auth keeps the session in a same-origin HttpOnly cookie. Recipients sign in with their own accounts to open shared notebook links.
