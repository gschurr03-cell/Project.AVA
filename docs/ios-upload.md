# iOS upload architecture

Uploads have persisted, account-scoped records and an explicit lifecycle from queued
through verification, submission, completion, recoverable/terminal failure, cancellation,
and connectivity waiting. Records contain no credential. Mutations use idempotency keys,
and completion is valid only after server reconciliation and integrity verification.

`BackgroundUploadSession` is a file-backed background URLSession foundation with a stable
environment identifier, system launch events, connectivity waiting and delegate progress/
completion. Pure policies cover network restrictions, bounded transient retries and
permanent failures. The coordinator still needs persisted task mappings and application
completion-handler forwarding. Server resumability remains blocked until
`/api/mobile/v1/uploads` defines signed initialization, status and integrity completion;
this is not termination- or device-proven.
