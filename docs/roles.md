# Application roles

Better Auth establishes identity; `app_accounts` grants a server-owned role. Signup alone grants no data access. Each request checks the account's active state and expiry.

### Invite a user

Open **Settings → Accounts → Create accounts**. Enter a first name and last name, choose the role, and select **Create account**. Teacher is preselected. To import teachers, paste two spreadsheet columns (first name and last name, without headings), preview the names, and create up to 50 accounts at once.

Use **Copy message** for each recipient and send it privately. The message opens username sign-in and includes that person's initial username and temporary password. Leaving the screen clears the displayed messages. If the creation response is lost, **Retry safely** uses the same request. Check Accounts for the username and use its password reset if the account was created.

At first sign-in the recipient enters their phone number and date of birth, chooses a personal password, and can edit their username. They sign in again with the new credentials. **Profile settings** lets them change those details later. A student invitation creates a fresh, unassigned roster record. To connect someone to an existing student, use the existing signup and account-grant flow and select the correct roster record.

| Role          | Access                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Administrator | Full notebook; approve, disable and assign roles; manage students and assignments; reset another credential user's password.                                                         |
| Teacher       | Active assigned students and their history, subject to active state, expiry and read/write mode. Write-only access does not support the interactive notebook because it needs reads. |
| Student       | Own effective attendance dates and statuses only; no notes, raw events, peers or staff details.                                                                                      |

Settings is an explicit destination; the Administrator starts on the notebook dashboard. A Student account links to one roster student. The server denies administrative endpoints to Teachers and Students and notebook/event endpoints to Students. The acting Administrator cannot change, disable or reset their own account through the browser; use the private CLI for bootstrap and recovery. Password reset uses matching 8 to 128 character fields, hashes the password and invalidates the target's sessions; no SMTP is required.

Access changes take effect on the next request, not by push; already downloaded data cannot be retracted. The administrator directory is limited to 1,000 accounts. See [Railway setup](railway-setup.md) for provisioning and [architecture](architecture.md) for event semantics.

The Settings action opens account roles and roster management at `view=settings`; older `view=administration` links remain compatible. Its text label appears on desktop, with the accessible gear retained on phones. Settings and Add student retain the notebook navigation, so Dashboard, Attendance and Courses remain directly reachable. Settings separates **Accounts** and **Students**. Accounts lists other identities as compact rows; open **Manage** to edit a role, access or password. The acting Administrator's account is omitted from this directory rather than shown as a disabled form. If no other identities exist, the directory shows **No other accounts.** Server-side self-protection still applies.

Administrators open **History & corrections** from **Profile → Settings**. The course picker includes closed courses and **Previous / no course** for unscoped records. Search can find inactive students' historical records. The course row's **History** action opens the same screen for that course. Saved `tab=history` URLs open the new screen for Administrators. Teachers keep the attendance history on their assigned student profiles, and Students keep their own attendance portal.

Decision-author links open Settings with the selected `account` query value. Other accounts open their existing management controls. The acting administrator's own account shows their current profile name and email in a read-only view. Direct reload retains the selected destination, and an unknown account shows an unavailable message. The ordinary Accounts directory continues to omit the acting administrator.

Dashboard **Add student** opens a separate student destination that never renders account management, including after saving or canceling. Entry and reload without an explicit Settings link open the notebook dashboard.

The Administrator student table is hidden while the new-student form is open. Saving or canceling a standalone registration shows the table again. The table has separate **First name**, **Last name**, **Level**, **Active** and **Actions** columns. First and last names are saved independently; a last name may be blank. The combined name remains available to the notebook and existing history through the same student ID. Legacy full names are shown intact in First name with Last name blank until explicitly edited; no automatic name splitting occurs. Level displays the existing roster group value. On phones and compact screens, each record uses separate labelled fields in a vertical layout with Edit directly available and no horizontal scrolling.

The student portal keeps the student's name and explicitly labelled roster level in separate fields. That roster level does not describe every course. Account-link selectors contain names only. Student snapshot history likewise separates name, level and active state while preserving the underlying event and its raw record details.
