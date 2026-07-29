# Deterministic orchestration health

Health uses measurable rates for pipeline success, material/contract mismatches, cache
validity, retry/terminal failure, leases/recovery, activation/rollback, duration/backlog,
dead letters, adapter coverage, store health and migration compatibility.

States are healthy, degraded, unhealthy, execution disabled and validation incomplete.
Every result retains metrics, thresholds and explicit reasons. There is no opaque score
or language model summary. Current repository defaults evaluate to execution disabled
because live orchestration is OFF.

