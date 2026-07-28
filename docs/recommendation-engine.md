# AVA Recommendation Engine

Engine version: `ava-recommendations-v1`  
Library version: `ava-recommendation-library-v1`

## Boundary

The engine answers: “What is the safest appropriate next action supported by the current
interpretations?” It produces candidate actions, not priorities, reports, schedules,
training programs, diagnoses, rehabilitation, or guaranteed performance changes.

```text
InterpretationResult + versioned context
                 |
                 v
trust, confidence, phase, goal, and safety gates
                 |
                 v
rule registry -> recommendation library
                 |
                 v
duplicate/conflict suppression
                 |
                 v
RecommendationResult + trace
```

Raw metrics and pose data are not accepted.

## Contracts

Each recommendation contains linked interpretations and observations, evidence, action
and intervention types, rationale, suggested actions, cues, implementation notes, broad
volume guidance, progression, stop conditions, contraindications, monitoring plan,
expected outcome area, confidence, intervention evidence quality, safety tier, context,
limitations, excluded claims, versions, input hash, and provenance.

## Matching and confidence

A rule must pass interpretation key, confidence, evidence-quality, phase, event, athlete
context, feature, library, and safety checks. Recommendation confidence never exceeds the
weakest core interpretation. Low-confidence findings default to evidence collection or
monitoring.

General evidence-collection actions may remain appropriate when a corrective action is
not. This does not upgrade the mechanical conclusion.

## Safety order

Internal selection considers safety and action class only to prevent incompatible output:

1. recording/evidence collection;
2. preserve;
3. monitoring;
4. technical cue;
5. low-risk drill;
6. training consideration;
7. professional review.

This is not performance ranking and must not be presented as a Priority Engine.

## Phase and athlete context

Tier 2 phase-specific actions require a compatible known phase. Unknown phase retains
Tier 1 monitoring or recording actions. Beginner/advanced context is supported by the
contract but remains unknown in the current database.

Athlete-reported pain or active limitation blocks ordinary Tier 2 drills. Medical review
requires explicit supported athlete context and cannot be triggered by biomechanics.

## Working and saved analyses

Working output regenerates deterministically. Saved output must use an immutable stored
snapshot. Saved versions without that snapshot return `snapshot_required` and render no
recommendations.

No persistence migration was added because interpretation snapshots are also not yet
stored. Both layers should be persisted atomically with a saved analysis.

## Feature flags

- `recommendationEngine`
- `recommendationDebugTrace`
- `experimentalRecommendations`
- `advancedDrillRecommendations`
- `professionalReviewRecommendations`

The debug panel is additionally protected by `developerDiagnostics`.

## Known limitations

- No persisted saved snapshots
- No canonical live phase/event
- No athlete training-age, competition, pain, or limitation fields
- No compatible repeated-session interpretation
- No verified research-reference ingestion
- No Priority Engine

The next subsystem is the Priority Engine after immutable intelligence snapshots are
implemented.
