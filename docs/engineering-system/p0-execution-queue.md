# P0 execution queue

| Rank | Task | Reason | Dependency | Effort | Parallel | Sprint/Milestone |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | AVA-0001 | Reproducibility root | none | M | no | S01/M0 |
| 2 | AVA-0030 | Enforced remote evidence | 0001 | M | with 0032 | S01/M0 |
| 3 | AVA-0032 | Schema drift prevention | 0004/0030 | S | yes | S01/M0 |
| — | AVA-0039 | Verified Complete 2026-07-18 | release manifest | S | complete | S01/M0 |
| 5 | AVA-0002 | Isolated staging root | provider decision | L | yes | S02/M1 |
| 6 | AVA-0003 | Managed secret isolation | 0002 | M | no | S02/M1 |
| 7 | AVA-0004 | Apply/verify schema | 0002 | M | with 0005 | S02/M1 |
| 8 | AVA-0005 | Tenant isolation proof | 0004 | M | no | S02/M1 |
| 9 | AVA-0011 | Restore/rollback proof | 0002–0004 | M | yes | S02/M1 |
| 10 | AVA-0010 | Telemetry/alerts | 0002 | L | yes | S02/M1 |
| 11 | AVA-0013 | Admission/rate control | 0002 | M | yes | S02/M1 |
| 12 | AVA-0006 | Mobile provider | 0004–0005 | L | no | S03/M2 |
| 13 | AVA-0012 | Deletion/export | 0004–0006 | L | yes | S03/M2 |
| 14 | AVA-0016 | Claims visibility | 0015 | M | contract work only | S03/M3 |
| 15 | AVA-0017 | Immutable report read | 0009 | L | no | S03/M2 |
| 16 | AVA-0007 | Native connection | 0006 | L | no | S04/M2 |
| 17 | AVA-0008 | Signing identity | Apple account | M | yes | S04/M2 |
| 18 | AVA-0009 | Hosted real worker | 0002–0004 | L | yes | S06/M2 |
| 19 | AVA-0014 | Reference dataset | consent/review | XL | yes | S07/M3 |
| 20 | AVA-0015 | Metric validation | 0014 | XL | no | S07/M3 |

Root blockers: 0001, 0002, 0004, 0005. Externally blocked: 0002–0004, 0007–0011,
0014–0015. XL scientific work must be decomposed before sprint commitment.
