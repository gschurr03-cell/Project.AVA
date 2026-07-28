# Orchestration rollout

Execution defaults to `OFF`; its server flag also defaults false. The gate requires an
allowed environment, authorized caller, valid owner scope/plan, healthy store, supported
registry, permitted migration state, idempotency key and allowlisted adapters.

- `OFF`: reject planning/execution.
- `PLAN_ONLY`: validate/persist a plan without jobs.
- `SHADOW`: execute and stage without authoritative activation.
- `INTERNAL`: authorized internal activation only.
- `BOUNDED_PRODUCTION`: bounded production activation; never the default here.

No browser endpoint exposes execution, worker claims or activation.

Internal rollout additionally allowlists environment, owner, athlete, role, engine set
and analysis type. It always prohibits user-authoritative activation. Shadow and internal
manifests carry explicit scope/status markers and cannot resolve through the normal active
manifest RPC.
