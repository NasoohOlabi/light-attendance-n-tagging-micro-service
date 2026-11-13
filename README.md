# light-attendance-n-tagging-micro-service

An account-independent attendance and tagged-note notebook for five trusted teachers. The teacher app is static React/TypeScript on GitHub Pages; the owner access manager runs locally with Bun. Each private magic link supplies its teacher name, SheetDB endpoint, bearer and tab. No account or credential is built into the deployed site.

[Open the stable notebook](https://nasooholabi.github.io/light-attendance-n-tagging-micro-service/) · [Public source](https://github.com/NasoohOlabi/light-attendance-n-tagging-micro-service)

Choose **Explore with sample students** to review attendance, Arabic-capable tagged notes, roster changes, summaries and append-only corrections. The sample makes no SheetDB requests and resets on reload. Real use needs owner-supplied private links and the provider acceptance checks below; sample success does not certify a live account.

## Run and verify

```powershell
bun install --frozen-lockfile
bun run setup:security
bunx playwright install chromium
bun run dev       # http://127.0.0.1:5173/
bun run manager   # separate terminal; http://127.0.0.1:4174/
bun run verify:release
```

No production credentials are needed for development. Enter provider settings only in the local manager. It verifies authenticated reads and anonymous denial before issuing self-contained links; optional Global account keys stay in process memory. Teacher capabilities are stored in ignored `.local/manager.json`, never GitHub. See [security](SECURITY.md) and [setup](docs/setup.md).

## Direction and tasks

- [Implementation plan and task list](docs/implementation-plan.md): completed work, live-account gates and bounded follow-ups.
- [Specification](docs/specification.md): T1–T12 teacher acceptance, manager requirements and trust limits.
- [Architecture](docs/architecture.md): event order, retries, projections and extension points.
- [Feasibility](docs/feasibility.md), [provider research](docs/sheetdb-research.md), [agent access](docs/agent-access.md): supported capabilities versus unverified provider behavior.
- [Contributor/Git workflow](CONTRIBUTING.md), [agent instructions](AGENTS.md), [releases](docs/releases.md), [verification skill](.agents/skills/verify-halaqa/SKILL.md), [work log](docs/work-log.md).

`main` publishes stable Pages after release checks. `nightly` produces tested candidate artifacts and never deploys the stable site. Every new feature is assigned to Terra with explicit file ownership; the orchestrator reviews and commits coherent units.

## Data and security

Teachers share one intended notebook through independently revocable Read/Create provider endpoints. Writes append versioned events; corrections reference originals, projections follow sheet row order, duplicate IDs count once and conflicting IDs are flagged. Pending batches retain IDs through uncertain delivery and use browser Web Locks to coordinate tabs. All external data is validated with Zod.

This is trusted attribution, not server-verified identity or per-user private records. Magic links are reusable secrets and have no enforced expiry. Live CORS, endpoint permissions/import behavior, revocation and cross-endpoint freshness must pass on disposable provider data before real use. Never sort the raw Events ledger or commit personal records.

History preserves the authorized original-source snapshot `f6fee1d` (including pre-existing work of unknown authorship) and stopped prototype `2d8fbe5`. Implementation/publication was newly authorized on 2026-11-13. The original Firebase app and production data are not migrated or deployed by this fork.
