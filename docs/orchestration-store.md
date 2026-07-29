# Database orchestration store

`SupabaseOrchestrationStore` uses service-role-only RPCs. JSON payloads are bounded,
traces are limited to 32 KiB, staged output to 512 KiB, and context assembly remains an
injected trusted-server concern.

Migration 0048 adds immutable staged snapshots, progress events, request idempotency,
registry/adapter versions, integrity metadata, guarded state transitions, retries,
activation, snapshot resolution and paginated recovery.

The local Supabase stack was reset cleanly from migration 0001 through 0052 and the permanent
SQL integration test passed.
Reproduce with:

```sh
supabase start
supabase db reset
npm run orchestration-integration:sanity
docker exec -i supabase_db_project-ava psql -U postgres -d postgres \
  < supabase/tests/orchestration_integration.sql
```

The SQL test covers claim exclusivity, heartbeat, staging, two atomic activations,
rollback restoration, owner and cross-owner reads, idempotency uniqueness, and
unauthorized mutation. A true simultaneous multi-connection claim race remains a
follow-up live test.
