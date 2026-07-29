# Orchestration data safety

| Record | Stored | Prohibited |
| --- | --- | --- |
| Queue message | Opaque job/plan IDs, availability | Video, pose arrays, notes |
| Run/plan | IDs, versions, graph, bounded request metadata, fingerprints | Secrets, arbitrary objects |
| Trace | Versions, timing, fingerprints, cache/failure metadata | Engine payloads, raw frames |
| Comparison | Baseline metadata, per-engine differences, readiness | Baseline payloads, video |
| Manifest | Snapshot references, versions, provenance IDs, integrity hash | Raw media |
| Staged snapshot | Validated bounded engine output | Unbounded payloads |
| Telemetry | Opaque scope/run/job IDs and operational metrics | Names, health data, notes, inputs/outputs |
| Dead letter | Failure metadata and bounded internal note | Duplicated snapshot payloads |

All operational tables use RLS with no ordinary client writes. Owner-facing reads use
security-definer functions with ownership checks. Replay remains athlete-scoped. Staged
outputs are capped at 512 KiB, comparisons at 320 KiB, traces at 32 KiB and internal
notes at 500 characters.

Retention is not automated yet. Proposed initial retention is 30 days for traces and
comparison detail, 90 days for dead letters, and indefinite manifest/audit retention
until legal/privacy review approves deletion rules.

