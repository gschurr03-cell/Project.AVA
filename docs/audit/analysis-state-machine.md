# Analysis state machine audit

Canonical durable job states are queued, claimed/running stages, retryable, completed,
failed, dead-lettered and cancelled, with lease ownership, heartbeat and bounded attempts.
Session/analysis display states map onto this job state but are separate records.

Strengths: idempotent claim RPC, lease expiry/recovery, stage reporting, atomic completion,
failure classification and sanity coverage.

Risks:

- deployment has not proved multiple workers, termination recovery or long MediaPipe jobs;
- legacy callback and production RPC completion are parallel boundaries;
- session, analysis, job and activated snapshot can still disagree without reconciliation;
- user-safe failure codes and retry visibility need full UI/E2E coverage;
- dead-letter operator workflow exists in design but has no monitored production consumer.

Activation must occur only after complete provenance/schema/integrity validation. Failed or
unsupported video must never activate metrics or intelligence.
