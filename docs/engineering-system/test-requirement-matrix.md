# Test requirement matrix

| Workflow | Unit/contract | Integration | Environment/device/reference | Tasks |
| --- | --- | --- | --- | --- |
| Auth/authorization | token/role contracts | DB/storage/RPC denial | staging cross-athlete | 0005–0007 |
| Upload/deletion | validation/idempotency | storage/job/orphan | network loss + timed deletion | 0012, 0026–0027 |
| Worker/results | FPS/job/manifest | container/queue/activation | real 60/120/240 corpus | 0009, 0017, 0028–0029, 0034 |
| Native | decoding/cache/retry | live API | physical device/accessibility | 0007–0008, 0025, 0036 |
| Metrics/science | deterministic fixtures | locked pipeline | independent reference/error CI | 0014–0016, 0024, 0049 |
| Training | rules/reducer | RLS approval/events | coach/athlete/offline safety | 0020–0023 |
| Operations | policy/alert contracts | failure injection | restore/rollback/load/on-call | 0010–0011, 0038, 0042 |
| Supply chain | scanner/schema drift | remote CI | signed artifact/branch protection | 0030–0032 |

Every P0/P1 task in `ava-tasks.json` has acceptance criteria and tests. Environment-specific
tasks cannot close from source assertions.
