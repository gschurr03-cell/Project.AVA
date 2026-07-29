# Mobile vertical-slice contract

All responses use `{data,error,meta}` with request ID, server time, API/resource version,
retryability and retry delay. Errors are stable codes and never expose SQL, storage paths,
provider errors or secrets.

- Authentication uses Supabase email/password, access/refresh tokens and expiry. iOS stores
  the session in Keychain (`AfterFirstUnlockThisDeviceOnly`), refreshes through the existing
  coordinator and clears account data on logout.
- `GET /athlete` returns only the athlete explicitly linked by `athletes.user_id`.
- `GET /capabilities` is authoritative for formats, 59 FPS lower class boundary, 60 Hz
  analysis, size, TTL, disabled metrics and beta flags.
- Upload creation validates MP4/QuickTime, size, duration, FPS and SHA-256, then generates an
  athlete-scoped object key and expiring signed upload URL. Completion verifies the stored
  object and exact size. The client checksum is retained; Supabase signed upload does not
  expose a portable server-side SHA-256, so checksum equality remains a worker verification.
- Analysis submission requires an owned completed upload and a unique idempotency key. It
  creates the canonical session/analysis/job path.
- Status is derived from `analysis_jobs` plus `analyses`, never fabricated progress.
- Results come only from a completed analysis with matching result identity and provenance.
  The mobile metric allowlist excludes peak velocity, contact time and side frequency.
- Deletion authenticates ownership, removes source and pose artifacts, deletes the parent
  session/analysis, retains a minimal audit row and reports pending if storage fails.
