# Sprint 05 local upload integration

Evidence classification: **portable local integration**, not simulator, device or staging.

The deterministic Swift test `localUploadFoundationRecoversOneCanonicalAttempt` creates one
account-scoped persisted logical upload, preserves its canonical upload ID and idempotency
key, records partial transfer progress, reconstructs it from disk, chooses restart after a
missing OS task, and accepts canonical server completion without requiring the local file.

Companion tests cover cross-account isolation, terminal filtering, renewed authorization
safety, bounded retry, network policy, cancellation/late-callback rejection and stable
streaming SHA-256. The focused Supabase suite adds 12 database assertions for upload RLS,
write restrictions and per-user idempotency.

This harness does not transfer a real fixture through Supabase Storage because the mobile
provider/storage emulator integration and authenticated test principal are not configured.
That limitation is retained in `AVA-0026`; deployed orphan enumeration remains in
`AVA-0027`.
