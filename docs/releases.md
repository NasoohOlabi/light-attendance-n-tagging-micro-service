# Stable and nightly releases

`main` is the stable source and the default branch. Only `Stable Pages` builds from `refs/heads/main` and deploys to the `github-pages` environment. That environment permits only the main branch. `vX.Y.Z` tags identify stable releases; they point at a verified main commit and do not separately trigger Pages. Initial software release is 0.1.0; live SheetDB account certification is a separate acceptance gate.

`nightly` is the integration/candidate branch. The Nightly candidate workflow runs on its pushes and at **01:17 UTC / 04:17 Asia/Damascus** daily, builds that branch and retains a versioned downloadable artifact for 14 days. It has read-only repository permissions, no Pages deployment and no management secrets. This provides nightly and stable versions without sharing the stable site. Manual nightly dispatch must select `nightly`.

## Promote

1. Start feature branches from `nightly`, implement through Terra, and update the task/feature map. Commit atomic units and submit a focused PR into nightly.
2. Require `Verify` to pass: secret/history and dependency checks, formatting, tests, lint, typechecks, build and browser workflows. Review risks and resolve conversations before squash merging. Hooks are also required locally.
3. Open a promotion PR from nightly to main. Run `bun run verify:release`, inspect the complete promotion diff and migration/security implications. Never promote a WIP or merely rename a failed candidate stable.
4. Merge the verified promotion. Stable Pages repeats the full gates before upload/deployment. Check the deployed repository-subpath URL, sample flow, asset loads and build provenance. Tag/release the main SHA when appropriate.
5. Synchronize nightly with the latest main through an ordinary merge/PR; do not force rewrite either branch. Record release proof and limitations in the work log.

## Rollback

Revert the faulty change on main through a PR, validate it and let Pages deploy the new main commit. This preserves history. Do not roll back a security fix to restore an old vulnerable build. Spreadsheet events are a separate append-only ledger: a code rollback does not undo rows; use explicit corrections and independent backups.

GitHub supports selecting a publishing branch or using Actions. This repository uses Actions with a main-only job condition and restricted environment rather than a second nightly Pages site. See [GitHub publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) and [Pages deployment security](https://github.com/actions/deploy-pages).
