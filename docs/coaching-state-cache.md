# CoachingState cache and invalidation

`CoachingState` is a precomputed immutable server result and the single read model for
athlete-facing coaching focus.

The active pointer is served whenever the application opens. Opening a page is not an
invalidation trigger and performs no coaching evaluation.

Valid invalidation events are:

- new completed analysis;
- coach override;
- benchmark version change;
- Digital Twin update;
- recommendation acceptance or rejection;
- competition schedule change;
- season transition;
- relevant research version change;
- manual regeneration.

Trigger IDs are athlete-scoped and idempotent. A conflicting replay fails closed.
Evaluation records processed trigger IDs in the state. State persistence is keyed by an
input fingerprint; identical evidence cannot create a different snapshot under the same
fingerprint.

Snapshot creation, active-pointer update, processed-trigger recording, and audit insertion
occur in one database transaction. Direct authenticated table writes are unavailable.

The cache inspector reads `get_cached_coaching_state` only. It never imports or calls the
evaluation engine.

