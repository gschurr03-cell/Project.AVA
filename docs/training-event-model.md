# Training event model

Training events are strict v1 records with event ID, server sequence, athlete and account
scope, event/effective timestamps, source authority, typed event category, plan/session/
exercise references, bounded structured payload, confidence, provenance, and idempotency
key. Supported categories cover plan lifecycle, session lifecycle, modifications, symptoms,
readiness/restrictions, competition/testing/analysis, coach review, availability, travel,
and illness.

Free-form notes are not authoritative state. Persistence must bound/redact text payloads.
Device timestamps are evidence only; server sequence controls replay order.

