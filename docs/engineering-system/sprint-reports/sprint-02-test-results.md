# Sprint 02 test results

Date: 2026-07-18. Working directory: repository root.

| Command | Result | Task IDs | Evidence/notes |
| --- | --- | --- | --- |
| `node project-tracker/validate_tracker.mjs` | PASS | all | 51 tasks; zero invalid references/cycles/duplicates |
| `npm run environment:sanity` | PASS | 0002, 0003 | local configuration contract only |
| `npm run security:secrets` | PASS | 0003 | working-tree scan; not history/external stores |
| `npm run production-security:sanity` | PASS | 0003, 0005, 0010 | nested redaction/fail-closed security |
| `npm run auth-ownership:sanity` | PASS | 0005 | source/RLS contract |
| `npm run upload-lifecycle:sanity` | PASS | 0005, 0013 | local validation/ownership lifecycle |
| `npm run worker:jobs:sanity` | PASS | 0002, 0010 | local queue contract |
| `npm run worker:analysis:sanity` | PASS | regression | all mapper cases |
| `npm run worker:check` | PASS | 0002, 0010 | compiled modules and MediaPipe model resolve |
| `npm run typecheck` / `lint` / `build` | PASS | all | zero lint warnings; 31 static pages |
| `npx supabase migration list --local` | PASS | 0004 | 53/53 aligned locally |
| `npx supabase db lint --local` | PASS WITH WARNINGS | 0004 | one type warning, two unused parameters |
| `npx supabase test db` | FAIL | 0004, 0005 | 12 mobile tests pass; orchestration has no TAP plan |
| `npm run test:e2e` | FAIL; focused rerun PASS | 0005, regression | one navigation assertion was non-deterministic |
| `swift test --package-path ios/AVASprint` | PASS | regression | 19 portable tests |

No staging integration, abuse/load test, managed rotation, alert rehearsal, backup/restore,
cross-organization staging test, or deployment smoke test ran. No assertion was weakened
and no fixture was represented as staging evidence.

