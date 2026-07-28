# Failure injection

The test/development-only injector supports fifteen lifecycle boundaries from plan
persistence through claims, heartbeat, adapter execution, staging, activation,
acknowledgement, rollback and recovery. Categories include deterministic transient,
validation, dependency, contract, version, infrastructure, lease expiry, cancellation
and worker termination.

Activation requires a test/development environment, explicit enablement, an authenticated
internal caller and an allowlisted point. Production attempts are rejected. All points
were unit exercised; database transaction interruption and real process termination were
simulated through existing rollback/lease tests rather than OS-level worker crashes.

