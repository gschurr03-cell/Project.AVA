# Source-of-truth decision register

| Decision | Concept | Existing sources | Proposed canonical | Compatibility/removal | Approval |
| --- | --- | --- | --- | --- | --- |
| SOT-01 | Analysis state | session, analysis, job | `analysis_jobs` lifecycle + analysis terminal state | adapter for web; reconcile drift | Engineering |
| SOT-02 | Analysis result | metrics JSON, result payload, render derivation | immutable activated versioned result | legacy read until equivalence | Founder/Science |
| SOT-03 | Manifest | direct snapshots, orchestration manifests | active authoritative manifest | shadow then rollback-capable cutover | Founder |
| SOT-04 | Completion write | callback and atomic RPC | atomic service-role RPC | remove callback after traffic proof | Engineering |
| SOT-05 | Athlete profile | coach-owned row/native link | Postgres athlete row under RLS | versioned mobile DTO | Security |
| SOT-06 | Recommendation/priority | legacy and versioned engines | versioned manifest snapshots | consolidate thresholds after equivalence | Coach/Science |
| SOT-07 | Training plan/approval | pure drafts/contracts | append-only approved plan/revision store | training stays disabled | Founder/Coach |
| SOT-08 | Readiness/adherence | native/pure events | append-only authorized event stream | deterministic replay | Coach/Security |
| SOT-09 | Benchmark | tables/catalogs | versioned compatible dataset registry | hide incompatible comparison | Science |
| SOT-10 | Scientific visibility | UI assumptions/docs | metric/claims registry | server-authoritative presentation gate | Founder/Science |
| SOT-11 | Production feature exposure | independent environment flags | versioned production surface policy enforced by canonical feature loader | preserve route gates; fail closed before production render | Engineering |
| SOT-12 | Web lint entry | deprecated `next lint` and `.eslintrc` | ESLint CLI over maintained `src` with zero warning budget | retain `npm run lint` caller contract | Engineering |
| SOT-13 | Mobile upload identity | local file, OS task and storage object | server `mobile_uploads.id` plus per-user idempotency key | reconcile local/OS state to server before restart | Engineering |

DEC-007 and DEC-008 record the accepted Sprint 01 decisions. No legacy intelligence or
result-source consolidation is authorized by Sprint 01.
