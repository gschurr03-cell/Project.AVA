# AVA completion scorecard

Scores are percentages. `A` architecture, `I` implementation, `C` connection, `T` automated
test, `V` real validation, `L` launch readiness. Overall weights are 10/25/20/15/15/15.

| Category | A | I | C | T | V | L | Weighted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Repository health | 75 | 65 | 60 | 65 | 40 | 35 | 57 |
| Backend core | 85 | 82 | 75 | 75 | 45 | 45 | 68 |
| Native iOS | 75 | 55 | 20 | 45 | 5 | 5 | 35 |
| Video capture | 70 | 55 | 35 | 45 | 10 | 5 | 37 |
| Upload | 80 | 68 | 50 | 65 | 20 | 20 | 51 |
| Processing pipeline | 90 | 85 | 78 | 75 | 25 | 30 | 65 |
| Athlete detection/crop | 75 | 70 | 65 | 60 | 10 | 10 | 48 |
| Pose | 85 | 82 | 75 | 70 | 20 | 25 | 59 |
| Calibration/timing | 85 | 78 | 70 | 75 | 25 | 25 | 59 |
| Steps/metrics | 88 | 82 | 75 | 80 | 25 | 25 | 61 |
| Confidence/quality | 85 | 78 | 70 | 75 | 15 | 20 | 56 |
| Result activation | 90 | 82 | 70 | 75 | 25 | 30 | 62 |
| Coach Reports | 88 | 82 | 68 | 75 | 5 | 15 | 53 |
| Root Cause | 90 | 82 | 58 | 75 | 5 | 10 | 49 |
| Recommendations/Priority | 90 | 85 | 65 | 80 | 5 | 10 | 53 |
| Optimization/projections | 85 | 78 | 45 | 70 | 0 | 5 | 42 |
| Benchmarks/Digital Twin | 88 | 80 | 52 | 75 | 5 | 10 | 47 |
| Athlete progress | 75 | 60 | 45 | 55 | 5 | 10 | 39 |
| Training intelligence | 92 | 75 | 20 | 75 | 0 | 0 | 40 |
| Training execution | 70 | 20 | 0 | 25 | 0 | 0 | 13 |
| Longitudinal coaching | 90 | 70 | 10 | 70 | 0 | 0 | 35 |
| Coach tools | 70 | 45 | 25 | 35 | 5 | 5 | 29 |
| Offline/sync | 80 | 50 | 10 | 55 | 0 | 0 | 29 |
| Notifications | 60 | 15 | 0 | 10 | 0 | 0 | 9 |
| Analytics/observability | 80 | 55 | 15 | 50 | 0 | 5 | 30 |
| Security | 82 | 65 | 55 | 60 | 15 | 20 | 48 |
| Privacy/legal | 70 | 45 | 25 | 25 | 0 | 5 | 25 |
| Infrastructure | 80 | 45 | 15 | 35 | 0 | 5 | 26 |
| CI/CD | 80 | 65 | 35 | 55 | 10 | 10 | 42 |
| Scientific validation | 92 | 60 | 25 | 65 | 0 | 0 | 34 |
| Documentation | 90 | 90 | 70 | 20 | 35 | 45 | 61 |
| Closed-beta readiness | 80 | 63 | 43 | 55 | 10 | 15 | **42** |
| Public-launch readiness | 72 | 50 | 30 | 40 | 5 | 5 | **29** |

## Evidence behind headline percentages

- **Overall 56%:** averaged product implementation is broad, discounted for missing native,
  training, science and operations connections.
- **Backend 72%:** web build and core local suites pass; deployment and real integration do
  not.
- **Native 38%:** the architecture and source are real, but its backend and release path are
  not.
- **Scientific validation 18%:** scoring the validation outcome rather than the mature
  validation framework; there are zero eligible reference studies.
- **Training 34%:** substantial deterministic engine with essentially no production
  connection/validation.
- **Security 48% and operations 31%:** local controls and design exist; managed runtime proof
  is missing.

Unknown/unmeasured areas are not scored as complete: App Store review, physical-device
performance, provider SLA, real queue capacity, restore RTO, coach agreement, athlete
comprehension, model error distributions and public abuse resistance.
