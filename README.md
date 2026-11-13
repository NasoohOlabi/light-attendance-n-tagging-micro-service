# light-attendance-n-tagging-micro-service

**Status: planning complete; implementation stopped.** Implementation started before the user clarified the scope. At the user's request, the base prototype is preserved in commit `2d8fbe5`. It is not production-ready or approved for deployment. Do not resume coding without a new instruction.

The proposed product is attendance and tagged notes for five trusted teachers: a static GitHub Pages frontend, direct SheetDB reads and append-only writes, reusable personal access links, and a local access manager. No teacher Google login or hosted application backend.

## Plans and specifications

Read in this order:

1. [Feasibility and recommendation](docs/feasibility.md) — what is feasible, what is unproven, costs and decision gates.
2. [SheetDB capability research](docs/sheetdb-research.md) — cited official docs/OpenAPI findings, revocation and expiry limits.
3. [Agent access](docs/agent-access.md) — OAuth MCP versus Global management keys, tool coverage and proposed local adapter.
4. [Product and technical specification](docs/specification.md) — requirements, data contract and acceptance criteria.
5. [Implementation plan](docs/implementation-plan.md) — sequenced future work, provider validation matrix and prototype gaps.

Recommendation: manual provisioning first; one independently protected Read/Create endpoint per teacher. Official MCP handles agent data tasks without a management key. Global keys enable optional endpoint lifecycle automation. Native teacher-token expiry and automatic bearer issuance/rotation are **not documented**, so they are not promised.

## Preserved prototype

```powershell
bun install
bun run dev       # teacher app: http://127.0.0.1:5173
bun run manager   # separate terminal: http://127.0.0.1:4174
bun run verify    # tests, lint, type checks, production build
```

[Prototype setup notes](docs/setup.md) describe what was built before the stop. They are not authorization to provision accounts or deploy. No environment variables are needed for the local sample notebook. The manager remains unverified against a live SheetDB account.

- Attendance per student and date, including group marking.
- Tagged notes with free text or your own structured text format; Arabic supported.
- Roster and group changes stored as additional events.
- Shared summaries and a permanent correction history.
- Pending batch recovery with stable IDs after uncertain network outcomes.
- Local user/link management, manual token rotation, optional SheetDB Global API creation and revocation.

This is a separate Git repository derived from `pages-micro-service`. Its first commit preserves the authorized source working copy. The current app focuses on attendance and notes; the original Quran page/points/finals screens and Google/Firebase integrations are not carried into the new UI. Existing production sheets are not migrated or modified.

Read [prototype architecture](docs/architecture.md), [URL state](docs/url-state.md), and [work log](docs/work-log.md). The repo has Git initialized on `main`, no remote and no push/publication. It is registered in T3 Code as light-attendance-n-tagging-micro-service. Both prototype servers are stopped. The original production repository was not edited by this task.
