# Training event reduction

The reducer validates scope and schema, sorts by sequence and stable ID, deduplicates, and
applies pure transitions. Replaying the same material stream produces the same fingerprint,
including when input order differs. Late events produce a new state revision after replay.
Safety events remain in the event IDs and review triggers.

Production still needs transactional sequence allocation, append-only storage, quarantine,
checkpoint persistence, conflict-resolution policy, retention/load testing, and replay
authorization.

Checkpoint snapshots retain reduced event IDs and idempotency keys, preventing exposure
duplication when a previously reduced event is received again. A structurally valid event
with a newer event version is recorded in `ignoredFutureEventIds` and has no state effect.
Malformed current-version events still fail closed.
