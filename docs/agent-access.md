# How agents should access SheetDB

Status: proposal, not installed or connected. Research date: 2026-11-13. No credentials are needed to read these plans or work on local code.

## Which credential should you give an agent?

**For ordinary data inspection and authorized row operations, prefer SheetDB's official MCP.** Configure `https://sheetdb.io/mcp` in a client supporting remote Streamable HTTP and OAuth. You sign into SheetDB and approve the connection; you do not paste your Google password, a teacher bearer or a Global management key into the agent prompt. Each connection can be revoked in SheetDB's AI agents panel. [Official MCP documentation](https://docs.sheetdb.io/ai-agents/mcp-server).

MCP uses OAuth 2.1, PKCE and dynamic client registration. Its operation permissions intersect with each underlying API's permissions. For this notebook, leave update/delete disabled on both sides and enable append only when explicitly needed. This does not imply the OAuth connection is limited to one selected notebook: documentation says agents see the APIs visible to the signed-in account/team. Inspect that exposure before authorizing a connection. [MCP scope and access checks](https://docs.sheetdb.io/ai-agents/mcp-server).

**For account lifecycle automation, SheetDB does offer management keys.** Generate one at its API-keys page with only the needed Global permissions. Use it inside the local manager's process or a narrow local agent adapter; the model need not receive the raw key. The Global routes include the App ID/key in their URL path, so redact full outbound URLs from logs, traces and error reports. The OpenAPI also permits an optional bearer/Basic second factor for these keys. Support that if configured; the current local manager does not; use manual profile import if a Global second factor is required. [Global authentication](https://docs.sheetdb.io/global-api/authentication), [OpenAPI](https://sheetdb.io/openapi.json).

Never give teacher browsers an account management key. It is a separate privilege from a teacher endpoint bearer. Nothing in this planning phase requires you to supply either.

## Capability coverage

| Task                                                   | Official MCP                            | Global API / dashboard                                                         |
| ------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------ |
| List connected spreadsheet APIs                        | Yes                                     | Global list                                                                    |
| Inspect headers, read/search rows                      | Yes                                     | Per-API REST reads; Global API is not the row API                              |
| Append rows                                            | Yes, if agent and API permissions allow | Per-API REST Create                                                            |
| Create an API for a spreadsheet                        | Documented MCP tool                     | Global create; verify plan-specific MCP behavior                               |
| Delete a SheetDB API endpoint                          | No documented tool                      | Global delete, or provider dashboard                                           |
| Read or mint teacher bearer secrets                    | No documented tool                      | No published Global operation; dashboard inspection required                   |
| Set endpoint permissions/authentication after creation | No documented tool                      | Global create accepts initial permission list; later settings API undocumented |
| Set native bearer expiry or refresh bearer             | No documented tool                      | No published operation/field                                                   |
| Revoke an agent OAuth connection                       | Owner uses AI agents panel              | Separate from teacher endpoint revocation                                      |

Source of tool coverage: [MCP tool list](https://docs.sheetdb.io/ai-agents/mcp-server). Source of Global coverage: [create](https://docs.sheetdb.io/global-api/create-new-api), [delete](https://docs.sheetdb.io/global-api/delete-api), [OpenAPI](https://sheetdb.io/openapi.json). An MCP `delete_records` tool deletes rows; it is not endpoint revocation.

## Suggested agent workflow

1. **Planning/coding:** use public docs and the local repo. No account access.
2. **Read-only provider discovery, when requested:** connect official MCP through OAuth. Inspect only the intended disposable/notebook APIs; enable no writes initially. Report permissions and exposed data before assuming isolation.
3. **Authorized integration experiment:** append a small, identified test batch through a dedicated disposable API, read it back and capture sanitized evidence. Actual production mutations are a separate request.
4. **Access provisioning, if later requested:** let the owner configure bearer settings in the dashboard. Have the manager generate links from those resulting credentials.
5. **Optional lifecycle automation:** expose a deliberately narrow local tool surface to agents, not arbitrary Global URLs. Keep secrets inside its process and permissions scoped to the required actions.

The official MCP has useful approval handling for row deletion/large updates, but this project's ordinary workflow should not need them. Its OAuth lifetime details and refresh behavior are not specified in the public guide; that is a client/provider concern to validate, not a basis for promising teacher-token expiry. [MCP guide](https://docs.sheetdb.io/ai-agents/mcp-server).

## Proposed local adapter contract (future, not built)

Expose `list_managed_users`, `inspect_managed_endpoint`, `create_endpoint_for_user`, `generate_personal_link` and `revoke_user_endpoint` only after their prerequisites are demonstrated. Restrict endpoint operations to a local registry of this project's IDs and bind creation to the configured notebook spreadsheet. Create must always send explicit `read,create`; revocation must name the target user and exact endpoint, and act only under an explicit user instruction to revoke. Never offer a fake `refresh_token` or `set_expiry` tool.

The adapter can know a secret without printing it to an agent. Generated links are themselves secrets, so return them only when the task is to issue a link, keep them out of ordinary logs, and let the owner send them. If the Global key cannot be limited to selected endpoints, the registry is a local application safeguard, not provider-enforced least privilege. Document that distinction.

Keep account keys process-local initially. If persistence is later requested, choose a Windows credential store rather than silently adding them to plaintext project files. Existing teacher credential storage in the prototype is plaintext and ignored by Git; the owner must decide whether that is adequate for the trusted local-computer model.

## Questions to resolve with the account/dashboard or provider

- Which Global-key permission choices and optional second factors are available? Can a key be restricted to selected API IDs? Can it expire or be revoked independently?
- Does bearer rotation exist in the dashboard, and is there a supported API for it or enabling auth? Does create inherit any authentication settings?
- Are expiring per-API credentials supported outside the published contract? What is the exact enforcement behavior?
- Is MCP endpoint creation available on all plans, or subject to extra restrictions? Does it expose any supported auth configuration absent from the published tool list?

These questions are prepared for later inspection/support contact. No message has been sent and no account connection installed.
