# Load-test plan and results

No production-like load result exists. Local orchestration load sanity is not capacity proof.

Staging plan: synthetic accounts only; ramp profile/dashboard/read paths, upload initiation,
concurrent valid/invalid uploads, analysis submissions, reports, current plans, readiness,
events, coach review and reconnect bursts to expected cohort load plus 2x safety margin.
Record p50/p95/p99, errors, queue growth/age, DB connections/latency, CPU/memory/I/O and
cost. Exercise retry storms and provider slowdown. Admission must close when queue age or
worker saturation crosses the validated limit.

