# Sprint 06 test results

Date: 2026-07-19.

| Command | Result | Scope |
| --- | --- | --- |
| `npm run pose:sanity` | PASS | explicit MediaPipe/mock injection and missing-backend fail-closed |
| `npm run worker:jobs:sanity` | PASS | job/claim/lease/retry static contract |
| `npm run worker:analysis:sanity` | PASS | nullable metric mapping and real artifact |
| `npm run result-foundation:sanity` | PASS | versioned safe result |
| `npm run analysis:sanity` | PASS | event/step/metric pipeline |
| `npm run analysis-fps:sanity` | PASS | validated 60 FPS clock |
| `npm run intelligence-orchestration:sanity` | PASS | orchestration contracts |
| `npm run orchestration-integration:sanity` | PASS | deterministic integration/rollback |
| `npm run orchestration-load:sanity` | PASS | 500 jobs, 8 workers, zero duplicate claims |
| `npm run mobile-api:v1:sanity` | PASS | submission/status/result routes |
| `npm run mobile-contract:sanity` | PASS | native/backend contracts |
| `npm run auth-ownership:sanity` | PASS | ownership boundary |
| `npm run typecheck` | PASS | TypeScript |
| `npm run lint` | PASS | zero warnings |
| `npm run build` | PASS | production build |
| `npm run worker:check` | PASS | compile/model/configuration |
| Swift portable suite | PASS retained | 24/24 passed immediately before Sprint 06; no Swift files changed |
| Playwright | PASS retained | 13 passed/13 intentionally skipped immediately before Sprint 06; affected backend build passes |
| `npm run worker:jobs:integration` / retry | BLOCKED | approval/usage unavailable; not treated as pass |

The first `pose:sanity` attempt exposed a stale compiled-module root. The loader now derives
all modules from the compiler’s `biomechanics` output root and the final suite passes.
