# AVA Recommendation rule catalog

The initial catalog contains 21 deterministic rules.

| Family | Candidate actions |
| --- | --- |
| Recording | Repeat at 60 FPS, use a static side view, preserve a successful setup |
| Timing | Preserve a compatible timing setup |
| Velocity | Repeat the same measured zone before comparison |
| Cadence | Monitor cadence without forcing change |
| Isolated asymmetry | Monitor across compatible sessions |
| Converging asymmetry | Continue monitoring; coach review requires adequate repeated evidence and feature permission |
| Contradictory asymmetry | Collect compatible evidence; no corrective action |
| Reduced front-side position | Reconfirm first; a cue requires sufficient confidence and compatible phase |
| Front-side reference agreement | Preserve the supported pattern |
| Stable torso | Preserve torso stability |
| Variable torso | Monitor first; posture awareness requires sufficient confidence and phase |
| Broad repeatability | Preserve repeatable movement |

## Rule requirements

Every rule declares:

- required, optional, and excluded interpretation keys;
- required and excluded context;
- confidence and evidence-quality minimums;
- phase, event, athlete, and goal applicability;
- action and library selection;
- safety policy;
- conflict and duplicate families;
- enabled and experimental state;
- pure interpretation evaluation.

Rules parameterize versioned library entries instead of embedding full recommendation
bodies.

## Deliberately absent rules

No rule prescribes strength, mobility, medical review, maximal sprint exposure, exact
sets/reps, weekly scheduling, unilateral correction, or advanced drills from current live
evidence. Those require explicit athlete context, repeated compatible evidence, verified
intervention support, and/or a later programming layer.
