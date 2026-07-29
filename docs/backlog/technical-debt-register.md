# Technical debt register

## Reliability-blocking

| Debt | Origin | Impact/risk | Timing | Treatment/dependency |
| --- | --- | --- | --- | --- |
| Huge uncommitted product surface | prompt-by-prompt development | unreproducible releases | Now | partition/commit, not rewrite |
| Dual callback/RPC completion | worker evolution | state drift | Before beta | consolidate after compatibility tests |
| Legacy and manifest reads | orchestration migration | inconsistent intelligence | Before broad rollout | staged refactor, AVA-018 |
| No mobile API provider | native contracts first | disconnected app | Now | implement existing contract |
| No training store | pure-domain-first design | no safe workflow | Before training beta | new durable provider |
| JSON snapshot drift | rapid engine versioning | unreadable history | Before beta | validate/version/migrate |

## Development-speed debt

Large session page, hundreds of single-purpose scripts, aliases executing identical suites,
manual database types, deprecated lint entry, and fragmented architecture documentation.
Address after the critical vertical is reproducible.

## Safe to defer

RTMPose cleanup, experimental 30 FPS research, public projections, broad benchmark
population, cosmetic dashboard optimization and large-artifact rendering optimization.
Refactor working modules; rewrite only if equivalence evidence shows an irreducible boundary.
