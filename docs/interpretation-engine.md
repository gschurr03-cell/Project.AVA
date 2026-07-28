# AVA Interpretation Engine

Engine version: `ava-interpretations-v1`

## Boundary

Observations state what was measured. Interpretations state cautious, plausible
sprint-performance meaning. Recommendations will eventually prescribe action and remain a
separate future system.

The engine does not diagnose causes, select drills, rank findings, create reports,
recalculate raw metrics, inspect pose frames, or use an LLM.

## Architecture

```text
Observation[] + versioned analysis context
                  |
                  v
input validation and trust filtering
                  |
                  v
deterministic rule registry
                  |
        confidence + evidence quality
                  |
                  v
duplicate merge -> contradiction resolution
                  |
                  v
InterpretationResult + development trace
```

All output is deterministic. `generatedAt` comes from the completed analysis timestamp;
IDs, input hashes, rule versions, and source observation versions are preserved.

## Contracts

The central Zod contracts define interpretation status, confidence, evidence quality,
sprint phase, alternative explanations, context dependencies, provenance, individual
interpretations, and the aggregate result.

Each interpretation separates:

- linked measured observations and supporting evidence;
- likely meaning;
- alternative explanations;
- confidence and its reasons;
- evidence quality and its reasons;
- limitations and missing context;
- conclusions the rule is forbidden to make.

## Input validation

Only available, non-null, non-contradicted observations from the same analysis and
compatible Observation Engine contract may be consumed. Unavailable confidence and
withheld metric states fail closed. Raw metrics are not an accepted generator input.

## Confidence

Interpretation confidence uses the weakest linked observation as its ceiling. V1 caps
inferred meaning at Moderate and reduces it for unknown phase, panning, experimental
30 FPS, experimental observations, and numerous alternative explanations.

This does not modify upstream measurement confidence. Pose confidence alone can never
produce high interpretation confidence.

## Evidence quality

Evidence quality is separate from measurement confidence:

- `strong`: multiple observations with direct evidence;
- `moderate`: direct descriptive evidence;
- `limited`: derived, contextual, or experimental evidence;
- `heuristic`: association between a measured pattern and plausible meaning;
- `unavailable`: no accepted evidence.

Asymmetry meaning remains heuristic even when the underlying side difference is measured
with high confidence.

## Context and phase

Rules declare phase, event, camera, and FPS applicability. A phase-specific rule with an
unknown or incompatible phase becomes `context_required`; it does not borrow an
expectation from another sprint phase. The current result-page adapter deliberately uses
`unknown` until canonical phase metadata is preserved by observations.

Personal-baseline interfaces are placeholders only. Baseline-dependent rules are not
enabled.

## Conflicts and overlap

Overlapping interpretations merge by interpretation family, phase, and side. Conflict
groups retain the candidate with the strongest combination of observation count,
evidence quality, confidence, and non-experimental status. Every merge or suppression is
recorded in the trace.

Converging asymmetry suppresses repetitive single-metric interpretations. Directionally
conflicting asymmetry is separated into `contradictedInterpretations`.

## Persistence lifecycle

Working analyses regenerate on demand from their current versioned observations.

Saved versions must use an immutable stored `InterpretationResult`. Because the current
database lacks that snapshot, saved-version interpretation fails closed with
`snapshot_required` and is not rendered. This prevents new rules from silently changing
historical saved output.

No migration was added in this slice. Production persistence requires an atomic result
snapshot written before or during `save_working_analysis_snapshot`, plus typed database
columns for engine version, input hash, generated timestamp, and JSON result.

## Feature flags

- `interpretationEngine`: enables deterministic generation.
- `interpretationDebugTrace`: shows the detailed trace.
- `personalBaselineInterpretations`: disabled pending compatibility infrastructure.
- `experimentalInterpretations`: marks the intended boundary for experimental output.

Developer output remains additionally protected by `developerDiagnostics`.

## Debugging

The trace records observations considered, accepted, and rejected; context checks;
excluded conclusions; confidence and evidence-quality calculations; selected alternative
explanations; conflict resolution; merge behavior; output IDs; and suppression reasons.

Run:

```bash
npm run interpretation-engine:sanity
```

## Known limitations

- Canonical phase/event and sample-size metadata are not yet present in observations.
- Live legacy asymmetry lacks a compatible confidence label.
- Velocity plateau, trend, repeated-session, contact/flight interaction, backside, and
  broad consistency rules require upstream observations that do not yet exist.
- Saved-version persistence is deliberately withheld rather than simulated.

The next subsystem, after immutable persistence is completed, is the Recommendation
Engine. It must consume interpretations without weakening the observation boundary.
