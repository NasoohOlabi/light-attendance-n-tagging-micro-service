# Application roles

Sign in with your verified phone number and password. Syrian mobile numbers can start with `09` or `+9639`. Administrators create accounts by invitation. Better Auth establishes identity, and `app_accounts` grants a server-owned role. Each request checks the account's active state and expiry.

### Switch between signed-in accounts

Open **Profile → Sign in to another account** and enter that account's phone number and password. Cancel returns to the current workspace. For a new invitation, finish the first-login form to open that person's workspace.

Open **Profile** again and select a saved name to switch back. Each name includes the sign-in phone number. **Current account** marks the identity in use. This browser can keep up to five signed-in accounts. Switching opens the selected account's default workspace and updates other open app tabs. **Sign out** removes the current account. Other valid accounts remain available on the sign-in screen.

### Invite a user

Open **Settings → Accounts → Create accounts**. Enter the recipient's name and phone number and choose their role. Teacher is preselected. Ask the recipient directly whether the number is theirs, then select **Confirm phone number after asking directly** and **Create account**. Each invitation uses one verified sign-in number. The form accepts Syrian mobile numbers beginning with `09` and international numbers with `+` or `00`.

Use **Copy message** and send the message privately to the recipient. The message contains the phone sign-in link, their number and their temporary password. If the browser blocks clipboard access, copy the selected message manually. Leaving the screen clears the message. If the creation response is lost, **Retry safely** uses the same request. Look up the phone number under Accounts and reset its password if the account was created.

At first sign-in the recipient replaces the temporary password. Student and Administrator invitations also ask for a date of birth. The recipient signs in again with the same phone number and their new password. **Profile settings** lets them update personal details. A student invitation creates a fresh, unassigned roster record. To link an account to an existing student, select the correct roster record under **Accounts → Manage**.

| Role          | Access                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Administrator | Full notebook; approve, disable and assign roles; manage students and assignments; reset another credential user's password.                                 |
| Teacher       | Read and edit attendance, notebook notes and student information for active assigned students. Grades and roster assignments require the Administrator role. |
| Student       | Own effective attendance dates and statuses only; no notes, raw events, peers or staff details.                                                              |

Settings is an explicit destination. The Administrator starts on the notebook dashboard. Choosing Teacher grants the role's standard access, including for accounts with a legacy access mode. A Student account links to one roster student. The server denies administrative endpoints to Teachers and Students and notebook/event endpoints to Students. The acting Administrator cannot change, disable or reset their own account through the browser. Use the private CLI for bootstrap and recovery.

To change a teacher's or another account's sign-in phone, open **Settings → Accounts → Manage**. Confirm the new number directly with the account holder and save it with the phone verification button. A change signs the account out of existing sessions. Use the private CLI to change the acting administrator's phone.

To reset another account, verify its sign-in phone and select **Reset password** under **Manage**. The server generates a replacement and signs the recipient out of existing sessions. **Copy message** includes the sign-in link, verified phone number and replacement password. Send the message privately. Closing the box clears the displayed password. The password works until it is changed or reset again. Invited accounts that still need setup finish it using the new password.

Access changes take effect on the next request, not by push; already downloaded data cannot be retracted. The administrator directory is limited to 1,000 accounts. See [Railway setup](railway-setup.md) for provisioning and [architecture](architecture.md) for event semantics.

The Settings action opens account roles and roster management at `view=settings`. Older `view=administration` links remain compatible. Its text label appears on desktop, with the accessible gear retained on phones. Settings and Add student retain the notebook navigation, so Dashboard, Attendance and Courses remain directly reachable. One Settings navigation row links **Accounts**, **Students** and **History & corrections** and underlines the current section. Each destination supports browser Back and reload. Accounts lists other identities as compact rows. Open **Manage** to edit a role, access or password. The directory omits the acting Administrator and shows **No other accounts.** when there are no other identities. Server-side self-protection still applies.

Administrators open **History & corrections** from **Profile → Settings**. The course picker includes closed courses and **Previous / no course** for unscoped records. Search can find inactive students' historical records. Opening a course name and choosing **History** opens the same screen scoped to that course. Saved `tab=history` URLs open the new screen for Administrators. Teachers keep the attendance history on their assigned student profiles, and Students keep their own attendance portal.

Decision-author links open Settings with the selected `account` query value. Other accounts open their existing management controls. The acting administrator's own account shows their current profile name and email in a read-only view. Direct reload retains the selected destination, and an unknown account shows an unavailable message. The ordinary Accounts directory continues to omit the acting administrator.

Dashboard **Add student** opens a separate student destination that never renders account management, including after saving or canceling. Entry and reload without an explicit Settings link open the notebook dashboard.

The Administrator student table is hidden while the new-student form is open. Saving or canceling a standalone registration shows the table again. The table has separate **First name**, **Last name**, **Level**, **Active** and **Actions** columns. First and last names are saved independently; a last name may be blank. The combined name remains available to the notebook and existing history through the same student ID. Legacy full names are shown intact in First name with Last name blank until explicitly edited; no automatic name splitting occurs. Level displays the existing roster group value. On phones and compact screens, each record uses separate labelled fields in a vertical layout with Edit directly available and no horizontal scrolling.

My attendance opens with the latest recorded dates first. When today has no mark, the portal says so. The student portal keeps the student's name and explicitly labelled roster level in separate fields. That roster level does not describe every course. Account-link selectors contain names only. Student snapshot history likewise separates name, level and active state while preserving the underlying event and its raw record details.
