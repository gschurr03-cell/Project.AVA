# Sprint 05 test results

Date: 2026-07-19.

| Command | Result | Evidence |
| --- | --- | --- |
| `swift test --package-path ios/AVASprint` | PASS | 24 portable tests, including upload persistence/progress/cancellation/authorization/local recovery |
| `npm run mobile-api:v1:sanity` | PASS | idempotent recovery, mismatch rejection and camelCase upload contracts |
| `npm run mobile-contract:sanity` | PASS | server/native contract regression |
| `npm run auth-ownership:sanity` | PASS | authenticated ownership boundary |
| `npm run upload-lifecycle:sanity` | PASS | upload/storage lifecycle regression |
| `npx supabase test db supabase/tests/mobile_vertical_slice.sql` | PASS | 12 database/RLS/idempotency assertions |
| `npm run typecheck` | PASS | no TypeScript errors |
| `npm run lint` | PASS | zero warnings |
| `npm run build` | PASS | production build and all mobile routes |
| `npm run e2e:golden-path` | PASS | 13 passed, 13 intentionally project-filtered/skipped |
| `npm run worker:check` | PASS | pipeline/model/config valid |
| `node project-tracker/validate_tracker.mjs` | PASS | tracker integrity |

One initial Swift compile failed because async throwing expectations lacked `await`; after
correcting the test syntax, an equality assertion exposed ISO-8601 timestamp precision loss.
The assertion was narrowed to stable persisted identities. Final result is 24/24.

Blocked: Xcode/simulator picker and background session, physical-device relaunch/network
loss, staging storage transfer and deployed orphan inventory.
