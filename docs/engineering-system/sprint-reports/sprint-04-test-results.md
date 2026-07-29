# Sprint 04 test results

Date: 2026-07-18. No Sprint 04 product source was changed because all assigned tasks failed
Definition of Ready; these checks validate the existing preparation and regression surface.

| Command | Result | Notes |
| --- | --- | --- |
| `npm run mobile-api:v1:sanity` | PASS | mobile API contract regression |
| `npm run mobile-contract:sanity` | PASS | native/server fixture alignment |
| `npm run auth-ownership:sanity` | PASS | server-derived identity regression |
| `npm run production-security:sanity` | PASS | configuration/redaction regression |
| `swift test --package-path ios/AVASprint` | PASS | 19 portable tests |
| `npm run typecheck` | PASS | no TypeScript errors |
| `npm run lint` | PASS | zero warnings |
| `npm run build` | PASS | production backend/mobile routes compile |
| `npm run e2e:golden-path` | PASS | 13 passed, 13 intentionally project-filtered/skipped |
| `npm run worker:check` | PASS | worker pipeline/model/config valid |
| `node project-tracker/validate_tracker.mjs` | PASS | tracker integrity |
| `xcodebuild -version` | BLOCKED | full Xcode unavailable; active developer directory contains Command Line Tools only |

Not run: signed archive, simulator login/session flow, Keychain device persistence, staging
authentication, refresh/revocation, physical-device accessibility matrix, symbol upload or
test crash. These are acceptance evidence, not optional test skips, and keep Sprint 04
tasks incomplete.
