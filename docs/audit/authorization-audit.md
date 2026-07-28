# Authorization audit

## Existing model

`profiles.id = auth.uid()`. A coach owns `athletes`; athletes own sessions; sessions own
analyses/artifacts/derived records. RLS follows that chain. Sensitive queue and orchestration
RPCs are revoked from public roles and granted to `service_role`. Research reviewer access is
separate.

## Findings

- Ownership sanity tests pass locally.
- The model is coach-centric; athlete login and coach-athlete relationship semantics are not
  comprehensively implemented.
- Admin/developer workspaces must fail closed in production; static route existence alone is
  not authorization.
- Service-role code is powerful and must exist only in worker/server runtime.
- A single operation matrix covering read/write/delete/export/share/approve for coach,
  athlete, admin, reviewer, worker and anonymous roles is missing.
- Cross-athlete negative tests need to run against applied staging migrations/storage, not
  just source assertions.
- Derived snapshot and storage deletion authorization/completion is not proven.

Any cross-athlete read/write is S0/P0 and a beta suspension event.
