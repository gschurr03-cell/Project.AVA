# AVA top 100 priorities

Legend: severity `S0–S4`; priority `P0–P4`; effort `XS/S/M/L/XL`. “Acceptance” is the
minimum exit condition. The ordered list decomposes verified backlog items; it does not add
speculative product scope.

| # | ID | Action / reason | Subsystem | Sev/Pri/Effort | Dependency / milestone | Acceptance |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | AVA-001a | Snapshot and partition dirty worktree; release provenance | Release | S1/P0/M | none / M0 | Intentional reviewed commits |
| 2 | AVA-001b | Reproduce all gates from clean checkout | Release | S1/P0/M | 1 / M0 | Same passing outputs |
| 3 | AVA-030a | Enable remote CI workflow | CI | S1/P0/S | 1 / M0 | Observed green run |
| 4 | AVA-030b | Require branch checks/reviews | CI | S1/P0/S | 3 / M0 | Protection verified |
| 5 | AVA-032 | Gate generated DB type drift | Database | S2/P0/S | 3 / M0 | Clean generated diff |
| 6 | AVA-039a | Inventory production routes/flags | Safety | S1/P0/S | 2 / M0 | Signed release manifest |
| 7 | AVA-039b | Fail closed on developer/experimental flags | Safety | S1/P0/S | 6 / M0 | Release sanity fails unsafe config |
| 8 | AVA-002a | Select isolated staging providers | Infra | S1/P0/M | 2 / M1 | Decision/owners recorded |
| 9 | AVA-002b | Define reproducible environment resources | Infra | S1/P0/L | 8 / M1 | Repeatable plan |
| 10 | AVA-002c | Deploy staging Supabase/web/worker | Infra | S1/P0/L | 9 / M1 | Health checks pass |
| 11 | AVA-003a | Move secrets to managed store | Security | S1/P0/M | 10 / M1 | No local release secrets |
| 12 | AVA-003b | Rehearse secret rotation/revocation | Security | S1/P0/M | 11 / M1 | Service continuity proven |
| 13 | AVA-004a | Apply all 52 migrations | Database | S1/P0/M | 10 / M1 | Checksums recorded |
| 14 | AVA-004b | Run schema/storage/RPC smoke tests | Database | S1/P0/M | 13 / M1 | All objects/policies present |
| 15 | AVA-005a | Define complete role-operation matrix | Authz | S0/P0/M | 13 / M1 | Coach/athlete/admin/worker matrix |
| 16 | AVA-005b | Add cross-athlete DB negative tests | Authz | S0/P0/M | 15 / M1 | All denied |
| 17 | AVA-005c | Add storage and RPC negative tests | Authz | S0/P0/M | 15 / M1 | All denied |
| 18 | AVA-013a | Enforce distributed request limits | Security | S1/P0/M | 10 / M1 | Multi-instance abuse test |
| 19 | AVA-013b | Enforce upload size/duration/quota admission | Security | S1/P0/M | 18 / M1 | Oversize rejected before cost |
| 20 | AVA-011a | Configure database/storage backups | DR | S1/P0/M | 13 / M1 | Retention/RPO recorded |
| 21 | AVA-011b | Restore isolated copy | DR | S1/P0/M | 20 / M1 | Integrity/RTO passes |
| 22 | AVA-011c | Rehearse application/worker rollback | DR | S1/P0/M | 10 / M1 | Prior version restored |
| 23 | AVA-010a | Deploy structured telemetry sink | Ops | S1/P0/L | 10 / M1 | Redacted correlated events |
| 24 | AVA-010b | Create queue/upload/activation dashboards | Ops | S1/P0/M | 23 / M1 | SLO panels populated |
| 25 | AVA-010c | Configure alerts and on-call ownership | Ops | S1/P0/M | 24 / M1 | Synthetic alert acknowledged |
| 26 | AVA-038a | Assign incident/support roles | Ops | S1/P0/S | 25 / M1 | Named coverage |
| 27 | AVA-038b | Run security/data-loss tabletop | Ops | S1/P0/M | 26 / M1 | Actions/times recorded |
| 28 | AVA-014a | Approve consent/reference protocol | Science | S1/P0/L | legal review / M2 | Signed protocol |
| 29 | AVA-014b | Collect locked 60/120/240 corpus | Science | S1/P0/XL | 28 / M2 | Eligible representative set |
| 30 | AVA-014c | Dual-annotate reference events | Science | S1/P0/XL | 29 / M2 | Agreement threshold met |
| 31 | AVA-009a | Build immutable worker image | Analysis | S1/P0/M | 3 / M2 | Digest/SBOM/model recorded |
| 32 | AVA-009b | Run 60 FPS-class staging job | Analysis | S1/P0/M | 10,29,31 / M2 | Complete with provenance |
| 33 | AVA-009c | Run 120/240 normalization jobs | Analysis | S1/P0/M | 32 / M2 | Correct source index/timestamps |
| 34 | AVA-028a | Test concurrent claims/lease ownership | Worker | S2/P0/M | 32 / M2 | Exactly-once activation |
| 35 | AVA-028b | Kill worker during every stage | Worker | S2/P0/L | 34 / M2 | Recovery bounded |
| 36 | AVA-028c | Load-test queue against beta SLO | Worker | S2/P0/L | 34 / M2 | Queue/latency target met |
| 37 | AVA-029a | Connect dead-letter alert and triage | Worker | S2/P0/M | 25,35 / M2 | Failure reaches operator |
| 38 | AVA-029b | Implement authorized replay audit | Worker | S2/P0/M | 37 / M2 | Idempotent replay recorded |
| 39 | AVA-026a | Implement upload idempotency/fingerprint | Upload | S2/P0/M | 13 / M2 | Duplicate creates one job |
| 40 | AVA-026b | Implement resumable upload | Upload | S2/P0/L | 39 / M2 | Network loss resumes |
| 41 | AVA-027a | Reconcile upload/session/job orphans | Storage | S1/P0/M | 40 / M2 | Injected orphans resolved |
| 42 | AVA-027b | Enforce artifact retention/cleanup | Storage | S1/P0/M | 41 / M2 | Rerun/delete leaves none |
| 43 | AVA-046a | Remove numeric zero as unavailable metric | Metrics | S1/P0/M | 32 / M2 | Typed null/availability |
| 44 | AVA-046b | Audit every UI/history consumer | Metrics | S1/P0/M | 43 / M2 | No fake metric rendered |
| 45 | AVA-015a | Compute metric error distributions | Science | S0/P0/XL | 30,32 / M2 | Prespecified CI reported |
| 46 | AVA-015b | Calibrate confidence vs observed error | Science | S0/P0/XL | 45 / M2 | Reliability curves locked |
| 47 | AVA-049 | Decide/reference peak velocity or keep hidden | Metrics | S1/P0/L | 45 / M2 | Registry decision |
| 48 | AVA-016a | Bind claims registry to result presenter | Safety | S1/P0/M | 45 / M2 | Status gates output |
| 49 | AVA-016b | Withhold every unsupported chain link | Safety | S1/P0/M | 48 / M2 | Adversarial fixtures pass |
| 50 | AVA-017a | Persist one immutable report snapshot | Reports | S1/P0/L | 32,49 / M2 | Versioned full reasoning chain |
| 51 | AVA-017b | Make web read activated report | Reports | S1/P0/M | 50 / M2 | No render-time authority |
| 52 | AVA-047 | Filter history by compatible provenance | History | S2/P0/M | 50 / M2 | Mixed versions excluded/labeled |
| 53 | AVA-006a | Freeze/version mobile API schemas | Mobile/API | S1/P0/M | 15,50 / M3 | Contract fixtures locked |
| 54 | AVA-006b | Implement mobile auth/session endpoints | Mobile/API | S1/P0/L | 53 / M3 | Auth contract/E2E passes |
| 55 | AVA-006c | Implement upload/job status endpoints | Mobile/API | S1/P0/L | 39,53 / M3 | Retry/idempotency passes |
| 56 | AVA-006d | Implement result/history endpoints | Mobile/API | S1/P0/L | 50,53 / M3 | Activated-only responses |
| 57 | AVA-012a | Implement authenticated deletion request | Privacy | S0/P0/L | 15,53 / M3 | Audited request lifecycle |
| 58 | AVA-012b | Erase DB, video, artifacts and caches | Privacy | S0/P0/L | 57 / M3 | Reconciliation proves absence |
| 59 | AVA-012c | Implement scoped export | Privacy | S1/P0/M | 57 / M3 | Complete portable export |
| 60 | AVA-008a | Assign real bundle IDs/team | iOS | S1/P0/S | Apple account / M3 | No placeholders |
| 61 | AVA-008b | Configure signing/capabilities/privacy | iOS | S1/P0/M | 60 / M3 | Archive validates |
| 62 | AVA-007a | Connect native PKCE/keychain auth | iOS | S1/P0/L | 54,61 / M3 | Device sign-in/recovery |
| 63 | AVA-007b | Connect capture/import quality checks | iOS | S1/P0/M | 61 / M3 | 59.94 accepted; 30 rejected |
| 64 | AVA-007c | Connect background resumable upload | iOS | S1/P0/L | 55,63 / M3 | relaunch/network recovery |
| 65 | AVA-007d | Connect job/result/history UI | iOS | S1/P0/L | 56,64 / M3 | Same activated version |
| 66 | AVA-036 | Add crash reporting/symbol upload | iOS/Ops | S2/P0/M | 23,61 / M3 | Test crash actionable |
| 67 | AVA-025a | Run supported physical-device matrix | iOS | S2/P0/L | 65 / M3 | Capture/upload/report pass |
| 68 | AVA-025b | Verify VoiceOver/Dynamic Type/contrast | Accessibility | S2/P0/M | 65 / M3 | Checklist passes |
| 69 | AVA-025c | Test low storage/battery/network states | iOS | S2/P0/L | 65 / M3 | Safe recovery/no loss |
| 70 | AVA-037a | Complete professional privacy review | Legal | S1/P0/L | 57–59 / M4 | Approved disclosures |
| 71 | AVA-037b | Complete health/fitness claims review | Legal | S1/P0/L | 48 / M4 | Claims/labels approved |
| 72 | AVA-037c | Complete coach/training safety review | Coaching | S1/P0/L | 49 / M4 | Scope signed |
| 73 | AVA-024a | Run blinded coach report review | Science/UX | S1/P0/XL | 50 / M4 | Agreement/usefulness targets |
| 74 | AVA-024b | Run athlete comprehension study | Science/UX | S1/P0/XL | 65,73 / M4 | Misinterpretation below limit |
| 75 | AVA-035a | Inventory runtime resources for CSP | Security | S2/P1/S | 65 / M4 | Complete allowlist |
| 76 | AVA-035b | Roll out CSP report-only then enforce | Security | S2/P1/M | 75 / M4 | No required violations |
| 77 | AVA-031 | Sign image/SBOM/provenance | Supply chain | S2/P1/M | 31,3 / M4 | Verified release artifact |
| 78 | AVA-033a | Map commands to unique test boundaries | Tests | S2/P1/M | 3 / M4 | No alias inflation |
| 79 | AVA-033b | Add coverage/mutation targets for safety | Tests | S2/P1/L | 78 / M4 | Thresholds enforced |
| 80 | AVA-034 | Put golden worker regression in CI | Science | S1/P1/L | 29–46,77 / M4 | Tolerance gate required |
| 81 | AVA-018a | Run legacy/manifest shadow equivalence | Intelligence | S2/P1/L | 50,80 / M5 | Threshold window passes |
| 82 | AVA-018b | Cut over with monitored rollback | Intelligence | S2/P1/M | 81 / M5 | Manifest read stable |
| 83 | AVA-019 | Consolidate duplicate coaching rules | Intelligence | S2/P1/L | 82 / M5 | One versioned source |
| 84 | AVA-045 | Fail closed on accidental mock production use | Analysis | S2/P1/S | 2 / M5 | Production call test throws |
| 85 | AVA-040 | ESLint CLI and overlay hook correction | Quality | S3/P2/S | 2 / M5 | Zero lint warnings |
| 86 | AVA-041 | Extract session selectors/services | Web | S3/P2/L | 51 / M5 | Snapshot/E2E unchanged |
| 87 | AVA-042a | Validate beta capacity/cost envelope | Ops | S2/P1/L | 36 / M5 | SLO and budget pass |
| 88 | AVA-042b | Add quota/budget alerts | Ops | S2/P1/M | 87 / M5 | Synthetic threshold alert |
| 89 | AVA-020a | Design append-only training schema/RLS | Training | S1/P1/L | 15 / M6 | Threat/data review |
| 90 | AVA-020b | Persist plans/revisions/events/checkpoints | Training | S1/P1/XL | 89 / M6 | Replay/idempotency tests |
| 91 | AVA-021a | Implement coach review/approval API | Training | S0/P1/L | 90 / M6 | Unauthorized activation impossible |
| 92 | AVA-021b | Enforce stale/restriction invalidation | Training | S0/P1/M | 91 / M6 | Safety fixtures/integration |
| 93 | AVA-023a | Persist readiness/pain/safety events | Training | S0/P1/L | 90 / M6 | No loss/duplicate |
| 94 | AVA-023b | Alert coach and withhold unsafe plan | Training | S0/P1/L | 25,93 / M6 | Paging/withholding rehearsal |
| 95 | AVA-022a | Build native approved-plan reader | iOS/Training | S1/P1/L | 91 / M6 | Scope/expiry verified |
| 96 | AVA-022b | Build execution/adherence offline queue | iOS/Training | S1/P1/XL | 93,95 / M6 | conflict/replay passes |
| 97 | AVA-043 | Add consented notifications/deep links | Mobile | S2/P2/L | 94–96 / M6 | Delivery/fallback measured |
| 98 | AVA-048 | Govern/populate compatible benchmarks | Science | S2/P2/XL | 29,45 / post-beta | Review/version gate |
| 99 | AVA-044 | Add least-privilege operational console | Ops | S2/P2/L | 15,23 / post-beta | Actions audited |
| 100 | AVA-050 | Begin public-launch scale/security program | Release | S1/P4/XL | successful closed beta | Independent gates approved |
