# Build and runtime baseline

Executed 2026-07-18 against the dirty baseline.

| Command | Result | Interpretation |
| --- | --- | --- |
| `npm run typecheck` | Pass | TypeScript contracts compile |
| `npm run lint` | Pass with one warning | `VideoOverlay.tsx:926` missing hook dependencies; `next lint` deprecated |
| `npm run build` | Pass | Next.js 15.5.19 emitted 27 routes |
| Selected 13 sanity suites | Pass | FPS, worker, result, ownership, upload, orchestration, mobile, training, security and scientific fixtures |
| `npm run worker:check` | Pass | Compiled modules, Python runtime and pinned model found; no `MODULE_NOT_FOUND` |
| `swift test --package-path ios/AVASprint` | Pass: 17 | Portable macOS package tests, not Xcode/device/signing |
| `npm run e2e:golden-path` | Pass: 13, skipped: 13 | Local seeded browser/RLS flow; mobile project intentionally selects one smoke test |
| `npm audit --omit=dev` | Nonzero: 2 moderate | Next-bundled PostCSS advisory; proposed force fix is an invalid Next 9 downgrade |
| Managed staging E2E | Not run | No staging environment supplied/provisioned |
| Physical iOS device/TestFlight | Not run | Signing team, identifiers, archive and device unavailable |
| Docker image/runtime | Not run | No proven local/hosted container runtime in audit evidence |
| Real scientific study | Not run | No eligible governed reference cohort |

The production web build generated the largest route at `/sessions/[id]` (22.7 kB route,
207 kB first load). Build success does not exercise Supabase queries, storage, worker
claims, MediaPipe inference, or native APIs.

The local Playwright run did exercise seeded authentication, owner/cross-owner RLS denial,
invalid-upload rejection, working-snapshot save/reset, sign-out and feature-gate behavior.
It did not upload a real video or run MediaPipe.

## Deterministic suites observed passing

`fps:sanity`, `analysis-fps:sanity`, `worker:analysis:sanity`, `worker:jobs:sanity`,
`result-foundation:sanity`, `auth-ownership:sanity`, `upload-lifecycle:sanity`,
`intelligence-orchestration:sanity`, `mobile-contract:sanity`,
`training-program:sanity`, `training-longitudinal:sanity`,
`production-security:sanity`, and `scientific-validation:sanity`.

These are purpose-built script assertions, not a unified test runner or coverage report.
