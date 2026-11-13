# Setup: Halaqa notebook with SheetDB

**Preserved prototype notes, not a deployment-ready runbook.** Development stopped at the user's request. Read [feasibility](feasibility.md), [agent access](agent-access.md) and [implementation plan](implementation-plan.md) before using these instructions. Provider provisioning, bearer rotation and browser workflows have not been verified against a live account. These instructions do not authorize executing them now.

## What you run

Teachers use one static website on GitHub Pages. Their browsers talk directly to SheetDB. You run the access manager on your Windows computer only when managing users. Closing the manager does not affect teacher access. Google login is only needed by you when connecting your spreadsheet to SheetDB; teachers never sign into Google.

The new repository is `D:\Masjid\main-production-work\pages-sheetdb`. The original project remains separate and unchanged by this task. Its current working copy, including authorized uncommitted improvements, is preserved in this repository's first commit. Private environment files, credentials and student CSVs were excluded. This fork's active feature set is attendance, tagged notes and roster management.

## 1. Run locally

Install Bun if needed, then in PowerShell:

```powershell
Set-Location D:\Masjid\main-production-work\pages-sheetdb
bun install
bun run dev
```

Open `http://127.0.0.1:5173/`. Choose **Explore with sample students** to exercise attendance, notes, students, summaries and corrections without network access to SheetDB. The demo is memory-only and never combines with a real session. In another terminal, run `bun run manager` and open **http://127.0.0.1:4174/**. Use exactly that address; the manager intentionally rejects other hosts and cross-origin requests.

No `.env.local`, Firebase project, OAuth client or Google API key is needed. T3 Code has this folder registered as **Pages SheetDB**, with Teacher app, Access manager and Verify scripts.

## 2. Create a dedicated spreadsheet

Create a new Google spreadsheet for this notebook. Create a tab named **Events**. Paste this tab-separated line into A1 (the manager also has a copy button):

```text
id	actor	client_time	received_at	payload
```

Keep those exact column names. Do not sort or rearrange the physical Events rows: sheet order is the event sequence. Use another tab, filters without reordering, or a spreadsheet copy for analysis. `payload` contains a version-one JSON event. Notes are plain strings inside it, so arbitrary note formats and Arabic remain intact.

Use a dedicated spreadsheet rather than exposing a production workbook containing unrelated private tabs. SheetDB credentials generally apply to their API, not to a single UI-selected tab. The browser's `sheet=Events` parameter is not an access boundary.

## 3. Configure SheetDB access

1. Connect that spreadsheet in your SheetDB account.
2. Create one API endpoint per teacher, all targeting the same spreadsheet, if your account supports multiple APIs for it. A separate manager/owner endpoint is optional if you also want to submit records as yourself.
3. For every endpoint enable only **Read** and **Create**. Disable **Update**, **Delete**, **Create tabs**, **Delete tabs**, and any other mutation permissions. Search is unnecessary for this app.
4. Enable bearer authentication. Copy the API endpoint ID and bearer token from its settings.
5. Configure CORS to allow your GitHub Pages origin (for example `https://your-name.github.io`) and `http://127.0.0.1:5173` while developing. Allow the Authorization and Content-Type headers and GET/POST requests. Follow the options actually offered by SheetDB's panel.
6. Repeat for the five teachers. Test your plan's endpoint allowance before distributing links. Separate endpoints and Global API management may require a paid plan. Check the current plan limits in your account.

SheetDB documents one unique bearer token per API. This app does not invent independently revocable user tokens for a shared endpoint. The manager rejects assigning one active endpoint to two usernames. If your plan cannot provide five endpoints to this spreadsheet, confirm that limitation before choosing a shared credential; it would make rotation and revocation affect everyone sharing it. No such shared-credential fallback is enabled here.

