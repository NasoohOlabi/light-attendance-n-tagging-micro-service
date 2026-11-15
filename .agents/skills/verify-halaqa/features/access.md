# Access and delivery

Sign in through the app or explore the sample. Run `e2e/neon.spec.ts` for synthetic same-origin Auth/API sign-in, session restoration, account changes, failed and uncertain requests, retry, unavailable or corrupt pending storage, competing tabs and malformed snapshots. Assert that failed storage or a held lock prevents unsafe additional writes and that retry retains event IDs. Run `e2e/roles.spec.ts` for approval, denied access, role isolation and Administrator password reset; confirm the acting Administrator cannot reset their own account.

Pending batches can contain private data. Web Locks and storage are required for safe live saves; reconcile uncertain batches before clearing storage. Synthetic tests do not prove live provider behavior.

Administrator entry and reload start on the dashboard. Open **Settings** using the gear; assert the Settings heading and role forms there. Verify both `view=settings` and the older `view=administration` link. Open **Add student** from the dashboard, save or cancel, and confirm Accounts/role controls stay absent from that destination. Teachers and Students cannot open Settings.
