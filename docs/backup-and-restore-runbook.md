# Backup and restore runbook

Backup readiness is **not proven**. Before beta configure encrypted database point-in-time
recovery/snapshots, object metadata/versioning where approved, configuration/IaC state, and
immutable catalog/rule versions with owner, retention and failure alert.

Restore in isolated staging: restore DB to a recorded point, deploy compatible release,
reconcile object references, validate auth, audit history, active analysis/plan manifests
and migrations, record RPO/RTO and missing data, then destroy the test environment. Provider
replication alone is not a backup.

