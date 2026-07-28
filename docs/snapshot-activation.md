# Snapshot activation and rollback

Engine adapters persist immutable candidate snapshots. They cannot publish those
snapshots individually. When every required job succeeds, the trusted server calls one
database transaction with the complete engine-to-snapshot manifest.

The transaction locks the plan and athlete pointer, verifies all jobs succeeded and the
manifest cardinality matches the plan, creates an immutable pipeline snapshot, switches
the athlete's active pipeline pointer, completes the plan and writes an audit event.
Readers therefore see either the previous complete manifest or the new complete
manifest—never an intermediate mixture.

Rollback locks the same pointer, restores the recorded previous manifest, marks the
rejected manifest and plan rolled back, and audits the reason. It preserves every engine
snapshot for investigation. Existing per-engine active pointers remain legacy read
paths; production cutover requires their consumers to read through
`active_intelligence_pipelines`.

