# Intelligence Engine Registry

The machine-readable authority is `INTELLIGENCE_ENGINE_REGISTRY` in
`src/lib/intelligence/registry.ts`. Documentation must not override that source.

| Engine | Lifecycle | Cache | Primary test |
| --- | --- | --- | --- |
| Observation | Production | Derived result | `observation-engine:sanity` |
| Interpretation | Production | Derived analysis result | `interpretation-engine:sanity` |
| Root Cause | Development | Migration 0045 snapshot | `root-cause:sanity` |
| RCI Recommendation Adapter | Shadow | Migration 0046 snapshot | `root-cause-recommendation:sanity` |
| Recommendation | Production | Derived analysis result | `recommendation-engine:sanity` |
| Priority | Production | Derived analysis result | `priority-engine:sanity` |
| Performance Optimization | Development | Migration 0044 snapshot | `performance-optimization:sanity` |
| Adaptive Coaching | Development | Migration 0043 snapshot | `adaptive-coaching:sanity` |
| Coach Report | Production | Saved analysis snapshot | `coach-report:sanity` |
| Research Knowledge | Production | Versioned dataset | `research-engine:sanity` |
| Benchmark | Production | Versioned dataset | `benchmark-engine:sanity` |
| Performance Projection | Development | Migration 0041 snapshot | `projection-engine:sanity` |
| Athlete Digital Twin | Development | Migration 0042 snapshot | `digital-twin:sanity` |

Registry validation confirms unique IDs, strong versioned contracts, declared ownership,
test/document paths, dependency existence, offline/cache compatibility, and pipeline
acyclicity.

“Development” means the deterministic engineering foundation exists but production
orchestration, staged database validation, field validation, or native delivery remains.
