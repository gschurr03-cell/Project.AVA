# Execution plans

An `ExecutionPlan` binds an analysis and athlete to the pipeline/orchestrator versions,
every selected engine version, the validated dependency graph, topological order,
parallel stages, scheduled jobs, snapshot targets, timestamp, and deterministic input
fingerprint.

Planning rejects duplicate engines/dependencies, missing engines/dependencies, missing
contracts, blank versions, and cycles. Targeted plans include each target's synchronous
ancestors. Execution uses the stored plan rather than recalculating order after restart.
The database uniqueness key `(analysis_id, pipeline_version, input_fingerprint)` makes
creation idempotent.

Cache validity is decided by the engine adapter against its registered cache policy and
input fingerprint. A valid cached snapshot records a cache hit and succeeds without
calling domain execution. A miss proceeds through all adapter stages.

