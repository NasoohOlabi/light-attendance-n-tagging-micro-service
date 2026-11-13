# Contributing

Start with [AGENTS.md](AGENTS.md) and the [task list](docs/implementation-plan.md). Use PowerShell and Bun 1.3.0; dependency installation is locked in CI.

```powershell
bun install --frozen-lockfile
bun run setup:security
bunx playwright install chromium
bun run verify:release
```

`bun install` enables Husky hooks. The secret scanner bootstrap downloads pinned Gitleaks 8.30.1 and checks its release SHA-256. Pre-commit formats staged files, scans staged changes, typechecks, tests and lints. Pre-push verifies the build and scans all local Git history. Missing scanners fail closed. CI independently repeats checks; local hooks are convenience gates, not a security boundary. Keep the `source-map-js` override until its parents resolve a patched version without it.

## Atomic Git work

1. Inspect `git status --short` and the existing diff. Identify unrelated/user work and preserve it. Obtain permission before making a worktree.
2. Create a descriptive `feat/`, `fix/`, `docs/` or `chore/` branch from the intended base. Give each Terra worker disjoint file ownership; the orchestrator is the sole committer in a shared checkout.
3. Make one coherent user outcome or setup change. Keep behavior documentation and meaningful tests with the implementation. Add dated Asia/Damascus notes to `docs/work-log.md` with request, changes, verification and limitations; label recovered work and unknown provenance.
4. Run `bun run verify`; use the verification skill for affected UI paths. Run `bun run verify:release` for promotion. Stage named paths or hunks, inspect `git diff --cached`, then `git diff --cached --check`. Never stage everything indiscriminately.
5. Commit with a short imperative subject and a body explaining what changed, why and actual checks. Split unrelated units. Interrupted work gets a clearly labeled WIP commit naming remaining work and failed checks.
6. Verify the resulting commit and final status. Report hashes, uncommitted paths and their ownership, and push state. Preserve history; amend/rebase/force-push only when authorized. If blocked, name the exact failed command and affected paths.

## Pull requests

Use the PR template: concrete outcome, linked acceptance/task ID, proof, remaining risks and rollback. Feature candidates target `nightly`; stable promotion targets `main`. Keep the diff focused and credentials absent. The `Verify` status must pass. Review confirmed risks against surrounding code, resolve conversations, then squash merge; a separate human approval is encouraged but not required for this single-maintainer repository. Draft/WIP PRs are not release candidates.

Release policy lives in [docs/releases.md](docs/releases.md). Agents read the root instruction file instead of duplicating policy in model-specific files. Future UI work updates the local verification feature map; `maintain-verification-skill` audits it when requested.
