# AVA Recommendation Engine audit

Audit date: 2026-07-17

## Conclusion

The versioned Observation and Interpretation engines provide a safe upstream boundary for
candidate actions. The new engine must consume `InterpretationResult`, never legacy raw
metrics or pose data.

The existing `src/lib/intelligence/recommendations.ts`, exercise library, exercise
selector, and workout builder are presentation-era coaching systems. They contain useful
drill names but also exact prescriptions, maximal-intent work, elite thresholds,
weak-side and “what it fixes” language, inferred force/stiffness claims, and full session
composition. They are not suitable as the production Recommendation Engine contract and
remain untouched.

## Reusable sources

- Existing low-complexity drill identities such as wall march, A-march, dribble work,
  wickets, and bilateral rhythm rehearsal
- Existing global terms that AVA is not medical advice
- Observation evidence, availability, and provenance
- Interpretation confidence, evidence quality, alternatives, context dependencies,
  excluded conclusions, and trace
- Current feature-flag architecture
- Working/saved analysis lifecycle policy

Only drill identities were reused conceptually. New conservative setup, execution,
volume, contraindication, and stop-condition contracts were authored independently.

## Reliable inputs

- Supported or appropriately limited interpretations from the same analysis
- Linked observations and structured non-null evidence
- Interpretation confidence and evidence quality
- Phase, event, FPS, camera, calibration, experimental state, and context requirements
- Athlete context only when explicitly present

Unavailable, insufficient, contradicted, null, or cross-analysis input cannot create an
ordinary corrective action. Contradictory interpretations may only trigger Tier 1
evidence collection.

## Missing context and safety boundaries

- The athlete schema has no training age, competition level, primary event, pain, injury,
  or active-limitation fields.
- Time goals do not establish a recommendation-category goal.
- Live interpretations use unknown phase until canonical phase observations are stored.
- Repeated compatible-session interpretation does not yet exist.
- Saved analyses have no immutable interpretation or recommendation snapshot columns.

Unknown context blocks advanced complexity, medical escalation, and phase-specific
actions. Medical-review actions cannot be triggered by biomechanics alone.

## Persistence

Working recommendations regenerate deterministically. Saved recommendations require an
immutable stored snapshot. The current schema cannot provide it, so saved recommendation
output fails closed. No partial migration was added.

No pose, biomechanics, timing, gate, camera, worker, upload, authentication, RLS,
Observation Engine, or Interpretation Engine logic required modification.
