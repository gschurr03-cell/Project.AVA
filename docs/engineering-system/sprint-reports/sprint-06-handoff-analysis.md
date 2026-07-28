# Sprint 06 handoff analysis

Sprint 05 exited PARTIAL. Canonical upload identity, ownership, completion gating and
idempotency exist locally; real storage/relaunch/network and orphan evidence remain absent.
Analysis submission already rejects uploads that are not complete.

| Sprint 06 task | Local substitute | External dependency |
| --- | --- | --- |
| AVA-0009 | local worker/config/fixture scripts | hosted worker, managed storage, golden 60/120/240 jobs |
| AVA-0018 | orchestration shadow/rollback sanity | AVA-0017 canonical result acceptance |
| AVA-0019 | versioned intelligence registries | completed equivalence decision/cutover |
| AVA-0028 | SQL claim/lease/retry fixtures | hosted worker and deployed telemetry/SLO |
| AVA-0029 | local operational contracts/runbooks | authorized deployed replay/audit |
| AVA-0034 | local benchmark scripts | accepted reference set and CI baseline |
| AVA-0045 | fully local | none |
| AVA-0046 | nullable result/metric sanity | accepted canonical result across consumers |
| AVA-0047 | local provenance/compatibility helpers | accepted immutable result/history policy |
| AVA-0049 | hidden peak-velocity contract | reference decision/data |

None depends on Apple tooling for its backend implementation. Simulator/device unavailability
does not block local worker work, but managed staging/storage/telemetry and scientific
authority still block the listed acceptance evidence.
