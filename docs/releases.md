# Development releases on main

The current release is **v0.1.0**, a 0.x development release. All features, fixes and documentation merge into `main` through reviewed PRs and CI. Run `bun run verify:release` before publication. Railway deploys verified `main` with **Wait for CI** enabled; check health and the actual site after deployment. Record proof and limitations in the work log.

Nightly builds and deployments are disabled. The scheduled candidate workflow has been removed, and validation runs on main and PRs targeting main. The historical Git `nightly` branch is retained inactive; it has no Railway deployment. Create or enable a nightly build/deployment only after the owner explicitly requests it. Required validation and security checks remain enabled.

For a faulty release, revert through a PR, validate, and deploy the resulting main commit. A code rollback does not undo events. Follow [Railway setup](railway-setup.md) before any database or hosting rollback: returning to Neon requires reconciling writes since cutover. Preserve the Neon source data and services and backup branch `backup/neon-current-2026-11-15` (`77cedae`).
