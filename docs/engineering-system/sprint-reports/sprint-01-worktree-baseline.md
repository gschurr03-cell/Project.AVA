# Sprint 01 worktree baseline

Captured: 2026-07-18

- Branch: `day-25`
- Starting commit: `2c55e92c2d1a6ee10881fb59ec475772747ce276`
- Staged files: none
- Tracked files with pre-existing modifications: 55
- Untracked product, documentation, migration, test, native and engineering-system
  paths: substantial; all are user-owned and preserved.
- Destructive Git operations: prohibited and not used.

The pre-existing tree includes the Batch 1 mobile slice, migrations through `0053`,
production-worker and orchestration work, native Swift sources, Playwright coverage,
engineering audits, and the newly generated engineering operating system. Sprint 01 does
not claim ownership of those changes.

## Intended Sprint 01 paths

- `package.json` — targeted lint command and release-surface sanity alias only.
- `eslint.config.mjs` — canonical ESLint CLI configuration.
- `src/components/video/VideoOverlay.tsx` — dependency-array correction only; preserve all
  pre-existing overlay work.
- `src/lib/config/features.ts` — production-only fail-closed release policy.
- `config/production-surface-policy.json` — versioned release manifest.
- `scripts/release-surfaces-sanity.mjs` — policy-to-loader contract test.
- `docs/engineering-system/**` and `project-tracker/**` — Sprint evidence and governance.

`package.json`, `VideoOverlay.tsx`, and `features.ts` were dirty or untracked before this
sprint. Only the narrow changes listed above belong to Sprint 01. No pre-existing file was
reset, cleaned, stashed, renamed, mass-formatted, or deleted.

## Readiness result

- `AVA-0039` and `AVA-0040`: independently ready.
- `AVA-0001`: cannot meet its clean intentional commit acceptance criterion while the
  user-owned baseline remains unpartitioned and no authority exists to commit unrelated
  work.
- `AVA-0030`: blocked by `AVA-0001` and by unavailable remote required-check evidence.
- `AVA-0032`: blocked by `AVA-0004` and `AVA-0030`; generated schema types cannot be
  verified against an applied isolated staging schema.

The blocked tasks remain in Sprint 01 for traceability and are not bypassed.
