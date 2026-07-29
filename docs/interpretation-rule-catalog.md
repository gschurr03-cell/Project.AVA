# AVA Interpretation rule catalog

All rules are deterministic version 1 rules. “Available” means the Observation Engine
has already supplied non-null, non-withheld evidence with compatible confidence.

| Rule | Inputs | Output boundary |
| --- | --- | --- |
| `interpretation.recording.experimental_fps.v1` | Experimental FPS observation | Broad review only; event timing requires caution |
| `interpretation.recording.panning.v1` | Panning observation | Technique scope may exceed spatial scope |
| `interpretation.recording.high_quality.v1` | Excellent recording observation | Available metrics support deeper review; not universal validation |
| `interpretation.timing.trusted.v1` | Trusted timing observation | Compatible event-level comparison is possible |
| `interpretation.velocity.available.v1` | Available velocity observation | Absolute velocity can be contextualized; no plateau claim |
| `interpretation.cadence.available.v1` | Available cadence observation | Rhythm can be described; no consistency or limiter claim |
| `interpretation.asymmetry.stride_length_asymmetry.v1` | Stride-length asymmetry | Isolated spatial side difference |
| `interpretation.asymmetry.stride_frequency_asymmetry.v1` | Frequency asymmetry | Isolated side timing difference |
| `interpretation.asymmetry.contact_asymmetry.v1` | Trusted contact asymmetry | Unequal support timing may be present |
| `interpretation.asymmetry.flight_asymmetry.v1` | Trusted flight asymmetry | Unequal step-cycle timing may be present |
| `interpretation.asymmetry.converging.v1` | Two or more asymmetries toward one side | Coordinated pattern becomes more plausible |
| `interpretation.asymmetry.contradictory.v1` | Two or more opposing asymmetries | No consistent direction can be identified |
| `interpretation.front_side.reduced.v1` | Knee below configured phase reference | Less front-side range may be expressed |
| `interpretation.front_side.consistent.v1` | Knee matches configured phase reference | Front-side position is not the clearest reference difference |
| `interpretation.posture.stable.v1` | Stable torso observation | Torso behavior appears repeatable |
| `interpretation.posture.variable.v1` | Variable torso observation | Variation may reflect phase, fatigue, balance, or recording |
| `interpretation.consistency.repeatable.v1` | Stable posture plus consistent cadence | Multiple available mechanics appear repeatable |

## Disabled by evidence availability

No rules independently infer velocity plateaus, increasing/declining velocity, cadence
consistency, stride-length variability, backside recovery, force, stiffness, repeated
asymmetry, or personal-baseline change. These require new versioned observations rather
than interpretation-side metric calculations.

## Authoring requirements

New rules must declare required and optional observation keys, exclusions, context,
phase/event/camera/FPS applicability, confidence and evidence-quality policies, conflict
group, version, enabled and experimental states, a pure evaluation function, and a
structured output factory.

Every rule must also define alternative explanations and excluded conclusions, pass the
language guard, and include positive, exclusion, context, confidence, conflict, duplicate,
and determinism coverage as applicable.
