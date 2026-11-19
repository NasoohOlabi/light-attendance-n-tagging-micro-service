# Wartaq attendance notebook

**v0.1.0 · In development.** All changes are merged into `main`; nightly builds and deployments are disabled for now.

A React/TypeScript notebook served by Bun with Better Auth and Railway Postgres. Administrators approve accounts and manage assignments; Teachers work with assigned students; Students see only their own attendance. Signup grants no application role. See [roles](docs/roles.md), [assigned roster](docs/assigned-roster.md) and [security](SECURITY.md).

Choose **Explore with sample students** to try the notebook without an account. English and Arabic interfaces support responsive and right-to-left layouts. The notebook opens on a dashboard with attendance charts and actions to take attendance or add a student. Administrators and sample users can add students; **Settings** opens account and roster management.

Connect an OAuth-capable MCP client to the site's `/mcp` endpoint to work with Wartaq using your existing account. See [MCP setup and tools](docs/mcp.md).

Install dependencies with `bun install --frozen-lockfile` and run `bun run dev` for the public shell and sample. For authenticated local use, configure a disposable database and run the built app through Bun as described in [Railway setup](docs/railway-setup.md). Run `bun run verify` for repository checks and `bun run verify:ui` for synthetic browser checks. [Verification guidance](.agents/skills/verify-halaqa/SKILL.md) describes coverage and limits.

[Architecture](docs/architecture.md) documents event ordering, corrections and delivery. [Specification](docs/specification.md), [PWA](docs/pwa.md), [mobile and languages](docs/mobile-and-languages.md), and [releases](docs/releases.md) cover the remaining behavior. Keep credentials and real records outside Git.
