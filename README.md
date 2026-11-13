# Wartaq — Halaqa notebook

An attendance and tagged-note notebook with a static React/TypeScript frontend, Neon managed authentication and a small Neon Function API backed by Postgres. The database has three application tables: teachers, students and events. No ORM or separate server host is required.

Teachers sign up/sign in, then an owner approves their account through the private CLI. The API checks identity, assignment, read/write mode and optional access expiry on every request. Teachers see only their assigned students and related history. The old/former source flag remains ignored when importing assigned students. See [Neon setup](docs/neon-setup.md) for dashboard-free provisioning, schema, approval and verification.

[Wartaq homepage](https://nasooholabi.github.io/light-attendance-n-tagging-micro-service/) · [Open the app](https://nasooholabi.github.io/light-attendance-n-tagging-micro-service/?page=app) · [Public source](https://github.com/NasoohOlabi/light-attendance-n-tagging-micro-service)

The public homepage introduces the notebook, shows an illustrative register, explains teacher approval and answers common questions. **Sign in** opens the separate app at `?page=app`, where an existing managed session resumes automatically. Signing out returns home. Legacy private links still open their notebook directly. Both pages use the selected Midad identity and self-hosted fonts; phones have five labelled app destinations in a safe-area-aware bottom bar.

Choose **Explore with sample students** to review attendance, Arabic-capable notes and append-only corrections without a provider account. Legacy SheetDB links remain compatible; their broader capability limitations do not apply to the Neon API.

Use **English / العربية** to switch the complete teacher interface, including sign-in and feedback. Arabic uses right-to-left layout; your language choice is remembered when browser storage is available. The local manager has its own language switch. See the [mobile and language audit](docs/mobile-and-languages.md) for behavior, verification and device limits.

## Run and verify

Midad (B) is the selected design. The earlier `/?design=a` and `/?design=b` review samples remain isolated references; they never open accounts or save production data. See the [design system](docs/wartaq-design-system.md) for component ownership and entry behavior.

```powershell
bun install --frozen-lockfile
bun run setup:security
bunx playwright install chromium
bun run dev       # http://127.0.0.1:5173/
bun run verify:release
```

Neon CLI pulls private variables into ignored `.env.local`. Vite exposes only the public Auth and Function URLs; database credentials stay on the server. Offline samples and synthetic checks need no real account. The legacy manager remains available through `bun run manager`. See [security](SECURITY.md).

## Direction and tasks

- [Implementation plan and task list](docs/implementation-plan.md): completed work, live-account gates and bounded follow-ups.
- [Specification](docs/specification.md): T1–T12 teacher acceptance, manager requirements and trust limits.
- [Architecture](docs/architecture.md): event order, retries, projections and extension points.
- [Feasibility](docs/feasibility.md), [provider research](docs/sheetdb-research.md), [agent access](docs/agent-access.md): supported capabilities versus unverified provider behavior.
- [Contributor/Git workflow](CONTRIBUTING.md), [agent instructions](AGENTS.md), [releases](docs/releases.md), [verification skill](.agents/skills/verify-halaqa/SKILL.md), [work log](docs/work-log.md).

`main` publishes stable Pages after release checks. `nightly` produces tested candidate artifacts and never deploys the stable site. Every new feature is assigned to Terra with explicit file ownership; the orchestrator reviews and commits coherent units.

## Data and security

Writes append versioned events; corrections reference originals, projections follow database sequence order, and event primary keys prevent duplicate physical rows. Conflicting reused IDs are rejected. Pending batches retain IDs through uncertain delivery and use browser Web Locks to coordinate tabs. External data is validated with Zod.

Neon authorizes teachers server-side; users cannot self-approve, impersonate another teacher or alter the canonical roster through the API. The legacy SheetDB integration retains its original trusted-attribution limits. Never commit personal records or credentials.

History preserves the authorized original-source snapshot `f6fee1d` (including pre-existing work of unknown authorship) and stopped prototype `2d8fbe5`. Implementation/publication was newly authorized on 2026-11-13. The original Firebase app and production data are not migrated or deployed by this fork.
