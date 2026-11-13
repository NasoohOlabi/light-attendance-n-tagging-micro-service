# Application roles

Managed Neon Auth signs users in. A separate server-owned `app_accounts` row approves one of three application roles; new signups cannot choose or grant a role.

| Capability                               | Administrator       | Teacher                                   | Student                                  |
| ---------------------------------------- | ------------------- | ----------------------------------------- | ---------------------------------------- |
| Attendance                               | All active students | Assigned active students                  | Own effective attendance only, read-only |
| Tagged notes and corrections             | Full notebook       | Assigned notebook, subject to access mode | No access                                |
| Account approval, roles, disable         | Other accounts      | No access                                 | No access                                |
| Canonical roster and teacher assignments | Manage              | Read assigned roster                      | No roster access                         |

Teachers retain read/write mode, active state and optional expiry. Student links require one existing active roster record; one student record cannot be linked to multiple sign-in accounts. Students see their name/group and attendance date/status, without notes, raw events, staff names, correction reasons or other students. Historical attendance follows the student's current assignment for staff; student access follows the stable linked student ID.

The Administrator's **Administration** destination provides account approval, a student-link selector and roster editing in Arabic and English. Existing signups appear as pending. Select the role, required identity/access fields, then **Save role**. A Student must be linked to the correct roster entry. Teacher assignment choices include approved active Teachers. The owner can bootstrap/recover an Administrator through the private CLI described in [Neon setup](neon-setup.md); no personal email is embedded in application code or SQL.

The Function checks role, active state and expiry on every request. Browser hiding is supplementary: Student and Teacher requests to administrative endpoints are denied, and Student requests to notebook/event endpoints are denied. A 401/403 removes the current private UI. An already downloaded view cannot be retracted until the next request; there is no live revocation notification.

Schema migration `002-application-roles.sql` adds the role mapping and backfills existing Teachers idempotently. Staff rows remain when roles change because immutable events reference their actor identity. Application APIs append events and never rewrite history. The fourth table is required for a unique role per Auth identity without duplicating role state across teacher and student records.

Validation includes API boundary tests, synthetic desktop/phone role UI flows and the explicit live Neon verifier. Real provider checks create only synthetic accounts and records and remove them afterward. Administrator directory reads currently stop at 1,000 accounts; pagination is deferred until this small deployment needs it. These application roles do not grant Neon project ownership or database login roles.
