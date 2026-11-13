# URL state

`src/queryState.ts` owns view state: tab, date, from/to summary bounds, student search q, group, tag, student and all (include inactive). Tabs push history; filters replace it. Absent date defaults to local today; absent summary bounds mean this calendar month through today. Explicit date values make shared views stable across days. Tab changes clear the note-specific student/tag filters, keeping global search/group filters.

Drafts, open correction forms, temporary status, demo state and fetched data stay in React. Authentication is separate: `src/session.ts` consumes and removes `#access`, and stores the credential in session storage. Query links can be shared without sharing credentials. Recipient teachers must already have their own session or reopen their personal access link before following a view link.
