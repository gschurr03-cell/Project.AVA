# Dead, duplicate and disconnected code

## Verified disconnected

- `src/lib/mobile/betaContracts.ts` and native network contracts have no corresponding
  `/api/mobile/v1` routes.
- Training program and longitudinal modules are registered/tested but default disabled and
  lack persistence/UI execution.
- Several developer workspaces are static catalogs or diagnostics rather than consumer
  workflows.
- `processVideo` still defaults to a mock backend in its generic development path; the real
  worker injects MediaPipe and must remain the only production entry.
- RTMPose is present for experimental comparison and is not a production metric source.

## Duplicate sources requiring consolidation

- Legacy `lib/coaching`/older intelligence derivation and the newer versioned
  observations/interpretations/recommendation/priority/report stack.
- Direct engine snapshot tables/RPCs and the newer orchestration manifest/read model.
- Render-time session/report derivation and immutable activated snapshot intent.
- Multiple documentation files describe adjacent “canonical” architectures without one
  status-indexed source.
- Worker result callback and service-role RPC completion paths.

## Removal policy

No code was removed. Static non-import evidence is insufficient for Next routes, scripts,
dynamic adapters or operational tools. Each proposed removal is listed in the removal
backlog with call-site search, runtime/test gate and rollback requirement.
