# Closed-beta launch gates

Evaluated: 2026-07-18. Overall: **blocked**.

| Gate | Status | Evidence / blocker | Owner |
| --- | --- | --- | --- |
| Critical/high authorization findings closed | Blocked | local ownership tests only; staging matrix absent | backend/security |
| Critical/high dependency findings closed | Local pass | npm high-severity audit passes; two moderate Next/PostCSS findings tracked | platform |
| Secrets managed and isolated | Blocked | validation/runbook only; provider not configured | platform |
| Private storage and scoped URLs | Partial | RLS/signed URLs; lifecycle/audit staging proof absent | platform |
| Distributed limits/admission control | Blocked | policies defined, enforcement store absent | platform |
| Diagnostics/log redaction | Partial | redaction tests pass; collector/export untested | security |
| Stable staging and rollback rehearsal | Blocked | no staging deployment | platform |
| Successful restore | Blocked | no restore evidence | platform |
| Bounded queues/worker recovery | Local pass | lease/retry sanity; no capacity/failure staging test | platform |
| Alerts verified | Blocked | no live alert destination | operations |
| Scientific fixtures/integrity | Local pass | regression suites/contracts; no staging drift monitoring | science |
| Training approval/stale/pain safety | Contract pass | no persisted/native E2E | training/mobile |
| Signed native build/device isolation | Blocked | portable Swift only | mobile |
| Incident/support ownership | Blocked | roles documented, people/channel not assigned | leadership |
| Beta consent/privacy/terms approved | Blocked | professional review pending | legal/product |
| Minors excluded | Required condition | cohort policy must enforce | product |

No athlete may be provisioned while a hard blocker remains.
