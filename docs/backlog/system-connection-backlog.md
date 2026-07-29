# System connection backlog

| ID | Source → destination | Current contract | Missing connection | Expected behavior | Validation |
| --- | --- | --- | --- | --- | --- |
| CON-01 | iOS auth → backend | native auth contracts | live provider/deep links | secure renewable session | device PKCE E2E |
| CON-02 | iOS upload → storage/job | upload manifest | versioned API | idempotent resume and queue | kill/network tests |
| CON-03 | activated result → iOS | beta package | result/history API | same immutable web/native version | contract/E2E |
| CON-04 | analysis → report | result/report schemas | single persisted snapshot | withhold incomplete chain | golden E2E |
| CON-05 | report → recommendation/priority | engine inputs | manifest cutover | exact compatible versions | shadow equivalence |
| CON-06 | priority → training | adapter | durable draft service | no autonomous activation | integration |
| CON-07 | training → coach approval | lifecycle | RLS API/store | authorized immutable approval | negative tests |
| CON-08 | approval → native plan | mobile contracts | provider/UI | scoped offline plan | device E2E |
| CON-09 | adherence/readiness/pain → state | events/reducer | ingestion/checkpoints | idempotent replay/withhold | replay/failure |
| CON-10 | competition → taper | season contracts | persisted calendar | bounded coach-reviewed change | fixtures + review |
| CON-11 | health → operator | telemetry contracts | sink/alerts | actionable SLO alert | failure rehearsal |
| CON-12 | deletion → storage/derived data | runbook | worker/reconciliation | complete evidenced erasure | timed E2E |
