# Halaqa notebook

**Status: planning and feasibility only.** Implementation started before the user clarified the scope. At the user's request, that base prototype is preserved but development is stopped. It is not production-ready or approved for deployment. The next work is provider research, specifications and an implementation plan; do not resume coding without a new instruction.

Attendance and tagged notes for a small, trusted teaching team. Hosted as a static GitHub Pages site, with direct SheetDB reads and append-only writes. Teachers enter through personal, reusable access links. No Google login or hosted application backend.

```powershell
bun install
bun run dev       # teacher app: http://127.0.0.1:5173
bun run manager   # separate terminal: http://127.0.0.1:4174
bun run verify    # tests, lint, type checks, production build
```

**Start with [the setup guide](docs/setup.md).** No environment variables are needed. The teacher app has an isolated sample notebook for trying every feature without credentials. The manager opens with setup instructions; it only contacts your real SheetDB endpoints when you configure and use them.

- Attendance per student and date, including group marking.
- Tagged notes with free text or your own structured text format; Arabic supported.
- Roster and group changes stored as additional events.
- Shared summaries and a permanent correction history.
- Pending batch recovery with stable IDs after uncertain network outcomes.
- Local user/link management, manual token rotation, optional SheetDB Global API creation and revocation.

This is a separate Git repository derived from `pages-micro-service`. Its first commit preserves the authorized source working copy. The current app focuses on attendance and notes; the original Quran page/points/finals screens and Google/Firebase integrations are not carried into the new UI. Existing production sheets are not migrated or modified.

Read [architecture and trust boundaries](docs/architecture.md), [URL state](docs/url-state.md), and [work log](docs/work-log.md). This repository is prepared for GitHub Pages but has no remote and has not been published.
