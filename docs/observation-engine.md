# AVA Observation Engine

Version: `ava-observations-v1`

## Purpose

The Observation Engine is the deterministic boundary between completed biomechanics
analysis and future intelligence systems. It answers only: “What objectively happened
during this sprint?”

It does not recommend, prioritize, diagnose causes, produce reports, or call an LLM.

## Audit findings

- Metric truth already exists in the versioned result foundation. Each `MetricResult`
  carries value, unit, availability, confidence, source, version, warnings, validation
  state, and experimental state. The engine adapts this contract instead of creating a
  second metric system.
- Confidence already exists as `high`, `moderate`, `low`, or `insufficient`. The
  adapter maps those labels directly to `High`, `Moderate`, `Low`, and `Unavailable`.
  It does not calculate new confidence scores.
- Unavailable values are correctly nullable in persisted result objects. The older
  display adapter converts nulls to zero, so the Observation Engine deliberately reads
  the result foundation and never the legacy display fallback.
- Recording mode and recording quality are deterministic engines with explicit evidence.
  Their classifications can support recording and data-quality observations.
- The existing asymmetry engine owns the current 4% noise-floor decision. Observation
  rules consume its measured side, values, difference, and reliability classification;
  they do not duplicate its threshold or its coaching prose. Because that legacy output
  has no confidence label, adapted asymmetry observations retain `Unavailable` confidence
  instead of converting its reliability boolean into an invented score.
- Pose artifacts expose frames, timestamps, source indices, landmarks, and confidence,
  but do not yet persist versioned knee-height, torso-variability, contact-asymmetry, or
  flight-asymmetry result objects. Rules for these facts remain dormant until a supported
  upstream comparison signal exists.
- Timing availability is already governed by the conservative timing policy and metric
  result status. Observation rules report that state without re-evaluating event timing.
- Athlete profile data is present in the immutable input snapshot. No athlete-profile
  observation was added because the current profile contains context, not an objective
  sprint finding.
- Session rendering previously derived metrics, intelligence, and recommendations
  directly. The developer panel now receives completed observation output only; React
  contains no observation rule logic.
- Coaching and recommendation engines include inferred causes and interventions. They
  remain downstream and are intentionally excluded from the Observation Engine.

## Architecture

```text
Completed ExplainableAnalysisResult
  + existing recording quality
  + existing asymmetry classification
              |
              v
read-boundary adapter
              |
              v
CompletedAnalysisObservationInput
              |
              v
versioned rule registry
              |
              v
deduplicate -> resolve conflicts -> validate
              |
              +--> Observation[]
              +--> development trace
```

All generation is pure: no I/O, current-clock read, randomness, React dependency, or
database write. IDs and `createdAt` derive from the analysis ID and completion timestamp.

## Contracts

The central Zod contracts live in `src/lib/observations/contracts.ts`.

An observation includes identity, category, objective title and summary, status,
confidence, non-medical severity, structured evidence, structured limitations, phase,
side, engine and rule versions, supporting metric IDs, availability, and experimental
state.

Evidence is never hidden in prose. Every evidence item includes metric, value, unit,
confidence, source, availability, optional frame range and phase, and measurement
directness (`direct`, `derived`, or `context`).

Statuses are `supported`, `limited`, `unavailable`, `experimental`, and `contradicted`.
Confidence is `High`, `Moderate`, `Low`, or `Unavailable`. Severity describes finding
importance only and must never be presented as injury risk.

## Rule authoring

Rules live only in `src/lib/observations/rules.ts`. Each rule declares:

- stable `ruleId`
- category
- required metric names
- enabled state
- version
- pure evaluation function
- structured output

A rule may consume an existing metric or classification. It must not introduce a new
biomechanics threshold, infer a cause, embed a recommendation, or upgrade upstream
confidence. If required evidence is not supported upstream, do not fire the rule.

Current production rules cover experimental FPS, excellent recording quality, missing
calibration, panning, timing availability, velocity availability, cadence availability,
existing stride-length/frequency asymmetry, and dormant comparison-driven knee-reference
and torso-stability facts. Contact and flight asymmetry activate only when an upstream
comparison signal is supplied.

## Duplicate and conflict handling

Rules assign an internal deduplication key and optional conflict key. Duplicate outputs
merge evidence and limitations. Conflicts retain the candidate with:

1. higher existing confidence;
2. more direct evidence;
3. more evidence items;
4. stable rule-ID ordering as a deterministic tie-break.

The lower candidate is suppressed and recorded in the trace. Conflict resolution never
changes metric values or confidence.

## Debugging

`generateObservationResult` returns observations and a full trace containing the rule
fired state, evidence consumed, confidence source, generation reason, duplicate merge,
and conflict suppression. The session debug panel is available only when
`NEXT_PUBLIC_FEATURE_DEVELOPER_DIAGNOSTICS=true`.

The customer UI does not display this temporary panel, and no observations are currently
persisted.

Run focused coverage with:

```bash
npm run observations:sanity
```

## Future expansion

Add rules only after upstream metrics or classifications are versioned, validated, and
carry explicit confidence and availability. Likely future evidence includes contact and
flight side comparisons, phase-scoped knee height, torso variability, stability, and
cadence consistency.

The next subsystem should be the **Interpretation Engine**. It may consume observations
to explain meaning, but must remain separate so objective facts do not become coupled to
causal inference or recommendations.
