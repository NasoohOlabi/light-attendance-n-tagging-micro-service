# Access and delivery

## Sub-features

Self-contained fragment links, session close/reload, sample isolation, uncertain saves, stable retry IDs, storage failure, competing tabs and local access manager.

## How to get to it (user POV)

Open an issued private link. Its fragment disappears; username remains visible. Use **Refresh**, **Retry pending batch**, **Discard pending retry** or **Close session** as applicable. Owner runs the separate loopback manager and enters settings/imported credentials to generate links.

## Driving it with Playwright and Bun HTTP

Run `bun run verify:ui`: the synthetic provider test inspects bearer headers and RAW GET/POST requests, accepts one append while losing its response, then clicks Retry and proves original ID and one physical append. Reload retains the session; Close session then reload returns to landing. Separate tests seed corrupt storage, deny storage writes and hold one tab's POST while another attempts save; each asserts no unsafe additional POST. Sample flow asserts zero external traffic. For other changed branches drive invalid fragments, malformed rows, revoked/429 responses, discard confirmation, a changed endpoint with old pending data and back/forward query navigation. `bun test ./tests/manager.test.ts` drives real isolated manager HTTP, rejects cross-origin requests, persists uncertain revoke state across restart and verifies tokens absent from public state.

## Gotchas

All credentials in these tests are generated synthetic values. Never record a real link. Session storage holds bearer capabilities; local storage holds private pending event data, not the bearer. Web Locks are required for live saves. Local manager import does not prove two endpoints share one workbook. Provider permissions, CORS and read-plus-append revocation require the separate disposable-account matrix; a mock is not that proof. Browser cleanup preserves ignored evidence; manager cleanup deletes only its unique scratch state.
