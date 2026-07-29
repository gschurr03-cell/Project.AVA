# Sprint 03 test results

Date: 2026-07-18. Directory: repository root unless noted.

| Command | Result | Scope / notes |
| --- | --- | --- |
| `npm run mobile-api:v1:sanity` | PASS | v1 routes, envelopes, version and safe errors |
| `npm run mobile-contract:sanity` | PASS | TypeScript/fixture/native contract alignment |
| `npm run auth-ownership:sanity` | PASS | session-derived ownership and negative paths |
| `npm run production-security:sanity` | PASS | production configuration and redaction |
| `npm run result-foundation:sanity` | PASS | safe result foundation |
| `npm run scientific-validation:sanity` | PASS | unsupported scientific outputs fail closed |
| `npx supabase test db supabase/tests/mobile_vertical_slice.sql` | PASS | 12 pgTAP assertions; focused file avoids the separately tracked missing TAP plan in orchestration |
| `npm run typecheck` | PASS | no TypeScript errors |
| `npm run lint` | PASS | zero warnings |
| `npm run build` | PASS | production build; all mobile v1 routes compiled |
| `npm run worker:check` | PASS | pipeline compiled, packaged MediaPipe model found, worker configuration valid |
| `swift test --package-path ios/AVASprint` | PASS | 19 portable tests; required writable caches/out-of-sandbox SwiftPM execution |
| `npm run e2e:golden-path` | PASS | 13 passed, 13 intentionally project-filtered/skipped; required local port permission |
| JSON parsing and tracker invariants | PASS | 9 tracker JSON files parse; Sprint 03 assignments and JSON/CSV status parity verified |

The first sandboxed Swift and Playwright attempts failed because SwiftPM could not start its
own sandbox and the web server could not bind port 3100. Both passed unchanged with the
required execution permission. The first Supabase attempt could not write CLI telemetry;
the focused test passed unchanged with local CLI/Docker access.

Not executed: staging smoke, deployed TLS/auth issuer, expired/revoked/disabled-account
provider cases, cross-organization staging matrix, real native response, and physical-device
tests. Those require the incomplete Sprint 02 environment/authorization work and remain
completion blockers; they are not represented as passing local tests.
