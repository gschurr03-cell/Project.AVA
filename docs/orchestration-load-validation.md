# Local load and concurrency validation

This is a local in-memory operational simulation, not production-scale evidence.

On 2026-07-18 it built 100 athlete-scoped plans and drained 500 jobs with eight workers:

- plan build: 11.90 ms total, 0.119 ms average;
- queue drain: 3.42 ms total, 0.007 ms average claim/execute;
- duplicate claims: zero;
- twenty identical enqueues: one execution.

Initial configurable health thresholds use 98% pipeline success, at most 1% material
shadow mismatch, 2% terminal failure, 0.5% activation failure, 120-second p95 duration,
100 queued jobs and complete required-adapter coverage. These are conservative starting
gates, not capacity promises.

Database multi-connection contention, connection-pool pressure, cache-heavy domain
execution, query counts and production hardware remain unvalidated.

