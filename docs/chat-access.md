# Manage access from chat

Use the repository skill [manage-halaqa-access](../.agents/skills/manage-halaqa-access/SKILL.md) to manage teacher access without opening the local manager dashboard. The skill uses SheetDB's official MCP for provider discovery and the existing loopback manager API for private link issuance. It adds instructions, not a hosted access service or an MCP server of its own.

## Use with Codex

Open Codex in this repository. Repository skills live in `.agents/skills`; invoke this one as `$manage-halaqa-access`. If a running session does not discover it, start a new session in the repository. [Official skill discovery documentation](https://learn.chatgpt.com/docs/build-skills).

To connect SheetDB in Codex CLI, run these commands yourself and complete the provider's OAuth sign-in:

```powershell
codex mcp add sheetdb --url https://sheetdb.io/mcp
codex mcp login sheetdb
codex mcp list
```

The commands configure your client, not the public repository. No Google password, teacher bearer or Global key belongs in these commands. Keep MCP operations read-only for access-management tasks; enabling row writes is unnecessary for issuing links. SheetDB OAuth can expose the APIs visible to your account/team, rather than only this notebook. [Codex MCP setup](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [SheetDB MCP permissions](https://docs.sheetdb.io/ai-agents/mcp-server).

For a saved teacher profile, MCP is optional: link issuance uses the manager's existing credentials and needs no SheetDB row operation. Run `bun run manager` in a separate terminal, or let the coding agent start it locally. The skill's [headless recipes](../.agents/skills/manage-halaqa-access/references/headless-manager.md) cover the request headers and private input/output files. The dashboard can stay closed.

Example requests:

- `$manage-halaqa-access List the saved teachers without showing credentials.`
- `$manage-halaqa-access Issue a link for Teacher A using the saved profile; save it privately and tell me the file path.`
- `$manage-halaqa-access Import the configured endpoint from my private profile file, check access, and issue its teacher link.`
- `$manage-halaqa-access Revoke Teacher A's exact endpoint using the management credentials already loaded locally.`

The owner supplies private credentials through files in ignored `.local/` or another approved secret mechanism. The agent keeps generated links out of command output, Git, screenshots and logs, and saves them privately by default. You deliver the links yourself. Endpoint permission confirmation must reflect the actual provider configuration; the skill cannot infer it from a successful read.

## Cloud and other chats

A cloud coding agent can use the checked-out skill if its trusted workspace has Bun, a suitable shell, network access and credentials supplied through a private mechanism. Its manager runs on loopback in that workspace and owns its own private registry. It does not automatically share your Windows `.local/manager.json`; keep one authoritative registry for each notebook and account for previously issued endpoints before moving management to another workspace. Do not upload the registry as a public artifact.

A chat with only SheetDB MCP tools can discover and inspect the selected provider APIs. It cannot reach your Windows `127.0.0.1`, read your private manager state or execute the headless manager recipes. Provide the skill and relevant reference as instructions if that chat does not load repository skills; attaching instructions does not add tools or credentials. Keep the existing manager private; do not publish it or open a tunnel to make these recipes reachable.

## What still needs provider setup

The documented MCP tools do not retrieve or mint endpoint bearer tokens, configure bearer authentication, rotate tokens or delete an API endpoint. They can create an API from a spreadsheet URL, but that does not establish the authenticated Read/Create configuration required by this app. Initial endpoint credentials and permission/CORS settings still need the provider's supported setup process. Row deletion is never access revocation. [SheetDB's documented tools](https://docs.sheetdb.io/ai-agents/mcp-server).

Existing configured profiles can be reissued through chat; reissuing a link does not invalidate earlier copies or create a new credential. Revocation uses the manager's Global API support or owner-confirmed provider deletion, subject to the existing verification limits. Optional Global-key second factors remain unsupported by this manager. There is no promised token refresh or enforced expiry. See [setup](setup.md), [security](../SECURITY.md) and [provider coverage](agent-access.md).

Documentation checked on 2026-11-13. Adding this skill does not connect an account, create a provider endpoint, issue a real link or change production data.
