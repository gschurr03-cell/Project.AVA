# Sprint 06 analysis architecture audit

Canonical local lifecycle:

completed `mobile_uploads` row → authenticated idempotent analysis request → analysis/session
and one `analysis_jobs` row → atomic database claim/token/lease → private object retrieval →
60 FPS MediaPipe pipeline → versioned metrics/provenance/result/artifacts → atomic terminal
RPC → owned status/result APIs.

The durable job schema already provides attempt counts, maximum attempts, claim tokens,
leases, heartbeat, retry scheduling, dead-letter state, safe failures and service-role-only
RPCs. The worker validates configuration/model, claims atomically, heartbeats, records stages,
uses server-controlled storage paths and rejects stale completion. The result foundation
stores provenance, pipeline/schema versions, safe payloads and artifact paths.

Existing local strengths:

- authenticated upload ownership and analysis idempotency;
- one job per analysis and atomic claim/complete/fail RPCs;
- bounded retries, stale-lease recovery and cancellation state;
- shared 60 FPS policy and real MediaPipe production backend;
- nullable unavailable metrics instead of fabricated zero in the current mapper;
- local orchestration equivalence/rollback and load simulations;
- safe mobile status/result mapping.

Remaining production blockers:

- no hosted worker/golden 60/120/240 execution;
- no managed object-storage retrieval/recovery evidence;
- no deployed telemetry/SLO or authorized dead-letter replay;
- result-source decision/equivalence is unaccepted;
- golden scientific references and peak-velocity definition are unaccepted;
- local database job integrations could not be rerun in this pass because execution approval
  was unavailable; prior repository scripts remain present.

The generic `processVideo` path was the one unsafe production seam: it implicitly selected
the mock backend. Sprint 06 now requires an explicit backend at the type and runtime
boundaries. Explicit mock construction remains available for tests only.
