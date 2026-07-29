# Canonical engineering commands

Run web commands from the repository root. Node 22 and `npm ci` are the CI baseline.

| Purpose | Required command | Environment |
| --- | --- | --- |
| Install locked dependencies | `npm ci` | network and lockfile |
| Local web | `npm run dev` | valid `.env.local` |
| Type check | `npm run typecheck` | none |
| Lint maintained web source | `npm run lint` | none |
| Production build | `npm run build` | documented web variables |
| Playwright regression | `npm run test:e2e` | local port 3100; configured test users/services |
| Worker configuration | `npm run worker:check` | `.env.local`, Python venv, packaged MediaPipe model |
| Worker contract sanity | `npm run worker:analysis:sanity` | none |
| Worker job sanity | `npm run worker:jobs:sanity` | none |
| Release surface policy | `npm run release-surfaces:sanity` | none |
| Release checklist | `npm run release-readiness:sanity` | none |
| Portable Swift contracts | `swift test --package-path ios/AVASprint` | Swift 6; writable compiler cache |
| Tracker integrity | `node project-tracker/validate_tracker.mjs` | none |

The repository has purpose-built `*:sanity` commands rather than one unit-test alias.
Those aliases are subsystem tests and must not be counted as distinct evidence when several
names execute the same underlying script. Staging integration commands requiring credentials
are not substitutes for local fixture tests and are recorded as blocked when access is absent.

SwiftPM may require writable cache overrides in restricted environments:

`CLANG_MODULE_CACHE_PATH=/tmp/ava-clang-cache SWIFTPM_MODULECACHE_OVERRIDE=/tmp/ava-swift-cache swift test --package-path ios/AVASprint`

Required checks fail on nonzero exit. No canonical command suppresses failures or warnings.
