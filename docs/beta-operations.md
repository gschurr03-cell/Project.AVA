# Beta operations

The restricted `/admin/operations` route is available only to a server-verified `profiles.role=admin`.
It shows queue state, failure/retry counts, heartbeat evidence, release/environment, structured
support intake, deletion intake, and beta audit events. It never returns storage paths, signed
URLs, tokens, full profiles, athlete notes, or raw stack traces.

## Operator runbook

1. Confirm `/api/health`, the deployment status, and the latest worker heartbeat.
2. Review queue age, repeated failure category, attempt count, and worker version.
3. Trace user reports with `AVA-SUP-*` or the masked `AVA-*` analysis reference.
4. Distinguish recording/input failures from storage, database, timeout, or worker failures.
5. Retry only when `manual_retry_allowed` is true and through the existing service-role retry
   procedure. Never edit a job status manually or overwrite a newer successful analysis.
6. Cancel through the existing service-role cancellation procedure and confirm worker acknowledgement.
7. Process deletion requests using `docs/user-data-deletion.md`; record evidence without private data.
8. Pause submissions by setting `ANALYSIS_SUBMISSION_ENABLED=false` and redeploying the web service.
9. For a widespread failure, pause submissions, preserve failed attempts, record release/worker
   versions and safe references, rollback if appropriate, then resume only after a smoke test.

The dashboard is not proof of worker health by itself. Missing or stale heartbeat evidence is
shown as unknown/degraded/unavailable. User lookup, in-dashboard retries, invite management,
and role changes are intentionally deferred until audited transactional APIs exist.

