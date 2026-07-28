# Intelligence pipeline

## Synchronous evaluation DAG

```text
Observation
  ↓
Interpretation
  ↓
Root Cause Intelligence
  ↓
Root Cause-to-Recommendation Adapter
  ↓
Recommendation
  ↓
Priority ─────────────→ Coach Report
  ↓
Performance Optimization
  ↓
Adaptive Coaching
  ↓
Cached client/mobile consumption
```

The code validator rejects missing engines, invalid predecessors, and synchronous cycles.

## Support dependencies

- Root Cause reads Digital Twin, reviewed Research, compatible Benchmark, and Projection references.
- Optimization reads Digital Twin, Recommendation, Research, Benchmark, and Projection evidence.
- Adaptive Coaching reads Optimization and Digital Twin.
- Coach Report composes Observation, Interpretation, Recommendation, and Priority.

Coach feedback is appended to Digital Twin history and can invalidate a later Root Cause
evaluation. This is an asynchronous event loop across immutable versions, not a recursive
pipeline call.

## Influence ownership

| Decision | Sole owner |
| --- | --- |
| Measurement availability | Biomechanics/result contract |
| Interpretation meaning | Interpretation |
| Root-cause hypothesis | Root Cause |
| Root-cause recommendation context | RCI Adapter |
| Recommendation eligibility/content/safety | Recommendation |
| Analysis priority | Priority |
| Limited-time investment order | Performance Optimization |
| Coaching lifecycle presentation | Adaptive Coaching |

RCI modifier provenance explicitly prohibits downstream reapplication.

## Known incomplete connections

- Real server orchestration for Root Cause candidate/edge assembly remains.
- Adapter production registry is shadow-only.
- Coach Report does not yet consume cached Adaptive Coaching state.
- No native mobile cache consumer exists.
- Research and Benchmark orchestration remain deferred until trusted activated
  catalog/dataset loaders exist.
- Manifest reads migrate incrementally and default to legacy-only.
