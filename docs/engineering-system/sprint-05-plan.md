# Sprint 05 — Native upload

Objective: recoverable verified mobile video upload.

Authoritative tasks: `AVA-0026`, `AVA-0027`.

Execution order:

1. Complete locally testable `AVA-0026` foundations behind existing protocols: canonical
   state, persisted attempts, eligibility, authorization safety, idempotency, progress,
   cancellation, retry and recovery.
2. Complete locally testable `AVA-0027` lifecycle/orphan classification and cleanup
   foundations after `AVA-0026`.
3. Retain both tasks In Progress until their explicit live acceptance evidence exists:
   kill/relaunch/network-loss recovery and zero unexplained storage-orphan classes.

`AVA-0006` and `AVA-0012` remain incomplete hard dependencies for live provider and
end-to-end lifecycle evidence. Local deterministic work must proceed through typed protocols
without representing mocks as staging.
