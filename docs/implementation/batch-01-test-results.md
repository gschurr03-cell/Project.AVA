# Batch 01 test results

Final test date: 2026-07-18.

| Gate | Result |
| --- | --- |
| Typecheck | Pass |
| Mobile API v1 sanity | Pass |
| Mobile contracts | Pass |
| Ownership/upload lifecycle | Pass |
| Worker analysis/jobs/result foundation | Pass |
| Production security + secret scan | Pass |
| Local migration dry run/apply | Pass; 0053 only |
| Database lint | Pass; zero errors |
| Focused mobile pgTAP | Pass; 12/12 |
| Full `supabase test db` | Harness fail: pre-existing orchestration SQL has no TAP plan; focused mobile file passes |
| Swift portable tests | Pass; 19/19 |
| Lint | Pass with pre-existing `VideoOverlay` hook warning and deprecated command notice |
| Next production build | Pass; 31 routes including 11 mobile routes |
| Worker configuration | Pass; compiled modules and MediaPipe model/runtime found |
| Playwright | Pass; 13 passed, 13 intentionally skipped by project matrix |

Not run/proved: managed staging API, real native login/upload, real worker video analysis,
controlled network/worker failure, telemetry sink/dashboard/alerts, backup restore/rollback,
simulator app target, physical iPhone or scientific accuracy.
