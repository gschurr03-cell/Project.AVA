# AVA Interpretation Engine audit

Audit date: 2026-07-17

## Conclusion

The Observation Engine is a suitable factual boundary for an initial deterministic
Interpretation Engine. Its contracts provide stable IDs, categories, structured evidence,
availability, confidence, phase, side, limitations, experimental state, engine version,
and rule provenance. Interpretation rules can therefore avoid raw pose data and metric
recalculation.

The safe initial architecture is on-demand generation for mutable working analyses.
Saved analysis rows currently have no interpretation snapshot column, so applying current
rules to an old saved version would silently rewrite its meaning. Saved versions therefore
fail closed until immutable snapshot persistence is added.

## Reliable inputs

- Observation identity, engine version, rule ID, category, and creation timestamp
- Structured evidence with value, unit, source, availability, frame range, phase, and
  directness
- Existing observation confidence labels, without promotion
- Status, availability, experimental state, side, and structured limitations
- Conflict and duplicate resolution already performed by the Observation Engine

## Inputs excluded from interpretation

- `unavailable`, `withheld`, `unsupported`, or failed observations
- contradicted observations that have not been resolved
- evidence containing null values or unavailable evidence items
- observations with `Unavailable` confidence
- observations whose deterministic ID does not belong to the requested analysis
- incompatible Observation Engine versions
- phase-specific observations when phase context is unknown or incompatible, except as
  an explicitly `context_required` interpretation

Unavailable cadence, velocity, timing, and calibration findings are not converted into
performance meaning. Their rejection is visible in the interpretation trace.

## Provenance gaps

- Observation objects do not contain a dedicated `analysisId`; v1 must verify the
  deterministic observation-ID namespace.
- The live adapter does not yet preserve canonical sprint-phase values, event identity,
  sample size, or temporal overlap.
- Legacy asymmetry output exposes a reliability boolean but no compatible confidence
  label. Live asymmetry observations therefore remain confidence-unavailable and are
  safely excluded.
- Personal-baseline compatibility infrastructure is incomplete.
- Saved versions contain no immutable interpretation snapshot or input hash.

## Legacy language review

Legacy coaching and intelligence modules contain cause-oriented and prescriptive language,
including weakness, force-production, “why it matters,” drills, elite thresholds, and
performance limiters. Those systems are not imported by the Interpretation Engine.
Interpretation rules consume only structured observations and use their own restricted
language checks.

## Required architectural changes

- Add a separate `src/lib/intelligence/interpretations` domain rather than extending
  recommendation modules.
- Keep interpretation confidence distinct from measurement confidence and cap inferred
  meaning at Moderate in v1.
- Centralize alternative explanations, excluded conclusions, duplicate merging,
  contradiction resolution, and language safety.
- Regenerate working-analysis output deterministically.
- Withhold saved-version interpretation until versioned JSON snapshot persistence is
  implemented atomically with save.

No biomechanics, MediaPipe, timing, gate, worker, upload, or metric-trust code requires
modification for this vertical slice.
