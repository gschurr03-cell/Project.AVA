# Analysis retry policy

Retries reuse the canonical analysis and durable job identity. Each claim increments the
attempt count and receives a new claim token. Backoff is bounded and stored in
`next_attempt_at`. Expired leases are recovered before new claims. Maximum-attempt exhaustion
dead-letters the job.

Stale workers cannot stage or complete after token/lease loss. Scientific/input failures are
not retried indefinitely. Manual replay requires the service-role operation and audit
evidence owned by `AVA-0029`.
