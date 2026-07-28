# Training Program Intelligence audit

Audit date: 2026-07-18, completed before implementation.

| Existing area | Classification | Decision |
| --- | --- | --- |
| `workoutBuilder.ts` | Partially implemented/incompatible | Preserve existing UI helper; it arranges one recommendation but has no weekly safety or lifecycle |
| Exercise library/selector | Reusable concepts, incompatible dosage | Preserve; Training Program uses governed catalog IDs and numeric typed dosage |
| Recommendation/Priority | Reusable upstream | Consume activated references; never reorder or reinterpret |
| Performance Optimization/Adaptive Coaching | Reusable upstream, feature gated | Optional typed sources for objective allocation |
| Digital Twin/history | Partially reusable | Consume snapshot/history references; missing readiness/workload depth remains a blocker |
| Competition schedule | Reusable foundation | Extend into explicit competition/taper input |
| Readiness/restrictions | Missing | Add sourced, time-bounded signals and authority precedence |
| Weekly/phase planning | Missing | Add deterministic seven-day draft foundation, not annual planning |
| Approval/override lifecycle | Missing | Add typed authorization boundaries; no automatic activation |
| Database/API/UI | Missing | Intentionally defer persistence/routes until service authorization design is approved |
| Orchestration | Reusable | Register internal development adapter; draft plans stay outside the analysis active pointer |

No current code was device, athlete, coach, clinical, staging or production validated for
programming. Existing session suggestions remain presentation-era output and must not be
treated as approved programs.

