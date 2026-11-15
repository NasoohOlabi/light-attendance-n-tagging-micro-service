# Access and delivery

Sign in through the app or explore the sample. Run `e2e/neon.spec.ts` for synthetic same-origin Auth/API sign-in, session restoration, account changes, failed and uncertain requests, retry, unavailable or corrupt pending storage, competing tabs and malformed snapshots. Assert that failed storage or a held lock prevents unsafe additional writes and that retry retains event IDs. Run `e2e/roles.spec.ts` for approval, denied access, role isolation and Administrator password reset; confirm the acting Administrator cannot reset their own account.

Pending batches can contain private data. Web Locks and storage are required for safe live saves; reconcile uncertain batches before clearing storage. Synthetic tests do not prove live provider behavior.
