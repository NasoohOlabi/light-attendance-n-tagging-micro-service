# Application roles

Better Auth establishes identity; `app_accounts` grants a server-owned role. Signup alone grants no data access. Each request checks the account's active state and expiry.

| Role          | Access                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Administrator | Full notebook; approve, disable and assign roles; manage students and assignments; reset another credential user's password.                                                         |
| Teacher       | Active assigned students and their history, subject to active state, expiry and read/write mode. Write-only access does not support the interactive notebook because it needs reads. |
| Student       | Own effective attendance dates and statuses only; no notes, raw events, peers or staff details.                                                                                      |

Settings is an explicit destination; the Administrator starts on the notebook dashboard. A Student account links to one roster student. The server denies administrative endpoints to Teachers and Students and notebook/event endpoints to Students. The acting Administrator cannot change, disable or reset their own account through the browser; use the private CLI for bootstrap and recovery. Password reset uses matching 8 to 128 character fields, hashes the password and invalidates the target's sessions; no SMTP is required.

Access changes take effect on the next request, not by push; already downloaded data cannot be retracted. The administrator directory is limited to 1,000 accounts. See [Railway setup](railway-setup.md) for provisioning and [architecture](architecture.md) for event semantics.

The Settings action opens account roles and roster management at `view=settings`; older `view=administration` links remain compatible. Its text label appears on desktop, with the accessible gear retained on phones. Settings and Add student retain the notebook navigation, so Dashboard, Attendance and Courses remain directly reachable. Settings separates **Accounts** and **Students**. Accounts lists other identities as compact rows; open **Manage** to edit a role, access or password. The acting Administrator's account is omitted from this directory rather than shown as a disabled form. If no other identities exist, the directory shows **No other accounts.** Server-side self-protection still applies.

Dashboard **Add student** opens a separate student destination that never renders account management, including after saving or canceling. Entry and reload without an explicit Settings link open the notebook dashboard.

The Administrator student table has separate **First name**, **Last name**, **Level**, **Active** and **Actions** columns. First and last names are saved independently; a last name may be blank. The combined name remains available to the notebook and existing history through the same student ID. Legacy full names are shown intact in First name with Last name blank until explicitly edited; no automatic name splitting occurs. Level displays the existing roster group value. On phones and compact screens, each record uses separate labelled fields in a vertical layout with Edit directly available and no horizontal scrolling.

The student portal keeps the student's name and explicitly labelled roster level in separate fields. That roster level does not describe every course. Account-link selectors contain names only. Student snapshot history likewise separates name, level and active state while preserving the underlying event and its raw record details.
