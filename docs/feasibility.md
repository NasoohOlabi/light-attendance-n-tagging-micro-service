# Feasibility and recommended decision

Status: planning only. Evidence checked 2026-11-13, Asia/Damascus. The preserved prototype is `2d8fbe5`; it is not proof of live SheetDB behavior. Detailed citations and the OpenAPI audit are in [SheetDB research](sheetdb-research.md).

## Recommendation

Proceed with the design **if reusable, manually revocable links are acceptable**. Use a dedicated spreadsheet and a separate Read + Create API endpoint for each of the five trusted teachers. Host the teacher app on GitHub Pages. Start the local manager as a credential inventory and link generator; make account-level automation optional. Use official OAuth MCP for agent data access, and give a local management adapter a Global key only when lifecycle automation is explicitly needed.

Do not promise fully automatic bearer provisioning or expiring teacher tokens. The public API and OpenAPI contract do not document those operations. If strict provider-enforced expiry is essential, stop before further implementation and obtain a supported SheetDB mechanism or change that requirement/architecture. A date inside a magic link cannot enforce expiry against direct API requests. [Authentication](https://docs.sheetdb.io/authentication), [OpenAPI](https://sheetdb.io/openapi.json).

## Requirements against evidence

| Requirement | Feasibility | Design consequence |
| --- | --- | --- |
| Static frontend; no hosted app backend | Feasible with direct browser REST access | SheetDB remains the hosted data/auth provider; owner connects Google once |
| Teachers never sign into Google | Feasible with API bearer credentials | Personal links carry reusable capability credentials |
| Username attached to writes | Feasible in our client | Asserted attribution, not server-verified identity |
| Shared roster/stats reads and append-only application writes | Feasible with Read + Create permissions | Disable update/delete/tab mutations at the provider, not just in the UI |
| Corrections without deleting original rows | Feasible in our data model | Append a reversal referring to an earlier event ID |
| Revoke one teacher | Feasible by deleting that teacher's API endpoint | One API per teacher; validate isolation and propagation |
| Automatically create a fully protected teacher credential | Not established | API creation does not return a bearer or expose documented auth-setting controls |
| Rotate bearer token via an API | Not documented | Verify dashboard support; endpoint replacement is the documented fallback |
| Create teacher tokens with expiry | Not documented | No real expiry promise in version one |
| Local manager works while your PC is off | Teacher app does; manager does not | Local schedules cannot guarantee timed revocation while offline |
| Agents inspect/add sheet data without account management key | Supported via OAuth MCP | Separate agent consent from teacher access |
| Agents autonomously manage every teacher-access setting | Not supported by published tool coverage | MCP lacks credential/permission management; Global API covers only part of lifecycle |

Provider evidence: [permissions](https://docs.sheetdb.io/permissions), [create API](https://docs.sheetdb.io/global-api/create-new-api), [delete API](https://docs.sheetdb.io/global-api/delete-api), [MCP](https://docs.sheetdb.io/ai-agents/mcp-server). App-specific conclusions above are architectural inferences.

## Access layout

All five endpoints point to the same dedicated spreadsheet. SheetDB's own guide describes multiple APIs for one spreadsheet; independently configured credentials and cross-endpoint freshness still need a controlled account test. [Official multiple-API example](https://sheetdb.io/use-cases/wordpress-with-google-sheets).

Each teacher link carries a username, endpoint ID, bearer and sheet name. The browser uses only the endpoint credential; it receives neither the Google account token nor the Global management key. Store access in the fragment, remove it promptly, and retain it only for the browser session. Fragment handling reduces ordinary hosting/referrer exposure but does not make the link secret from its recipient, extensions, copied messages or browser history.

Read/Create scopes do not provide per-user record ownership. A trusted holder can forge a name, append incorrect data or reversals, consume quota, and select other exposed tabs. All five can read the entire intended dataset. This matches the stated trust model; it is not suitable for mutually untrusted users or private per-teacher notes. RAW mode protects values submitted by our app; it does not force a malicious direct caller to use RAW.

## Revocation and expiry distinctions

- **Close browser session:** forgets a credential on that browser only. The original link still works.
- **Disable a profile in the local manager:** prevents that manager from showing it; does not affect SheetDB access.
- **Revoke an MCP connection:** signs out that agent connection. It does not revoke teacher bearer links.
- **Revoke a Global key:** affects that management credential according to dashboard behavior; do not assume it invalidates existing teacher endpoints. Exact key controls need account inspection.
- **Delete one SheetDB API:** the published management operation removes that endpoint and preserves its spreadsheet; this is the documented basis for teacher-access revocation.
- **Rotate the API bearer:** only valid if a supported provider control actually invalidates the old bearer. Editing local saved data alone has no effect.
- **Put expiresAt in a link:** advisory UI expiration only. It cannot invalidate the enclosed bearer at SheetDB.
- **Scheduled deletion:** could revoke an endpoint if an external scheduler or awake local machine executes it. That is operational scheduling, not native expiring tokens, and adds reliability/account-secret responsibilities.

Sources: [MCP connection revocation](https://docs.sheetdb.io/ai-agents/mcp-server), [Global authentication](https://docs.sheetdb.io/global-api/authentication), [API deletion](https://docs.sheetdb.io/global-api/delete-api). No credential-expiry promise was found in [the published contract](https://sheetdb.io/openapi.json).

## Cost and operating fit

At the research date, the $29.99 monthly tier lists five APIs and 10,000 requests/month. This is the candidate for five manually managed teacher endpoints. The $49.99 tier lists twenty APIs, 50,000 requests/month and Global endpoints. The free tier has two APIs/500 requests and can support a small proof of concept, not five separately revocable teacher endpoints. Confirm current terms before purchase. [Pricing](https://sheetdb.io/pricing).

Five slots means no spare for an additional owner endpoint or create-before-delete replacement. The owner could work in the sheet/provider dashboard or MCP, or budget another API. Reusing a teacher's credential for owner submissions would misattribute that work and is not the recommended routine. Choosing a larger tier solely for Global automation is a cost/benefit decision, not a technical requirement for static teacher access.

Illustrative workload, not a forecast: five teachers × twenty days × (two read/refresh requests + ten batched saves × two requests each) = 2,200 monthly requests, before other features, schema checks, retries or setup. The current prototype performs a schema read on each submitted batch, which would increase that example. Batch attendance by group and cache validated headers per session; avoid polling the full ledger. Each HTTP call counts even when served from cache. [Counting rules](https://docs.sheetdb.io/what-is-a-request).

## Data durability limits

Append-only APIs protect existing sheet rows from ordinary update/delete calls when permissions are configured correctly. They do not make derived summaries immutable: an added reversal or later attendance event intentionally changes the view. Preserve both raw records and their projections.

Device times, actor names and client-supplied IDs can be forged. SheetDB's DATETIME/TIMESTAMP substitutions provide useful normal-operation context but are optional caller-supplied values, not an immutable receipt stamp. Use physical append order and independent sheet snapshots for recovery, and validate concurrent ordering. Never claim that a timestamp cutoff alone makes all damage reversible. [Create semantics](https://docs.sheetdb.io/sheetdb-api/create).

## Decision gates

1. Accept reusable revocable credentials versus requiring hard expiry.
2. Verify two independently authenticated APIs against one disposable spreadsheet and confirm the eventual five-endpoint account capacity.
3. Establish supported bearer enablement/replacement controls, key permissions and any additional management authentication factor.
4. Prove Read/Create preserves old rows across all permitted routes, including import; prove forbidden mutations fail on disposable data.
5. Prove one-endpoint revocation, cross-endpoint freshness, retry behavior and timestamp handling.
6. Select manual management or the Global tier, then authorize implementation separately.

These are future validation tasks. No SheetDB account, real credentials, live data or billing changes were used in this planning work.
