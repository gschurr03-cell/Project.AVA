# Repository inventory

## Top-level systems

| Path | Role | Audit status |
| --- | --- | --- |
| `src/app` | Next.js App Router UI, server actions and two API routes | Builds; production-shaped web |
| `src/lib` | biomechanics, calibration, intelligence, research, training and operations | Mixed production, shadow, experimental and fixture-only |
| `scripts` | workers, sanity suites, diagnostics, integration tools | 116 files; many are the only test harness |
| `supabase/migrations` | schema, RLS, storage and RPC history | 52 ordered migrations |
| `supabase/tests` | SQL integration coverage | One orchestration SQL file |
| `ios/AVASprint` | Xcode project, SwiftUI app and Swift package | Portable-tested; device/release unproved |
| `e2e` | Playwright golden path | Five support/spec files; environment-dependent |
| `validation` | governed dataset manifest and panning fixtures | One real, ineligible 30 FPS fixture |
| `docs` | architecture, policy, audits and runbooks | ~270 files; numerous implementation claims need state labels |
| `.github/workflows` | quality-gate workflow | Defined locally; no observed remote run in audit evidence |
| `Dockerfile.worker` | analysis worker image | Hardened design; local Docker/runtime not proven |

## Web route inventory

The build emitted 27 routes. Core authenticated routes are dashboard, athlete detail,
session detail, timing workspace, report and account. Research, benchmarks, comparisons,
projections, coaching/root-cause/optimization and orchestration routes are predominantly
catalog/developer workspaces. Only `/api/health` and `/api/analyses/[id]/result` exist as
HTTP APIs; the documented mobile API does not.

## Major library families

The core families are `biomechanics`, `calibration`, `video`, `analysis`, `jobs`,
`measurement`, `intelligence`, `rootCause`, `rootCauseRecommendation`,
`performanceOptimization`, `projectionEngine`, `benchmarkEngine`, `digitalTwin`,
`adaptiveCoaching`, `research`, `scientificValidation`, `trainingProgram`, `mobile`,
`operations`, `privacy`, `auth`, and `supabase`.

The family count overstates integration. Many engines have contracts, fixture catalogs and
sanity tests but are disabled, shadow-only, developer-facing, or lack durable providers.

## Generated/local artifacts

Local virtual environments, `.next-e2e`, artifacts, logs, model files, Playwright output and
Swift `.build` are present. They are not source-of-truth release artifacts. Large local
environments dominate filesystem counts and must remain excluded from review/deployment.
