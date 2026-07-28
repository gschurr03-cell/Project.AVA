# Sprint 06 recovery matrix

| Scenario | Canonical state | Recovery | Local evidence | Live requirement |
| --- | --- | --- | --- | --- |
| crash after claim/download/analysis | claimed until lease expiry | expired lease schedules retry/dead letter | job SQL/static sanity | hosted termination |
| crash after persistence before acknowledgement | result exists, job claimed | token-checked idempotent completion/reconciliation | result/job contract sanity | managed DB interruption |
| API/worker restart | queued/retry state persists | database polling resumes | durable schema inspection | deployed restart |
| stale worker returns | newer claim owns token | stale stage/completion rejected | RPC/source integration fixtures | concurrent hosted workers |
| transient failure | retry scheduled | bounded backoff/new token | retry policy/static sanity | telemetry/SLO |
| terminal video failure | failed | no automatic retry | failure taxonomy/analysis sanity | representative invalid fixture |
| cancellation | cancelled | token cleared; late result rejected | schema/source sanity | active hosted cancellation |
| duplicate submission/publication | same analysis/job | user-scoped idempotency/unique job | route/migration sanity | concurrent deployed requests |
| orphan temporary file | no state promotion | worker `finally` cleanup/reconciliation | worker source audit | process-kill disk inspection |

Database job integration scripts exist but were not rerun in this pass because execution
approval was unavailable. Static and deterministic sanity evidence is not represented as
hosted crash recovery.
