# Shadow execution

`ShadowExecutionCoordinator` accepts a validated plan, invokes an injected pipeline
executor with `authoritative:false`, stages snapshots, creates a shadow-only manifest,
resolves one authoritative baseline per engine, applies versioned equivalence policies,
and persists a bounded immutable report.

Database constraints require `authoritative=false`. Shadow RPCs never write
`active_intelligence_pipelines`, and normal manifest reads join only active authoritative
manifests. The local SQL fixture proves a shadow manifest and report leave the prior
active manifest unchanged. The TypeScript integration used one deterministic synthetic
Observation fixture and produced one exact match. No real-athlete shadow run was executed.

