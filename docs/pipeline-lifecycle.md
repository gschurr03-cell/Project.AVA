# Pipeline lifecycle

Jobs move through `queued`, `waiting`, `ready`, `running`, `retrying`, `succeeded`,
`failed`, `cancelled`, and `rolled_back`. A job becomes ready only when its stored
predecessors succeeded. Independent ready jobs may run together when the parallel flag
is enabled.

Each execution emits timing, version, input/output references and fingerprints, cache
outcome, retry count and safe failure details. Progress is derived from persisted job
states. Leases allow a replacement worker to reclaim interrupted work without changing
execution logic.

Failures invalidate only descendants in the stored graph. An unrelated research refresh
does not invalidate an active recommendation manifest; a Coach Report failure does not
destroy a previously active Adaptive Coaching snapshot. A failed plan never publishes
its staged manifest.

