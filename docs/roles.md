# Application roles

Better Auth establishes identity; `app_accounts` grants a server-owned role. Signup alone grants no data access. Each request checks the account's active state and expiry.

### Switch between signed-in accounts

Open **Profile → Sign in to another account**. Enter the invited user's username and password, or choose **Sign in with email** for an email account. Cancel returns to the current workspace. For a new invitation, finish the first-login form to open that person's workspace.

Open **Profile** again and select a saved name to switch back. Each name includes its username or email, and **Current account** marks the identity in use. This browser can keep up to five signed-in accounts. Switching opens the selected account's default workspace and updates other open app tabs. **Sign out** removes the current account. Other valid accounts remain available on the sign-in screen.

### Invite a user

Open **Settings → Accounts → Create accounts**. Enter a first name and last name, choose the role, and select **Create account**. Teacher is preselected. Create one account at a time.

Use **Copy message** and send the message privately to the recipient. The screen confirms when it was copied. If the browser blocks clipboard access, copy the selected message manually. The message opens username sign-in and includes the recipient's initial username and temporary password. Leaving the screen clears the displayed message. If the creation response is lost, **Retry safely** uses the same request. Check Accounts for the username and use its password reset if the account was created.

At first sign-in the recipient enters their phone number and date of birth, chooses a personal password, and can edit their username. They sign in again with the new credentials. **Profile settings** lets them change those details later. A student invitation creates a fresh, unassigned roster record. To connect someone to an existing student, use the existing signup and account-grant flow and select the correct roster record.

| Role          | Access                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Administrator | Full notebook; approve, disable and assign roles; manage students and assignments; reset another credential user's password.                                 |
| Teacher       | Read and edit attendance, notebook notes and student information for active assigned students. Grades and roster assignments require the Administrator role. |
| Student       | Own effective attendance dates and statuses only; no notes, raw events, peers or staff details.                                                              |

Settings is an explicit destination. The Administrator starts on the notebook dashboard. Choosing Teacher grants the role's standard access, including for accounts with a legacy access mode. A Student account links to one roster student. The server denies administrative endpoints to Teachers and Students and notebook/event endpoints to Students. The acting Administrator cannot change, disable or reset their own account through the browser. Use the private CLI for bootstrap and recovery.

To reset another account, open **Settings → Accounts → Manage → Reset password**. The server generates a temporary password, replaces the previous password and signs the recipient out of existing sessions. Select **Copy message** to copy the sign-in link, username or email, and temporary password. Send it privately to the recipient. Closing the box clears the displayed password. The password works until it is changed or reset again. Invited accounts that still need setup finish it using the new password.

Access changes take effect on the next request, not by push; already downloaded data cannot be retracted. The administrator directory is limited to 1,000 accounts. See [Railway setup](railway-setup.md) for provisioning and [architecture](architecture.md) for event semantics.

The Settings action opens account roles and roster management at `view=settings`; older `view=administration` links remain compatible. Its text label appears on desktop, with the accessible gear retained on phones. Settings and Add student retain the notebook navigation, so Dashboard, Attendance and Courses remain directly reachable. Settings separates **Accounts** and **Students**. Accounts lists other identities as compact rows; open **Manage** to edit a role, access or password. The acting Administrator's account is omitted from this directory rather than shown as a disabled form. If no other identities exist, the directory shows **No other accounts.** Server-side self-protection still applies.

Administrators open **History & corrections** from **Profile → Settings**. The course picker includes closed courses and **Previous / no course** for unscoped records. Search can find inactive students' historical records. Opening a course name and choosing **History** opens the same screen scoped to that course. Saved `tab=history` URLs open the new screen for Administrators. Teachers keep the attendance history on their assigned student profiles, and Students keep their own attendance portal.

Decision-author links open Settings with the selected `account` query value. Other accounts open their existing management controls. The acting administrator's own account shows their current profile name and email in a read-only view. Direct reload retains the selected destination, and an unknown account shows an unavailable message. The ordinary Accounts directory continues to omit the acting administrator.

Dashboard **Add student** opens a separate student destination that never renders account management, including after saving or canceling. Entry and reload without an explicit Settings link open the notebook dashboard.

The Administrator student table is hidden while the new-student form is open. Saving or canceling a standalone registration shows the table again. The table has separate **First name**, **Last name**, **Level**, **Active** and **Actions** columns. First and last names are saved independently; a last name may be blank. The combined name remains available to the notebook and existing history through the same student ID. Legacy full names are shown intact in First name with Last name blank until explicitly edited; no automatic name splitting occurs. Level displays the existing roster group value. On phones and compact screens, each record uses separate labelled fields in a vertical layout with Edit directly available and no horizontal scrolling.

My attendance opens with the latest recorded dates first. When today has no mark, the portal says so. The student portal keeps the student's name and explicitly labelled roster level in separate fields. That roster level does not describe every course. Account-link selectors contain names only. Student snapshot history likewise separates name, level and active state while preserving the underlying event and its raw record details.
