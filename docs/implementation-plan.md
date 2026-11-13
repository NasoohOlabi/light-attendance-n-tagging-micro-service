# Implementation plan and validation gates

Status: future work only. The user explicitly stopped implementation and asked to preserve the base. No stage below is authorization to execute it now. Current Git contains source snapshot `f6fee1d` and WIP prototype `2d8fbe5`.

## Stage 0 — settle provider feasibility

Use the public evidence in [research](sheetdb-research.md), then separately authorized account inspection/disposable tests. Resolve actual bearer enablement/rotation controls, absence or presence of native expiry, Global-key scopes and additional auth factor, five endpoints for one spreadsheet, plan limits and agent OAuth scope.

**Exit:** Record observed settings, sanitized response shapes and provider answers. Choose reusable manual links or a supported stronger alternative. If hard expiry or fully automatic protected credential issuance is required but unsupported, stop and revise the design rather than emulate security in JavaScript. No production data is involved.

## Stage 1 — validate the minimum data path

On a disposable spreadsheet, configure two Read/Create endpoints and distinct bearer credentials. Establish correct headers, browser CORS and a controlled append/read/revoke experiment. Check all permitted Create surfaces, including JSON import; test denied mutation routes only on disposable data. Confirm one endpoint can be removed without affecting the other or deleting sheet data.

**Exit:** Capture the validation matrix below, with failures and unknowns. Confirm a fresh client using the revoked credential cannot append. A successful GET denial alone is not proof that Create is disabled. Prefer confirmed endpoint deletion when proving revocation. Never run destructive-permission probes on production.

## Stage 2 — review and reuse the stopped prototype

Inspect the committed base against [the specification](specification.md), preserving existing work. Do not assume passing unit tests establish account behavior. Resolve the following known gaps in coherent units:

- Global keys with optional bearer/Basic second-factor authentication are not handled in the prototype manager.
- New endpoint authentication enablement and bearer retrieval are manual and not verified against an account.
- Browser workflow/mobile/accessibility checks were not completed; preview used localhost while manager accepts only 127.0.0.1.
- Event schema versioning and conflicting duplicate-ID detection are not implemented.
- Pending-storage failures, partial writes, corrupted saved batches, rotated endpoint reconciliation and cross-tab session replacement need explicit tests.
- The manager's local state update and remote-operation failure/reconciliation behavior need review; do not conflate local state and actual provider access.
- Attendance 'Not marked' selection for a previously marked student needs an unambiguous correction flow.
- Direct-call validation is a trust limitation; permissions must be proven in SheetDB, including import/cross-tab surfaces.
- Documentation still contains prototype operation guidance; reconcile it only against confirmed provider capabilities.

**Exit:** A short gap report with retained/replaced components and concrete failing examples where relevant. Unit tests must target actual semantics rather than mirror implementation.

## Stage 3 — finish the teacher application

Implement T1–T12 and versioned event parsing/projection. Finish attendance, tagged-note and roster flows, query-state navigation, recovery from uncertain saves, corrected history and responsive Arabic-capable inputs. Isolate credentials to session handling; keep generated view URLs safe to share.

**Exit:** Type checks, lint and focused tests pass. Drive actual rendered attendance save, note save/filter, roster change, correction, summary and reload/retry paths. Prove only GET/POST append traffic from the app, no secrets in assets/console/referrers, and correct revocation behavior with disposable endpoints.

## Stage 4 — finish the local manager, manual-first

Implement M1–M6 and M8–M10. The owner imports credentials created through confirmed dashboard controls; manager validates and issues links. Treat rotation as 'replace provider credential' only when actual provider support is known. Otherwise replace endpoints using the documented lifecycle. Retain retired-access metadata without presenting stale keys as active.

**Exit:** User can issue and revoke two independent test users, restart/recover manager state and distinguish uncertain operations. Local-only routes reject cross-origin/incorrect-host mutations. Teacher build contains no manager code or credentials. Audit and backup behavior is documented.

## Stage 5 — optional Global/agent automation

Only if the paid tier and automation benefit are accepted: add supported list/create/delete operations and the narrow local agent interface in [agent access](agent-access.md). Include optional additional management authentication and endpoint registry restrictions. Keep bearer setup manual unless a provider-supported automation mechanism has been established. Official MCP remains the preferred interface for authorized data tasks.

**Exit:** Global keys remain outside prompts/frontend/log URLs; creation passes explicit read/create permissions; endpoint deletion is targeted and observed; unsupported refresh/expiry cannot be invoked. Connection/key revocation behavior is tested independently of teacher endpoint revocation.

## Stage 6 — provision and publish only when requested

Choose a new GitHub remote; confirm source history and ignored files contain no secrets. Configure Pages and run the existing workflow after reviewing it. Configure final SheetDB CORS origins and issue actual teacher links. If five API slots are occupied, document replacement downtime or obtain extra capacity. Provide an owner method for recording data under their own name without impersonating a teacher.

**Exit:** Deployed repository-subpath app works on two devices; second session sees a first-session save; correction preserves originals; one teacher endpoint can be revoked independently; quota and backup procedures are recorded. No existing production migration without separate instruction.

## Proposed validation matrix

| Test | Evidence to capture | Fail condition |
| --- | --- | --- |
| Separate endpoint credentials | Two distinct endpoints against same disposable sheet; both auth/read/append | Credentials cannot be separated or account capacity differs |
| Provider permissions | Before/after disposable sheet snapshot plus denied update/delete/tab operations | Any supposedly denied operation changes data |
| Append/import surface | Existing sentinel rows unchanged after allowed append/import experiments | Create permission can overwrite/delete existing content |
| Authentication requirement | Unauthenticated requests denied; valid bearer accepted | Public access remains possible |
| Protected provisioning | Actual create response and auth defaults, dashboard controls | Link issued before auth is actually enabled |
| Individual revocation | Old bearer fails reads and append; other endpoint continues | Shared credential or unexpected persistence |
| Expiry | Provider-defined TTL plus actual late direct-call rejection, if supported | Only frontend refuses while REST still accepts |
| Freshness | Endpoint A append followed by B cached/fresh reads | Stale reads conceal acknowledged changes without recovery |
| Concurrent attendance | Controlled submissions with reversed device clocks | Projection depends on wall clocks or loses audit rows |
| Uncertain delivery | Drop response after accepted append, then retry same IDs | Duplicate effective records or silent loss |
| Partial batch | Simulated partial acknowledgement followed by reconciliation | Entire batch recreated with new IDs |
| RAW and timestamp fields | Formula strings, Arabic, DATETIME/TIMESTAMP literals and requested sentinels | Unintended formulas or unsupported timestamp assumptions |
| Key lifecycle | Global-key scope, second factor and revocation inspected | Agent gets broader undocumented powers or secrets leak |
| Manager recovery | Restart, local write failure after remote success, stale profiles | UI claims an operation's opposite state |
| Static artifact | Inspect dist and deployed URL/network trace | Credentials, manager code, broken relative asset paths |

Any live writes require a later authorized test. The matrix is a specification, not a record of tests already run.

## Git and documentation discipline

Keep the initial source snapshot and WIP history. Current work is documentation-only and must not modify the prototype. For future implementation, commit each verified unit with its reason/checks; update `docs/work-log.md` with date/timezone and limits. Keep no account secrets or generated links in commits. Before handing back, inspect staged diff, run `git diff --cached --check`, verify commit and status, report push state. The current repository has no remote and has not been pushed.
