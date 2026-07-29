# Performance Optimization Layer

## Contract and boundary

The deterministic Performance Optimization Layer sits between Priority and Adaptive
Coaching. It answers one bounded question: which supported focuses have the highest
expected long-term return on limited training attention?

It does not create observations, interpretations, recommendations, priorities, benchmark
claims, research claims, or race-time predictions. Inputs must carry their source
identities. Unsupported relationships remain absent or unknown.

`PerformanceOptimizationState` is versioned, immutable, cacheable, and portable offline.
For the same normalized input and engine version, output and fingerprint are stable.
The compute policy requires zero external model calls and prohibits randomness.

## Decision lifecycle

The optimizer emits at most two `investment` focuses plus unlimited logical
`maintenance`, `monitoring`, `deferred`, `ignored`, and `retired` dispositions. Adaptive
Coaching consumes those dispositions and never rescales or reranks them.

Coach actions (`accept`, `reject`, `lower_ranking`, `raise_ranking`, `lock`, `disable`)
are applied once inside optimization and retained in the audit trace.

## Cache and invalidation

Migration 0044 stores immutable snapshots, an active pointer, invalidations, and audit.
New compatible analysis, Digital Twin changes, evidence-version changes, coach overrides,
competition schedule, season transition, and manual regeneration may invalidate state.
App open only reads the active cached state.
