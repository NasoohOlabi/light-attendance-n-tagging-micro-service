# Stable and nightly releases

`main` is stable and `nightly` produces candidate artifacts. Promote only reviewed, verified changes through the repository's PR and CI gates. Run `bun run verify:release` before stable promotion. Railway deploys verified `main` with **Wait for CI** enabled; check health and the actual site after deployment. Record proof and limitations in the work log.

For a faulty release, revert through a PR, validate, and deploy the resulting main commit. A code rollback does not undo events. Follow [Railway setup](railway-setup.md) before any database or hosting rollback: returning to Neon requires reconciling writes since cutover. Preserve the Neon source data and services and backup branch `backup/neon-current-2026-11-15` (`77cedae`).
