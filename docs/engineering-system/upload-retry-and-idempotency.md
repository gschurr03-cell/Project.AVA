# Upload retry and idempotency

One logical file attempt owns one UUID idempotency key. Initiation and confirmation reuse it
after timeouts; a new selection uses a new key. The server’s unique `(user_id,
idempotency_key)` constraint provides canonical identity, while the route rejects altered
filename, type, size, digest or metadata on reuse.

Connectivity, timeout, selected service/rate-limit failures and expired authorization are
retryable within five attempts using bounded exponential delay and jitter. Validation,
ownership, unsupported media, quota, integrity and cancellation failures are terminal.
Expired storage authorization is refreshed for the same canonical upload; it is never
blindly reused.
