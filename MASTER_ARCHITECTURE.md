# AVA Sprint master architecture

## Product boundary

AVA Sprint is a Next.js/Supabase sprint-biomechanics platform with a deterministic,
versioned intelligence stack. The current repository remains a web application; native
iOS capture, distribution, privacy manifest, signing, and TestFlight infrastructure are
separate production blockers.

Biomechanics produces validated measurements. Intelligence consumes structured outputs
only. No intelligence engine may consume raw frames, pixels, pose coordinates, chat, or
unreviewed experimental data unless its own contract explicitly labels and isolates that
path.

## Intelligence architecture

The authoritative runtime metadata is
`src/lib/intelligence/registry.ts`. Every engine declares version, lifecycle, owner,
dependencies, contracts, cache policy, flags, documentation, dashboard, and tests.

Primary decision path:

`Observation → Interpretation → Root Cause → RCI Adapter → Recommendation → Priority → Performance Optimization → Adaptive Coaching`

Coach Report currently branches from Priority and composes analysis-scoped evidence.
Research, Benchmark, Projection, and Digital Twin are versioned support systems. Mobile
is a future cache consumer, not an engine.

The Intelligence Orchestration Layer is the coordination authority for feature-gated
shadow/internal runs. A pipeline manifest is the target atomic read boundary. Existing
engine pointers remain behind controlled compatibility modes during cutover, and
unrestricted production execution remains disabled.

## Invariants

- Recommendation owns eligibility, safety, contraindications, cues, drills, and content.
- The RCI adapter is post-eligibility and defaults to shadow.
- Priority applies no RCI rescore.
- Optimization owns the two-focus investment decision.
- Adaptive Coaching consumes Optimization dispositions and does not rerank.
- Every external-model call count in production deterministic states is zero.
- App open reads active caches and never invalidates or recomputes them.
- Historical events and state snapshots are append-only.

## Shared infrastructure

`src/lib/intelligence/shared` owns byte-compatible FNV fingerprints, confidence
terminology, registry/cache/trace/provenance schemas, and deterministic template lookup.
Domain score weights remain engine-owned.

See [INTELLIGENCE_PIPELINE.md](./INTELLIGENCE_PIPELINE.md),
[ENGINE_REGISTRY.md](./ENGINE_REGISTRY.md), [DATA_FLOW.md](./DATA_FLOW.md),
[CACHE_ARCHITECTURE.md](./CACHE_ARCHITECTURE.md), and [VERSIONING.md](./VERSIONING.md).
