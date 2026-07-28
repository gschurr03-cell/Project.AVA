# Production orchestration adapters

`RegisteredAdapterCatalog` is an allowlist derived from the central engine registry. A
thin adapter validates engine input, fingerprints the input and governing versions,
calls the existing evaluator, validates its existing output schema, and returns an
immutable staged snapshot. It never changes domain behavior or an active pointer.

Executable bindings exist for Observation, Interpretation, Root Cause, Root
Cause-to-Recommendation, Recommendation, Priority, Performance Optimization, Adaptive
Coaching, Coach Report, Projection, and Digital Twin.

Research and Benchmark are explicitly deferred. Research lacks a trusted loader for its
reviewed `ResearchCatalog`. Benchmark lacks an activated, metric-specific dataset and
athlete-context loader. Required plans therefore fail closed instead of fabricating
operational inputs.

Adapter version 1 declares contract identifiers, implementation version, dependency
snapshot types, cache/timeout/retry policies, fingerprint fields, output validator and
availability.

