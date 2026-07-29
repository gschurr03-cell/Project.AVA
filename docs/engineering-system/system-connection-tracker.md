# System connection tracker

## Sprint 06 evidence

The generic analysis entry now fails closed without an explicit pose backend. CON-04 and
CON-05 retain strong local job/result/orchestration evidence but remain blocked from hosted
worker and canonical-result completion.

## Sprint 05 evidence

CON-02 now has portable persistence, idempotency, progress, cancellation, retry and recovery
evidence plus typed server contracts. CON-03 and CON-13 remain In Progress because deployed
storage transfer and complete DB/storage/derived reconciliation are unavailable.

## Sprint 04 evidence

The native transport/session/Keychain/DTO foundation and 19 portable tests pass. CON-06
remains In Progress because `AVA-0006`, signing, staging, simulator and real-device evidence
are unavailable. No native-to-staging or crash-telemetry connection is claimed.

## Sprint 03 evidence

The mobile v1 adapter, server-derived athlete ownership, safe-result allowlist, 12 focused
database assertions, 19 Swift contract tests, web build and worker configuration pass
locally. Connections CON-03, CON-05, CON-06 and CON-13 remain In Progress because staging,
hosted-worker, physical-device, canonical-result and deletion/export evidence is absent.

## Sprint 02 evidence

| Connection | Repository/local state | Real-environment state |
| --- | --- | --- |
| Environment → web/API/worker | configuration and worker health validate | staging not provisioned |
| Auth → athlete ownership → RLS | source sanity and 12 mobile pgTAP assertions pass | cross-user/cross-org staging matrix blocked |
| Ordered migrations → schema | 53/53 align locally; lint has three warnings | staging apply/checksum/rollback blocked |
| Logs → collector/dashboard/alert | redaction and local JSON logs pass | no collector, dashboard, route or rehearsal |
| Backup → isolated restore | runbook exists | no managed backup/restore/RPO/RTO |

| ID | Source → destination | Current → target | Tasks | Test | Milestone | Status |
| --- | --- | --- | --- | --- | --- | --- |
| CON-01 | Profile → benchmark/predictor | contracts → compatible activated context | 0047–0049 | provenance compatibility | M3 | Ready |
| CON-02 | Video → upload | partial native → verified resumable object | 0026–0027 | network/orphan E2E | M2 | In Progress |
| CON-03 | Upload → analysis | local provider → staging idempotent queue | 0006, 0026 | live contract | M2 | In Progress |
| CON-04 | Analysis → worker | local queue → hosted recoverable worker | 0009, 0028–0029 | termination/load | M2 | Blocked |
| CON-05 | Worker → manifest/result | mixed reads → immutable activated result | 0017–0018, 0034 | equivalence/golden | M2 | In Progress |
| CON-06 | Result → native | typed local → physical-device display | 0007, 0025 | device E2E | M2 | In Progress |
| CON-07 | Metrics → report/root cause | parallel derivation → versioned chain | 0016–0019 | chain/withholding | M3 | Ready |
| CON-08 | Root cause → recommendations/priorities | shadow/legacy → governed manifest | 0018–0019 | shadow equivalence | M3 | Ready |
| CON-09 | Priority → training | adapter → persisted draft | 0020 | integration | M4 | Deferred |
| CON-10 | Plan → approval → native | contracts → RLS approval/execution | 0021–0023 | negative/device | M4 | Deferred |
| CON-11 | Readiness/adherence/pain → longitudinal | pure reducer → durable events | 0022–0023 | replay/loss | M4 | Deferred |
| CON-12 | Competition → taper | pure model → approved calendar change | 0020–0023 | coach fixtures | M4 | Deferred |
| CON-13 | Deletion → storage cleanup | partial → evidenced reconciliation | 0012, 0027 | timed E2E | M2 | In Progress |
