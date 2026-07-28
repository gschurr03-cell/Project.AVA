# System connection matrix

| Source | Destination | Contract | Current state | Required validation |
| --- | --- | --- | --- | --- |
| Web auth | Supabase | cookies/RLS | Connected locally | staging recovery/abuse |
| Web upload | Storage/session | object path + action | Connected locally | loss/retry/orphan E2E |
| Session | Analysis job | DB/RPC | Connected | concurrent hosted workers |
| Job | MediaPipe | file + pose contract | Connected locally | deployed golden videos |
| MediaPipe | Metrics | pose sequence | Connected | reference validity |
| Metrics | Activated result | RPC/schema | Connected locally | drift/reconciliation |
| Activated result | Web report | result/report contracts | Partial; render derivation remains | immutable report E2E |
| Report | Recommendation/priority | versioned engines | Partial/parallel legacy | manifest equivalence |
| Priority | Training | adapter | Disabled/fixture | authorized persisted draft |
| Training | Coach review | lifecycle contract | Missing provider | RLS approval E2E |
| Coach approval | Native plan | mobile contract | Missing | device execution |
| Readiness/adherence | Longitudinal state | event/reducer | Missing ingestion/store | replay/idempotency |
| iOS auth | Backend | documented mobile API | Missing provider | PKCE/device |
| iOS upload | Backend/storage | upload manifest | Missing provider | background recovery |
| Backend result | iOS report/history | beta package | Fixture only | live offline sync |
| Health/telemetry | Operator | structured events | No deployed sink | alert rehearsal |
| Delete request | DB/storage/artifacts | runbook | Partial | timed completion proof |