Official references: [authentication](https://docs.sheetdb.io/authentication), [permissions](https://docs.sheetdb.io/permissions), [CORS](https://docs.sheetdb.io/cors), [Global API authentication](https://docs.sheetdb.io/global-api/authentication).

## 4. Issue each personal link

In the local manager:

1. Save the teacher website URL. Use `http://127.0.0.1:5173/` for your own local test; use the GitHub Pages URL before sending links to teachers.
2. Enter the exact username/teacher name, their endpoint ID, bearer token, and `Events` tab.
3. Confirm the endpoint permissions you set in SheetDB.
4. Select **Check access & save user**. This checks authenticated reads, the five headers, and rejection of unauthenticated reads. It does not attempt deletes or updates to probe permissions.
5. Select **Get link**, copy it and send it privately yourself. The manager does not send messages.

A link contains the username, endpoint ID, bearer token and tab in `#access=…`. The fragment is not sent to the GitHub Pages server. It is removed from the address bar before rendering, and the credential is kept in session storage for reloads in that tab. The original message/link remains a credential; keep it private. Base64url is encoding, not encryption. Closing the session removes the browser's saved credential. Reopen the original link to return.

The app stamps the username on every submitted event and offers no teacher picker. As agreed, this is a trust-based identity: someone able to modify the link or call SheetDB directly can forge the actor. It is not signed identity, a one-use email login or a server-enforced expiry system.

## 5. Add the roster and use the notebook

Open your own configured link, or a teacher link while testing. In **Students**, add names and groups. Names and notes accept Arabic. Each student gets a stable generated ID, so renaming a student does not break their history. Existing production data is not automatically imported.

- **Attendance:** choose the actual date, filter by group, mark statuses and save. Unmarked students are excluded, not assumed absent. A later status for the same student/date supersedes the earlier status.
- **Notes:** select a student or General note, supply tags separated by commas (Arabic comma also supported), and enter free text, JSON or your own feature-specific format. Tags normalize to lowercase; text is preserved.
- **Summary:** choose date bounds. Totals reflect latest unreversed attendance per student/day. Notes count by student and date.
- **History & corrections:** select Undo, provide a reason, and append the correction. Nothing is deleted. Undoing the latest attendance reveals the prior status if one exists. To replace a note, undo it and add the corrected note.
- **Students:** changes to names, groups and active status append new roster snapshots. Use Include inactive to see inactive students again.

After another teacher saves, use **Refresh** to load changes. There is no continuous polling or offline sync service. If a request has an uncertain outcome, the app retains a pending batch with original IDs in browser local storage. **Retry pending batch** first reads current IDs and sends missing records. Projection deduplicates IDs if the provider still accepts the same batch twice. Physical duplicate rows can exist. Do not clear browser storage before resolving a pending batch. Normal unsaved form drafts are not persisted.

## 6. Refresh, replace or revoke access

SheetDB's published Global API exposes list/create/delete API operations; it does **not document a bearer-token refresh/rotation endpoint**. This manager deliberately does not simulate rotation locally.

**Rotate a token on the same endpoint, if supported:** first verify that the SheetDB dashboard provides a rotation/regeneration control and invalidates the old bearer. Public documentation does not establish that control. If verified, use it, then choose Replace token for the teacher, paste the new token, confirm permissions and save. Send the newly generated link. Merely changing the manager's saved copy does not revoke anything. A currently open teacher tab continues using the old credential until it opens the new link. If rotation is unavailable, replace the API endpoint instead.

**Revoke one teacher:** use Revoke with a loaded Global API key, type the endpoint ID, and confirm. This deletes the SheetDB API endpoint, not the spreadsheet or its rows. Without Global API access, delete the endpoint in SheetDB first, then select the manager's manual confirmation checkbox. Manual confirmation accepts only a response demonstrating rejected credentials or a missing endpoint (401/404/410); a generic 403 might mean only reads were disabled, so it is not sufficient evidence of revocation.

**Replace the endpoint:** revoke the old endpoint first, create/configure a new one and save it for the same username. History remains in the same spreadsheet. A new endpoint means pending batches in the old browser session are not automatically migrated; inspect and reconcile them before retiring that session.

**Optional account tools:** the prototype accepts a SheetDB App ID and management API key and keeps them in the Bun process's memory. The public OpenAPI also supports an optional bearer/Basic factor for Global keys; the prototype does not implement that yet. Create endpoint sends explicit `read,create` permissions but does not configure bearer authentication or retrieve its token. Verify those dashboard steps before issuing access. If creation times out, check the provider dashboard before repeating it, because an endpoint may already have been created.

References: [list APIs](https://docs.sheetdb.io/global-api/get-all-apis), [create API](https://docs.sheetdb.io/global-api/create-new-api), [delete API](https://docs.sheetdb.io/global-api/delete-api).

## 7. Publish on GitHub Pages

The repository is local and has no remote. Create a new GitHub repository under the intended account, then attach it and push. Do not reuse the original production remote.

```powershell
git remote add origin https://github.com/YOUR-ACCOUNT/pages-sheetdb.git
git push -u origin main
```

In GitHub **Settings → Pages → Build and deployment**, choose **GitHub Actions**. Run the GitHub Pages workflow, or push to main after enabling Pages. The workflow installs the locked Bun dependencies, runs tests/lint/build, and uploads only `dist`. The Vite relative base supports repository subpaths. No SheetDB credentials are configured in GitHub secrets or source files. The manager, `.local` directory and work logs are outside the deployment artifact.

Use the resulting HTTPS site URL in the local manager and regenerate links. Reopen one on a separate device to confirm CORS and credentials. Complete one real attendance save, read it back in another session, append a correction and verify the raw sheet still contains both. This live check needs your actual SheetDB account and is not replaced by the sample notebook or mocked transport tests.

## 8. Recovery and privacy

Back up the spreadsheet and `.local/manager.json` separately. The latter contains plaintext teacher credentials and is ignored by Git; protect it with your Windows account permissions and device encryption. Global management keys are not saved there. The manager binds only to 127.0.0.1 and checks Host, Origin and a custom request header before mutations.

Events include `client_time` and `received_at`. The app requests SheetDB's `DATETIME` sentinel for the latter. This helps normal recovery, but a direct API caller can supply arbitrary fields, including timestamps and usernames. Trust physical sheet order, provider logs and independent backups for incident recovery. Append-only permissions prevent overwriting existing rows; they do not prevent abusive additions, forged corrections, quota consumption or client-supplied formulas through calls outside this app. This app writes RAW values so its own inputs are not parsed as formulas.

For an incident, revoke the affected endpoint, copy the sheet, identify the suspicious append range, and restore the intended view using explicit reversals or an owner-maintained clean copy. Never sort the primary ledger or rely solely on a timestamp cutoff to prove authenticity.

Read [architecture.md](architecture.md) for schema, ordering, extension points and verification. No live SheetDB credentials or GitHub destination were supplied during implementation, so provisioning and publication remain account setup steps.
