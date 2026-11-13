---
name: manage-halaqa-access
description: Manage Halaqa teacher access profiles and private magic links through the existing headless local manager, with optional SheetDB MCP discovery.
---

# Manage Halaqa access

Use this skill when asked to inspect managed access, import a configured teacher credential, create a private link, or revoke a teacher endpoint without opening the local manager dashboard. Read [headless manager recipes](references/headless-manager.md) for the exact requests. Read `SECURITY.md` and `docs/setup.md` for the trust boundary and provider setup.

For client connection and invocation instructions, see [chat access setup](../../../docs/chat-access.md).

The existing manager must run in a trusted execution workspace containing this repository and Bun; its API is loopback only. Plain cloud MCP chat cannot reach the user's Windows loopback or local files. An owner-approved cloud coding workspace can run its own manager with credentials supplied securely in private files or environment variables. Never expose or tunnel the manager. This repository skill is not automatically installed in generic cloud chat; attach the skill and its reference as instructions when appropriate.

An already configured SheetDB endpoint and bearer are required for import and link issuance. The owner must actually confirm its Read/Create-only permissions; do not infer that confirmation from MCP inspection. Manager verification checks authenticated reads, required headers and anonymous denial, not denial of updates or deletes. A link is a reusable secret with no native expiry; return it in private chat only on explicit request, otherwise write it to a protected ignored local file for the owner to deliver. Never print credentials, links, or Global API URLs in output or logs.

Optional [official SheetDB MCP](https://docs.sheetdb.io/ai-agents/mcp-server) supports OAuth Streamable HTTP at `https://sheetdb.io/mcp`. Inspect account/team API exposure before connecting; use read-only agent permissions by default, intersected with each API's permissions. Documented tools are `list_apis`, `describe_api`, `read_records`, `search_records`, `create_records`, `update_records`, `delete_records`, `confirm_pending_action`, `get_pending_action`, and `create_api_from_spreadsheet`. The last does not establish secure authentication or a ready teacher credential. The documented MCP has no bearer mint, refresh, rotation, auth-settings or endpoint-deletion tool. `delete_records` deletes ledger rows, not an endpoint: never alter or delete ledger rows to manage access.

Provider endpoint revocation requires an explicit request and the exact target. Use the manager's Global API path or owner-performed provider deletion followed by manual confirmation. A manual 404/410 is advisory, not proof append access is revoked; pending revocation blocks links across restarts. Do not automatically retry an uncertain create or revoke: check provider state first. The manager's optional Global credentials support App ID and API key only, not the provider's optional second factor.

Examples: “List managed teachers without showing tokens”, “Import the configured endpoint for Teacher A and save a private link”, “Revoke Teacher A's endpoint”, “Inspect the notebook APIs with read-only SheetDB MCP”.
