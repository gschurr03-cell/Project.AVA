# Manifest cutover readiness

Readiness requires at least 50 successful shadow runs across 10 distinct fixtures or
athletes, complete required-adapter coverage, zero unresolved contract incompatibilities,
zero material mismatches, terminal failures no higher than 2%, zero activation failures,
and passing recovery, rollback, owner-isolation, migration, telemetry, dashboard,
documentation and manual-approval gates.

Every gate reports status, measured value, threshold, evidence source, blocker and
evaluation time. Evidence older than 24 hours is stale. Evaluation never changes rollout
mode. Current readiness is blocked by zero real shadow runs, two deferred adapters,
incomplete consumer migration, incomplete concurrency evidence and no manual approval.

