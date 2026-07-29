# Orchestration operational-readiness audit

Audit date: 2026-07-18

This audit evaluates behavior and validation evidence, not file presence.

| Capability | Classification | Evidence / blocker |
| --- | --- | --- |
| Registry adapters | Partial | 11 callable adapters in `adapters.ts`; Research and Benchmark intentionally deferred. |
| Adapter parity | Partial | Domain suites and adapter validation/catalog tests pass; fixture-level direct-versus-adapter parity is not complete for all 11 adapters. |
| Database store | Implemented but incomplete | `databaseStore.ts` persists lifecycle data through RPCs; no complete request-to-context production service exists. |
| Queue claim / lease / heartbeat | Integration tested | Local SQL fixture proves exclusive sequential claim and heartbeat; true simultaneous multi-connection contention is untested. |
| Retry scheduling | Unit/static tested | Deterministic-transient policy is bounded; full worker/database retry integration is incomplete. |
| Staged snapshots | Integration tested | Immutable staging and fingerprint collision protection pass locally. |
| Atomic manifests | Integration tested | Two activations and rollback pass locally. |
| Shadow manifests | Missing | Shadow store previously skipped activation and created no manifest/report. |
| Rollback | Integration tested | Migration 0050 restores prior manifest/status. |
| Manifest resolver / fallback | Unit tested | Five compatibility modes exist; three internal consumers migrated. |
| Consumer migration | Partial | Adaptive Coaching compound summary and other legacy consumers remain. |
| Recovery coordinator | Partial | Bounded recovery RPC exists; only a thin coordinator wrapper exists. |
| Telemetry | Contracts only | Vendor-neutral sinks exist but runtime emission is not fully wired. |
| Execution gates | Unit tested | Layered gate exists; bounded cohort/role/analysis allowlisting is incomplete. |
| Owner isolation | Integration tested | Manifest cross-owner read and unauthorized mutations fail locally. |
| Migrations | Integration tested locally | Clean 0001–0052 reset, SQL fixture and final ACL inspection pass. |
| Dashboard | Partial | Owner-scoped read-only job/history view; no comparisons, health, dead letters, or readiness. |
| Browser E2E | Missing | No dashboard E2E fixture/auth harness. |
| Live deployment | Not deployed | No production orchestration service or cloud worker. |

## Plan before operational-hardening changes

1. Add engine-aware equivalence, authoritative baseline metadata, immutable comparison
   reports, and a shadow-only manifest transaction.
2. Add replay/version availability, guarded failure injection, dead-letter records,
   deterministic health, cutover gates, and bounded internal cohort decisions.
3. Add forward-only persistence/RPC hardening and extend the owner-scoped dashboard.
4. Add local deterministic shadow/load/failure tests and expand SQL integration tests.
5. Keep legacy output authoritative, orchestration execution OFF by default, and record
   every unvalidated or production-unproven boundary explicitly.
