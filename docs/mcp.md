# Wartaq MCP

Add `https://wartaqi.up.railway.app/mcp` as a remote Streamable HTTP server in your MCP client. Choose OAuth if prompted. Sign in with your verified phone number, existing email or older invitation username, check the selected account and requested permissions, then approve the connection. An approved application role is required for notebook access.

## Permissions

| OAuth scope      | Access                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| `mcp:read`       | View your account and the records and reports available to your role.                                 |
| `mcp:write`      | Make the changes available to your role. Admin mutations and offline conflict checks use both scopes. |
| `offline_access` | Refresh access while the originating Wartaq session remains valid.                                    |

Teachers can read and edit attendance, notebook notes and profile fields for active assigned students. Students see their own effective attendance and can manage their own profile. Administrators manage accounts, the full student register, courses, enrollment, scores, thresholds, handbook receipt and final grade decisions. Only grant write access to a client you trust. Use Wartaq's Accounts screen to generate a password reset message privately.

## Tools

- `get_account`, `get_profile`, `update_profile` and `update_invitation_profile` cover account and profile settings. The invitation tool asks for the current password.
- `get_my_attendance` serves the Student portal. Staff use `get_notebook` for the authorized roster, courses, event history and tagged notes and `get_attendance_summary` for effective marks and notes.
- `append_events` records attendance, notes and corrections. Use the same event ID, time and payload for an exact retry. Use `sync_attendance` or `sync_student` when submitting attendance or phone changes against a previously read version. `update_student` saves profile information for an active student within the caller's scope.
- `get_admin_board`, account grant/disable/invite/reset tools, roster tools, and course and enrollment tools use the same restrictions as Settings and Courses.
- `export_course_report` returns course data as rows or an Excel workbook with the site's report filters. Attendance chart rendering, sharing, offline device storage and display preferences run in the browser.

## Private invitation messages

Create an invitation with `invite_accounts` after the administrator confirms each phone number directly with its recipient. Each person in the request needs a `phone` and `phoneConfirmed: true`. Select **Open private invitation** in the MCP app card, or open the Wartaq link returned by the tool. On your phone or desktop browser, sign in as the same Wartaq administrator who created it, then choose **Reveal invitation** and copy each recipient's message. MCP returns only a link and its reference. Wartaq delivers the message directly to your signed-in browser.

The link can reveal the message once within 15 minutes. Copy it before leaving the page. If the link is unavailable or the account was created before this feature, use **Settings → Accounts → Manage → Reset password** for the existing account to generate a fresh copyable message. This replaces the old password and revokes the recipient's sessions.

## Protocol and local verification

The server supports OAuth authorization-code flow with S256 PKCE, HTTPS client ID metadata documents and dynamic client registration. It advertises the issuer through protected-resource metadata, binds access tokens to `/mcp`, supports DPoP and rotating refresh tokens, and accepts token revocation. Signing out of the originating Wartaq session ends the connection. Role and roster changes apply on the next call.

For a local client, use the configured Bun origin followed by `/mcp`. Apply the Railway Auth and application migrations to a disposable database, then set `TEST_RAILWAY_DATABASE_URL` and run `bun test tests/mcp-integration.test.ts`. This covers the MCP resource and tool result, role and browser-session checks, encrypted storage, expiry, and one-time redemption. `e2e/invitations.spec.ts` checks the browser viewer and clipboard in English and Arabic. Use synthetic accounts and keep traces off. The link works independently of the MCP client's support for interactive UI.
