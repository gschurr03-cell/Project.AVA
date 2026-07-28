# Release and rollback runbook

Build one immutable web/worker/native candidate, attach commit/release/provenance/SBOM,
promote the same artifact to staging, run smoke/integrity tests, require approval, then
promote to beta cohort. Deployment and exposure remain separate flags.

Rollback order: stop cohort expansion; disable affected server flag; pause queue/plan
activation if integrity is threatened; redeploy prior compatible artifact; roll back active
manifest/rule/catalog pointer; preserve queued/safety events and audit; validate. Never
reverse a destructive/data migration blindly—forward remediate. No remote rollback rehearsal
has occurred.

