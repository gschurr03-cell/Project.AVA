# AVA Priority Engine

Engine version: `ava-priorities-v1`

## Purpose

The Priority Engine is the final deterministic decision layer before presentation. It
ranks candidate actions already created by the Recommendation Engine. It does not create
recommendations, reinterpret metrics, inspect pose data, estimate time improvement, or
produce an athlete/coach report.

```text
ObservationResult
InterpretationResult
RecommendationResult
Versioned ranking context
          |
          v
compatibility validation
          |
          v
private weighted factor model
          |
          v
family merge + preserve/change conflict handling
          |
          v
Top 3 / Secondary / Strengths / Not priorities / Missing evidence
```

## Audit findings

The existing three structured engines expose confidence, evidence quality, linked
evidence, goals, phase, safety tier, monitoring, and provenance. These are reliable
ranking inputs.

Cross-session persistence, personal baseline deviation, primary event, repeatability,
and coach relevance are not available in the live working-analysis flow. The Priority
Engine accepts versioned categorical signals for them but assigns no benefit when they
are absent. It never infers persistence from one session.

Recommendation output already suppresses unsafe and duplicate candidate actions. The
Priority Engine applies a second evidence-family merge because semantically overlapping
front-side, asymmetry, posture, rhythm, or velocity/timing actions may still originate
from different recommendation rules.

## Output contract

Every priority includes:

- stable priority and recommendation IDs;
- kind, title, rationale, confidence, and expected-impact category;
- linked evidence, observations, interpretations, and recommendations;
- supporting metric keys and limitations;
- next validation step;
- engine version and deterministic timestamp.

The aggregate result contains at most three top priorities and five secondary
priorities, plus supporting strengths, explicit not-priorities, missing-evidence
priorities, warnings, an input hash, and trace.

Expected impact is `High`, `Moderate`, `Low`, or `Unknown`. It describes the broad value
area of taking the candidate action and never estimates time savings.

## Categories

- Top priorities: strongest remaining evidence-supported candidates
- Secondary priorities: worthwhile candidates outside the Top 3
- Supporting strengths: preserve-only recommendations
- Not priorities: preserve findings, merged duplicates, Recommendation Engine
  suppressions, and conflicts
- Missing-evidence priorities: recording or evidence-collection actions

A missing-evidence action may also appear in the Top 3 when it safely unlocks trustworthy
decision-making. The UI labels it explicitly rather than presenting it as a mechanical
change.

## Safety

Lower-risk actions win otherwise comparable conflicts. Evidence collection receives an
applicability advantage over limited or experimental mechanical actions. Preserve
recommendations with equal or stronger confidence suppress conflicting change actions in
the same family.

No internal numeric score is present in the public contract or UI.

## Development trace

The trace identifies each factor as increasing, decreasing, or not affecting support and
explains why. It also records final classification, merging, conflict handling, and the
recommendation that suppressed a candidate.

## Live integration

The engine runs only for mutable working analyses after Observation, Interpretation, and
Recommendation generation succeeds. Saved-version intelligence remains withheld because
upstream immutable snapshots are not yet persisted.

The temporary Priority panel is protected by `developerDiagnostics`; trace details also
require `priorityDebugTrace`.

## Known limitations

- No live compatible-session persistence or personal baseline signals
- No live athlete goal category or primary-event contract
- Canonical phase remains unknown in the current page adapter
- Coach relevance is not stored
- Priority output is generated on demand rather than persisted
- No final presentation/report layer

The next subsystem is the **Coach Report Engine**, after immutable intelligence snapshots
are added.
