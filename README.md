# STDF Insight source backup

Private source snapshot prepared on 2026-10-29. No application behavior was changed.

## Projects

- `desktop/`: STDF Insight Desktop 1.0.0, copied from the authorized local desktop source directory. That source directory had no Git repository or commit history.
- `web/`: STDF Insight web 0.1.0, copied from the clean historical v23 source checkout at commit `53a7c8d` (`improve/record-coverage-plan-20261001`). This identifies the historical snapshot, not a claim about the currently deployed website.

Each project retains its package manifest, lockfile, application sources, and synthetic tests. Install and run commands belong to each project's README and package.json. The desktop package requires Node.js >=22.13.0.

## Restore notes

The original web `.openai/hosting.json` deployment identity is deliberately excluded. `web/vite.config.ts` imports this file. Before a local web build, create a local `web/.openai/hosting.json` containing `{}` for a no-D1/no-R2 configuration, or supply separately authorized environment-specific configuration. Do not restore production credentials from this backup. This backup operation did not run a restored build.

The child READMEs retain historical clone URLs; use this repository and enter the appropriate subdirectory instead. No source Git history was imported.

## Excluded from this snapshot

- Original `.git` directories, all `.github` workflows, hosting identity/configuration, `.npmrc`, and runtime/cache state.
- `node_modules`, `dist`, releases/installers, outputs, test-output, generated compiler state, and validation reports tied to local data.
- Customer/production STDF or ATDF, saved workspaces, SQLite/database contents, environment files, credentials, tokens, keys, and certificates.
- The unrelated TDKstdfviewer checkout.

`web/build/` contains the source Vite plugin, not compiled output. Synthetic fixture generators are source code, not production measurement data. Root ignore rules reinforce these exclusions for future work.

## Verification at backup time

Copied source bytes were checked with SHA-256 against the local originals. Common secret/token/key, credential-URL, private-network, and data-file patterns were reviewed before upload. One synthetic Windows path test was reviewed as a false positive. Pattern scans do not constitute a complete security audit.

Prior desktop checks passed 188 tests and TypeScript no-emit checking. Those results do not certify this historical web snapshot. No deployment, publication, collaborators, or automation was configured by this backup.

Future application changes require approval, an independent branch, relevant tests, and review. Do not deploy or merge without approval.
