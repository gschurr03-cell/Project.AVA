# Longitudinal training state

`LongitudinalTrainingState` is an immutable, fingerprinted reduction of an athlete-scoped
ordered event stream. It records the active approved-plan pointer, exposure summaries,
session outcomes, readiness/pain/restriction/competition/performance/analysis references,
coach decisions, review triggers, and typed coaching memories. A reduction creates a new
revision; historical events are never rewritten.

Ordering uses server-authoritative `sequence`, then stable event ID. Event and idempotency
duplicates are ignored. Wrong-account or wrong-athlete events fail closed. Unknown future
event types are rejected by the v1 parser and may be quarantined by a future persistence
adapter; they never silently affect state. Checkpoints are supported as explicit prior
snapshots, but a production checkpoint/event store is not implemented.

