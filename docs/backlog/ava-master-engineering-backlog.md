# AVA master engineering backlog

Severity: S0 catastrophic, S1 critical, S2 high, S3 medium, S4 low. Priority: P0 immediate
through P4 defer. Estimates are relative engineering size.

| ID | Finding/action | System | Sev | Pri | Effort | Dependency | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AVA-001 | Commit and review reproducible baseline | Release | S1 | P0 | M | Audit | Clean intentional commits reproduce gates |
| AVA-002 | Provision isolated staging Supabase/web/worker | Infra | S1 | P0 | L | Provider decision | IaC/repeatable deploy and health |
| AVA-003 | Managed secrets and rotation | Security | S1 | P0 | M | 002 | No local secrets; rotation rehearsed |
| AVA-004 | Apply/verify 52 migrations in staging | Database | S1 | P0 | M | 002 | Checksums, smoke and rollback pass |
| AVA-005 | Complete authorization operation matrix | Authz | S0 | P0 | M | 004 | Cross-athlete negative suite passes |
| AVA-006 | Implement `/api/mobile/v1` provider | Mobile/API | S1 | P0 | L | 004–005 | Versioned contract tests pass |
| AVA-007 | Connect native auth/capture/upload/result | iOS | S1 | P0 | L | 006 | Real device E2E passes |
| AVA-008 | Replace placeholder app identity/signing | iOS | S1 | P0 | M | Apple account | Archive succeeds |
| AVA-009 | Hosted worker golden-video execution | Analysis | S1 | P0 | L | 002–004 | 60/120/240 jobs complete with provenance |
| AVA-010 | Deploy telemetry/dashboards/alerts | Ops | S1 | P0 | L | 002 | Queue/upload/activation alerts rehearsed |
| AVA-011 | Backup restore and rollback rehearsal | DR | S1 | P0 | M | 002–004 | Timed restore/RPO/RTO evidence |
| AVA-012 | End-to-end deletion/export | Privacy | S0 | P0 | L | 004–006 | DB/storage/derived erasure proven |
| AVA-013 | Distributed rate/upload admission | Security | S1 | P0 | M | 002 | Abuse/load tests pass |
| AVA-014 | Consent/reference dataset collection | Science | S1 | P0 | XL | Protocol/review | Eligible locked 60/120/240 cohort |
| AVA-015 | Metric reference validation | Science | S0 | P0 | XL | 014 | Error/CI targets satisfied |
| AVA-016 | Enforce claims registry in presentation | Safety | S1 | P0 | M | 015 | Unvalidated outputs withheld |
| AVA-017 | Immutable report read path | Reports | S1 | P0 | L | 009 | Web/native use same activated version |
| AVA-018 | Resolve legacy/manifest equivalence | Intelligence | S2 | P1 | L | 017 | Shadow thresholds and rollback pass |
| AVA-019 | Consolidate legacy coaching thresholds | Intelligence | S2 | P1 | L | 018 | One versioned definition per rule |
| AVA-020 | Persist training plans/revisions/events | Training | S1 | P1 | XL | 005 | Append-only RLS store passes |
| AVA-021 | Authorized coach training approval | Training | S0 | P1 | L | 020 | No athlete activation without approval |
| AVA-022 | Native training execution/offline sync | Mobile | S1 | P1 | XL | 006,020–021 | Stale/pain/retry device tests pass |
| AVA-023 | Safety-event ingestion/escalation | Training | S0 | P1 | L | 010,020 | Loss/duplicate tests and paging pass |
| AVA-024 | Coach/report comprehension studies | Science/UX | S1 | P1 | XL | 014–017 | Prespecified thresholds pass |
| AVA-025 | Device/accessibility matrix | iOS | S2 | P1 | L | 007 | Supported devices, VoiceOver, Dynamic Type |
| AVA-026 | Resumable/idempotent uploads | Upload | S2 | P1 | L | 006 | Kill/relaunch/network-loss recovery |
| AVA-027 | Storage lifecycle/orphan reconciliation | Storage | S1 | P1 | M | 012,026 | Zero unexplained orphan classes |
| AVA-028 | Worker termination/concurrency/load tests | Worker | S2 | P1 | L | 009–010 | Lease/retry/SLO targets pass |
| AVA-029 | Operational dead-letter console/runbook | Worker | S2 | P1 | M | 010,028 | Authorized replay/audit proven |
| AVA-030 | CI protected branch and required gates | CI | S1 | P1 | M | 001 | Remote required checks observed |
| AVA-031 | Container/SBOM/vulnerability provenance | Supply chain | S2 | P1 | M | 030 | Signed immutable artifact |
| AVA-032 | Database type/schema drift gate | Database | S2 | P1 | S | 004,030 | Generated types clean in CI |
| AVA-033 | Unified test runner/coverage taxonomy | Tests | S2 | P1 | M | 030 | Aliases no longer inflate evidence |
| AVA-034 | Worker golden regression CI | Science | S1 | P1 | L | 014,030 | Locked output tolerance gate |
| AVA-035 | CSP resource inventory and rollout | Security | S2 | P1 | M | 007 | Report-only then enforce |
| AVA-036 | Native crash reporting/symbols | iOS/Ops | S2 | P1 | M | 008,010 | Test crash visible |
| AVA-037 | Privacy/legal/health claim review | Legal | S1 | P0 | L | Product scope | Signed approval and policy updates |
| AVA-038 | Incident/support ownership rehearsal | Ops | S1 | P0 | M | 010–012 | Tabletop passes |
| AVA-039 | Hide developer/experimental surfaces | Product | S1 | P0 | S | Release manifest | Production route/flag audit passes |
| AVA-040 | Replace deprecated lint command/hook warning | Quality | S3 | P2 | S | None | ESLint CLI clean |
| AVA-041 | Split session-page derivation | Web | S3 | P2 | L | 017 | Typed selectors; behavior unchanged |
| AVA-042 | Performance/cost capacity validation | Ops | S2 | P2 | L | 002,010 | Cohort SLO and budget pass |
| AVA-043 | Notification provider/deep links | Mobile | S2 | P2 | L | 007,023 | Consent/delivery/fallback tested |
| AVA-044 | Coach-admin operational tools | Ops | S2 | P2 | L | 005,010 | Least-privilege actions/audit |
| AVA-045 | Retire mock default from generic production path | Analysis | S2 | P2 | S | Call-site audit | Production fails closed |
| AVA-046 | Resolve zero-placeholder legacy consumers | Metrics | S1 | P1 | M | 017 | Null/availability everywhere |
| AVA-047 | History compatibility/provenance filtering | History | S2 | P1 | M | 017 | Mixed versions not compared |
| AVA-048 | Benchmark dataset governance/population | Science | S2 | P2 | XL | 014 | Reviewed compatible cohorts |
| AVA-049 | Peak-velocity definition/reference decision | Metrics | S1 | P1 | L | 014 | One definition or remain hidden |
| AVA-050 | Public launch scale/security program | Release | S1 | P4 | XL | Closed beta | Independent launch gates pass |

Backlog size is currently 50 verified engineering items. The Top 100 decomposes these into
ordered executable actions; it does not invent 50 new product features.

## Batch 01 status update — 2026-07-18

- AVA-006: provider code implemented locally; staging contract/device integration remains.
- AVA-007: typed native consumers added; real app/device flow remains.
- AVA-005, AVA-012, AVA-016, AVA-017 and AVA-026: narrowed implementation progress with
  local invariants; none is closed without applied staging policies and end-to-end evidence.
- AVA-002–004, AVA-008–011 and AVA-025 remain externally blocked or unproved.

No P0 or P1 item is marked resolved solely from compile/source tests.
