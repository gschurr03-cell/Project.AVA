# Sprint 04 readiness review

Review date: 2026-07-18. Result: **no assigned task is ready for implementation**.

| Order | Task | Priority / severity / effort | Current status | Dependencies | Readiness and blocker | Required evidence |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | AVA-0008 — Replace placeholder app identity/signing | P0 / S1 / M | Blocked | none recorded | Fails DoR: official bundle IDs, Apple team, certificates/profiles and signing authority are unavailable | signed archive and documented identity |
| 2 | AVA-0007 — Connect native auth/capture/upload/result | P0 / S1 / L | In Progress | AVA-0006 | Fails DoR: mobile provider is locally validated only; staging and real-device backend flow are absent | real-device end-to-end flow against canonical backend |
| 3 | AVA-0025 — Device/accessibility matrix | P1 / S2 / L | Blocked | AVA-0007 | Fails DoR: parent native flow is incomplete and no supported physical-device matrix is available | supported devices, VoiceOver and Dynamic Type evidence |
| 4 | AVA-0036 — Native crash reporting/symbols | P1 / S2 / M | Blocked | AVA-0008, AVA-0010 | Fails DoR: signing identity and telemetry collector/dashboard are unavailable | uploaded symbols and visible symbolicated test crash |

All tasks have a parent story, acceptance criteria, tests, owner type, release stage and
security-impact classification. Required external inputs are staging credentials, a
dedicated test account, Apple Developer team/signing access, supported iPhone hardware and
the selected telemetry provider/collector.

Existing Batch 1 native code can be audited and tested without changing task scope. It
cannot satisfy any task’s real-environment acceptance criterion.
