# Intelligence cache architecture

## Canonical pattern

Future athlete-scoped intelligence caches use:

1. immutable snapshot table;
2. one athlete-scoped active-pointer table;
3. explicit invalidation queue;
4. append-only audit;
5. deterministic input fingerprint;
6. owner-scoped append-and-activate RPC;
7. cache-only read RPC;
8. app open excluded from invalidation.

Snapshot insertion, optional auxiliary records, active-pointer update, invalidation
completion, and audit insertion should be transactional.

## Existing implementations

| Migration | State |
| --- | --- |
| 0041 | Performance Projection |
| 0042 | Athlete Digital Twin |
| 0043 | Adaptive Coaching |
| 0044 | Performance Optimization |
| 0045 | Root Cause |
| 0046 | RCI Recommendation Adapter |

These migrations share semantics but differ in historical naming. Do not edit deployed
migrations to cosmetically align them. Use the shared cache metadata contract and this
template for future work; add compatibility migrations only when operational value
justifies them.

## Idempotency and collisions

Same normalized input and engine version must generate one fingerprint. Insert uses an
athlete/fingerprint uniqueness constraint. A matching fingerprint with unequal state is a
collision and fails closed.

## Retention and performance

Active reads should retrieve one pointer and one snapshot. Immutable history can be
archived under a documented retention policy later. Trace compression or archival must
not change active state contracts.
