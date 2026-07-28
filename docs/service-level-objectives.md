# Closed-beta service-level objectives

Initial targets are launch gates, not public guarantees:

| Indicator | Target / window | Alert | Source / owner |
| --- | --- | --- | --- |
| API successful request rate | 99% / rolling 7 days | <98% for 15m | web telemetry / platform |
| Eligible analysis completion | 95% / rolling 7 days | <90% for 30m | job metrics / science-platform |
| Analysis activation integrity | 100% | any mismatch | activation audit / science |
| Approved-plan retrieval | 99% / 7 days | <98% for 15m | API metrics / backend |
| Event preservation/idempotency | 100% | any loss/duplication | event audit / backend |
| Safety-event accepted or durably queued | 99.9% / 7 days | any 5m gap | safety metrics / training |
| Native crash-free sessions | 99% / beta build | <98% | crash service / mobile |

No data sources are live, so these targets are not yet measurable and do not pass launch.

