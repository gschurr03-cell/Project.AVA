# iOS TestFlight beta plan

Objective: validate the signed staging capture-to-authoritative-offline-report workflow
with a small authorized internal cohort and controlled non-personal test data.

Required workflow covers sign-in, dashboard, capture verification, foreground/background/
recovered upload, submission/status, report, priority/root cause/recommendation, benchmark/
projection, Progress/Digital Twin, airplane-mode cache, bounded feedback and redacted
diagnostics. Use the side-view sprint v1 protocol on device-capable iOS 17 iPhones.

Severity: P0 privacy/data loss/cross-account; P1 blocked core workflow/crash; P2 material
incorrect state/accessibility; P3 minor presentation. Weekly cadence only after P0/P1 triage.
Expired builds are removed; rollback restores the prior accepted build and disables risky
flags. Stop testing for privacy incident, cross-account exposure, unsafe scientific language,
or authoritative-result violation.

## Exit gates

| Gate | Required | Current | Evidence | Status |
| --- | --- | --- | --- | --- |
| Crash-free sessions | ≥99.5% | No data | beta telemetry | Blocked |
| Auth/capture verification | ≥98% / ≥95% | No data | staging/device | Blocked |
| Upload/recovery | ≥95% / ≥90% | No data | staging/device | Blocked |
| Submission/status accuracy | ≥98% | No data | API/device | Blocked |
| Authoritative/offline result | 100% integrity / ≥98% open | Fixture only | tests/beta | Blocked |
| Unsupported contract | <1% | No data | telemetry | Blocked |
| Report load | p95 <1 s cached | No device data | signposts | Blocked |
| Privacy/cross-account | 0 incidents | fixture tests only | audit/beta | Blocked |
| Accessibility blockers | 0 P0/P1 | Not audited | manual audit | Blocked |
| Device coverage | agreed matrix complete | 0 devices | matrix | Blocked |

Passing beta gates does not declare App Store readiness.

