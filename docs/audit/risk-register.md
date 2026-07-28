# Risk register

| ID | Risk | Likelihood | Impact | Detectability | Current control | Required mitigation | Owner | Launch effect |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R01 | Wrong athlete/data access | M | Critical | Low | RLS/ownership | staging negative matrix + alert | Security | Stop |
| R02 | Incorrect sprint metric | H | Critical | Low | confidence/withholding | locked references + review | Science | Stop athlete claims |
| R03 | Scientific overclaim | H | High | Medium | language policies | claims registry enforcement | Product/Science | Stop |
| R04 | Unsafe training recommendation | M | Critical | Low | disabled/approval rules | professional review + durable gates | Coaching | Stop |
| R05 | Original video/data loss | M | Critical | Medium | private storage | reconciliation/backup/restore | Platform | Stop |
| R06 | Failed/orphan upload | H | High | High | lifecycle checks | resumable idempotent upload | Platform | Stop native beta |
| R07 | Analysis backlog/stuck lease | M | High | Medium | leases/retries | hosted load/alerts/dead-letter ops | Platform | Stop |
| R08 | Stale offline plan | M | Critical | Medium | offline safety contracts | expiry/sync/provider/device tests | Mobile | Stop training |
| R09 | Lost pain/safety event | M | Critical | Low | pure event model | durable ingestion + paging | Coaching | Stop |
| R10 | Secret/service-role exposure | L | Critical | Low | separation/scanner | managed rotation + monitoring | Security | Stop |
| R11 | Uncompleted deletion | M | High | Low | runbook | end-to-end erasure job/evidence | Privacy | Stop |
| R12 | Native crash/background loss | H | High | High | portable tests | device matrix/crash reporting | Mobile | Stop |
| R13 | Model/version drift | M | High | Medium | provenance/manifest | release pinning/equivalence alert | Science | Stop activation |
| R14 | Cost overrun | M | Medium | Medium | cost model | quotas/budgets/alerts | Platform | Limit cohort |
| R15 | Coach distrust/misreading | H | High | Medium | cautious language | blinded review/comprehension | Product | Stop athlete beta |

All critical-impact risks are unaccepted until required mitigation has runtime evidence.
