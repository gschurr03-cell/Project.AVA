# Orchestration read cutover

All new reads use `resolveActivatedIntelligenceSnapshot`, a read-only owner-scoped
service incapable of triggering computation.

- `LEGACY_ONLY`: current behavior.
- `SHADOW_MANIFEST`: return legacy output and compare fingerprints.
- `MANIFEST_PREFERRED`: use manifest output with legacy fallback.
- `MANIFEST_REQUIRED`: require manifest output.
- `MANIFEST_ONLY`: require manifest and explicitly disable fallback.

Root Cause, RCI Adapter and Performance Optimization dashboards use this resolver.
Adaptive Coaching remains legacy because its RPC returns a compound summary rather than
only an engine snapshot. Other consumers await exact envelope mapping. The default is
`LEGACY_ONLY`.

