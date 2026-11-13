# SheetDB feasibility research

Retrieved **2026-11-13** (Asia/Damascus). Research only: official SheetDB documentation, first-party guides/pricing, and its OpenAPI specification. No login, credentials, account inspection, API experiments, or live writes. The stopped prototype is not evidence of supported behavior.

## Decision

**Conditionally feasible for five trusted teachers sharing attendance and tagged notes.** Prefer five independently protected spreadsheet APIs, one per teacher, allowing read/create only; enable search only if server-side search is later needed. Treat personal links as transferable access credentials, not verified identities. A local access manager can organize manually provisioned credentials; fully automated issuance, rotation, and expiry remain unproven. SheetDB recommends bearer authentication, assigns a unique token per API, and supports operation permissions. [Authentication](https://docs.sheetdb.io/authentication), [permissions](https://docs.sheetdb.io/permissions).

## Three separate credential systems

| Mechanism               | Documented purpose and scope                                                                                                   | Consequence                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Spreadsheet bearer      | `Authorization: Bearer â€¦` for one `/api/v1/{API_ID}`; obtained from that API's settings. Authentication must be enabled.     | Appropriate teacher credential; five independently managed identities suggest five APIs, not five invented tokens on one API. [Source](https://docs.sheetdb.io/authentication) |
| Global App ID + API key | Account management through `/api/v1/{APP_ID}/{API_KEY}/â€¦`; keys have configurable permissions.                               | Keep exclusively in the local manager's server process; never distribute in teacher links. [Source](https://docs.sheetdb.io/global-api/authentication)                         |
| Official MCP OAuth      | `https://sheetdb.io/mcp`, Streamable HTTP, OAuth 2.1, PKCE, dynamic registration, scope `mcp:use`; Google sign-in and consent. | A separate agent connection, requiring neither teacher bearer nor Global key. [Source](https://docs.sheetdb.io/ai-agents/mcp-server)                                           |

**Lifetime:** the spreadsheet-authentication and Global-authentication guides specify no token lifetime, refresh protocol, expiry selection, or rotation/revocation API. Do not translate this into â€œnever expiresâ€‌ or â€œcannot rotate.â€‌ The precise dashboard behavior needs confirmation. Disabling authentication is not revocation: it removes the credential requirement. [Spreadsheet authentication](https://docs.sheetdb.io/authentication), [Global authentication](https://docs.sheetdb.io/global-api/authentication).

For OAuth, the public MCP documentation does not specify access-token lifetime or refresh-token behavior. It does document immediate sign-out when an Agent connection is revoked in the panel. Pending-action expiryâ€”five minutes for chat approval, fifteen for panel approvalâ€”is a different mechanism, not credential expiry. [MCP overview](https://sheetdb.io/mcp).

## Management capabilities and OpenAPI audit

Documented Global operations, relative to `/api/v1/{APP_ID}/{API_KEY}`:

- `GET /list`: lists account APIs with IDs, URLs, spreadsheet identifiers, and creation dates; its example does not return bearer secrets. [List](https://docs.sheetdb.io/global-api/get-all-apis).
- `POST /create`: takes an existing spreadsheet `url` and optional comma-separated `permissions`; explicitly request `read,create` for this app. Omitting permissions enables create/read/update/delete/search. The documented response contains success/name/id/url, not a bearer. `POST /create/json` creates a spreadsheet and API from hosted JSON; it is unnecessary here. [Creation](https://docs.sheetdb.io/global-api/create-new-api).
- `DELETE /delete/{API_ID}`: removes the SheetDB API without deleting the spreadsheet. This offers endpoint revocation, subject to validating propagation and isolation. [Deletion](https://docs.sheetdb.io/global-api/delete-api).

**OpenAPI inspection:** version 3.1.0 contains 22 paths and 28 operations. Beyond the inspected guide chapters it exposes `GET /`, query-form `DELETE /{api_id}`, `DELETE /{api_id}/row_index/{row}`, and `POST /{api_id}/import/url`. None supplies credential management. Global keys may separately allow list/create/delete and require an additional bearer or Basic factor. `CreateApiBody` contains only `url` and `permissions`; creation/list schemas expose no bearer. No credential issue/read/rotate/revoke/refresh/settings route, or credential expiry field such as `expires_at`/`expires_in`, appears. This establishes absence from the published contract, not absence from the service. Import uses create permission, broadening the allowed write surface beyond the ordinary append route. [OpenAPI](https://sheetdb.io/openapi.json), [delete guide](https://docs.sheetdb.io/sheetdb-api/delete), [other-methods guide](https://docs.sheetdb.io/sheetdb-api/other).

Recommendation: make the first local manager an inventory/link generator with manual token entry. Add Global list/create/delete only if useful enough to justify its tier, and retain dashboard steps for bearer enablement and retrieval until a supported automation interface is demonstrated. Local â€œdisabledâ€‌ or â€œexpiresâ€‌ flags cannot block direct requests to SheetDB; actual expiry needs an enforced provider operation or an always-online enforcement service. This is a design inference from the documented authentication boundary. [Authentication](https://docs.sheetdb.io/authentication), [Global deletion](https://docs.sheetdb.io/global-api/delete-api).

## Official agent recommendation

Use official OAuth MCP for an administrator's future research/inspection and explicitly authorized data work. Agents start read-only; effective access intersects API permissions with agent permissions. MCP is included on every plan, with an additional 30-tool-calls/minute limit per connection. [MCP documentation](https://docs.sheetdb.io/ai-agents/mcp-server).

Its ten documented tools include listing/describing APIs, reading/searching/appending/updating/deleting records, pending-action handling, and creating an API from a spreadsheet URL. No documented tool deletes an API, changes permissions, generates/reads/rotates bearer credentials, or manages Global keys. Explicit exclusions include tab management, single cells, JSON import, cache purge, statistics, and CSV export. Consequently, official MCP is not a complete access-management MCP; a custom local wrapper could expose supported Global operations, but would not fill missing provider capabilities. [Tool inventory](https://docs.sheetdb.io/ai-agents/mcp-server), [MCP overview](https://sheetdb.io/mcp).

## Five endpoints, one spreadsheet, and cost

There is **positive first-party evidence**, not just an inference: SheetDB's WordPress guide explicitly recommends creating a second API for the same spreadsheet with different permissions. Extending that to five endpoints is plausible within plan limits; independent token/revocation behavior and cross-endpoint freshness still need validation. [Official example](https://sheetdb.io/use-cases/wordpress-with-google-sheets).

The current pricing page lists five APIs and 10,000 monthly requests for **$29.99/month**. Global endpoints first appear at **$49.99/month**, with twenty APIs and 50,000 requests. Annual-discount figures shown are $25.49 and $42.49 per month respectively; verify billing terms before purchase. Free supplies two APIs/500 requests. Thus five manual teacher endpoints fit the cheaper paid tier; automated Global management requires the higher tier. Five occupied slots leave no spare for create-before-delete rotation. [Pricing](https://sheetdb.io/pricing).

## Permissions, append semantics, and authenticity

Enable read/create (search only if needed), disable update/delete/tab creation/tab deletion on every teacher API. These are operation permissions, not documented teacher-, row-, or column-level policies. The caller selects tabs using `sheet`; do not assume a UI-selected tab provides isolation. Keep unrelated confidential tabs outside this spreadsheet. [Permissions](https://docs.sheetdb.io/permissions), [creation permissions](https://docs.sheetdb.io/global-api/create-new-api), [tabs](https://docs.sheetdb.io/multiple-sheets).

Proposed model: append attendance events, tagged notes, and explicit correction events referencing earlier event IDs. Use client-generated event IDs for retry reconciliation; do not assume atomic deduplication or uniqueness. Append and `INCREMENT` are documented, but these guarantees are not established. Owner edits can still alter history. [Create](https://docs.sheetdb.io/sheetdb-api/create).

Use `mode=RAW` for notes, tags, IDs, and ISO date strings: the default `USER_ENTERED` parses formulas and dates. RAW prevents Google formula interpretation; reserved SheetDB values such as `TIMESTAMP`/`DATETIME` still require testing when entered as literal note text. [Input options](https://docs.sheetdb.io/value-render-input-option), [special values](https://docs.sheetdb.io/sheetdb-api/create).

`TIMESTAMP` requests current Unix time; `DATETIME` supplies a formatted current date/time without a documented timezone here. Neither forces callers to use it: a bearer holder can submit literal dates, teacher labels, or timestamps. Therefore distinguish attendance date from receipt time and treat attribution as asserted, not authenticated. Enforced author/timestamp stamping is not documented. [Create](https://docs.sheetdb.io/sheetdb-api/create).

Proposed links put secrets in fragments, with session-only storage and no third-party scripts. They remain copyable credentials. Restrict CORS to the Pages origin, but it applies to browsers, not terminal clients, and origins cannot include a repository path. [CORS](https://docs.sheetdb.io/cors).

## Quota and freshness

Cached reads still count; batch appends reduce request count. The dedicated limits page specifies 90 requests/minute per API, shared by clients, with `429` and `Retry-After`. The pricing FAQ also describes 30 requests per ten seconds per IP and a one-minute block; it is unclear whether both limits apply or one description is stale. Confirm the effective policy before capacity promises. Monthly quotas reset at midnight UTC on the first; reaching the cap stops requests. [Request counting](https://docs.sheetdb.io/what-is-a-request), [limits](https://docs.sheetdb.io/limits), [pricing](https://sheetdb.io/pricing).

Reads default to a fifteen-second cache; direct Sheet edits wait for expiry, while SheetDB writes clear cache. `ignore_cache=1` bypasses it. Cross-API invalidation for a shared spreadsheet is not explicitly guaranteed. The cache and limits pages disagree about underlying Google quotas; do not base capacity promises on those figures without clarification. [Cache](https://docs.sheetdb.io/cache), [limits](https://docs.sheetdb.io/limits).

## Proposed live validation â€” not performed or authorized

On a disposable spreadsheet, after separate authorization:

1. Create two APIs for one spreadsheet; confirm distinct bearer credentials, authentication defaults, and exact creation responses.
2. Inspect manual token rotation, expiry, and Global-key revocation options; ask SheetDB about supported automation and OAuth refresh/lifetimes.
3. Verify allowed read/append and rejection of update/delete/tab operations; assess import access and cross-tab exposure.
4. Revoke one endpoint; verify old-link failure and continued access through the other, including cached reads.
5. Exercise cross-endpoint cache freshness, concurrent appends, lost-response retries, RAW formulas/reserved strings, and timestamp timezone/override behavior.

These checks determine whether the trusted-teacher design is acceptable; they do not establish tamper-proof identity or audit timestamps.
