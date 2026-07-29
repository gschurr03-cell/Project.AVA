# Sprint Intelligence Elite Coaching Architecture

## Dependency map

```text
Overlay frames + worker metrics
  ├─ calibrated SprintMeasurements (contacts, zone time, velocity, stride)
  ├─ Recording Quality / Measurement Confidence
  ├─ phase detection
  ├─ performance prediction and athlete history
  └─ shared coaching thresholds
       ↓
Sprint Intelligence rule evaluation
       ↓
evidence-supported issue candidates
       ↓
priority score = impact score × measurement confidence
       ↓
deduplicated ranked findings
       ├─ evidence and video/frame references
       ├─ root-cause hypotheses
       ├─ concise recommendation themes
       ├─ issue interactions
       └─ directional performance-impact range
```

## Audit

The customer session previously had overlapping decision paths:

- `intelligence/index.ts` evaluated ground contact, stride length, step frequency, and flight time.
- `limitingFactors.ts` independently ranked trusted speed, stride, and frequency values for the visible panel.
- `recommendations.ts` generated customer coaching actions from trusted measurements.
- The observation → interpretation → recommendation → priority stack provided a newer evidence architecture, but was primarily visible in diagnostics and coach reports.

The visible `AvaIntelligencePanel` used `limitingFactors` for its cards and used the Sprint Intelligence report only for missing-data guidance. That meant its richer reasoning, phase attribution, drills, and confidence were not exposed.

### Rules and thresholds

The shared source is `src/lib/coaching/knowledge/thresholds.ts`:

| Finding | Supporting metric | Elite/target range | Watch | Poor |
|---|---|---:|---:|---:|
| Long ground contact | Ground contact time | 75–95 ms | 111–125 ms | 126+ ms |
| Short stride length | Calibrated stride length | 2.35–2.65 m display target; 2.45–2.75 m elite band | 2.00–2.24 m | below 2.00 m |
| Low frequency | Step frequency | 4.8–5.2 Hz | 4.2–4.49 Hz | below 4.2 Hz |
| Limited flight/projection | Flight time | 100–140 ms | outer 70–170 ms band after elite/good matching | outside supported bands |

Ground contact and flight are suppressed when FPS precision is insufficient. Stride length requires calibration. Cadence prefers calibrated zone frequency over the worker estimate.

### Duplicate and generic logic addressed

- Issue keys are unique and sorted with stable tie-breakers.
- Priority now includes confidence, preventing a severe but weakly measured issue from outranking a well-supported issue automatically.
- Generic single-line coaching focuses are expanded into fixed primary/secondary focuses, drill/sprint/strength/plyometric themes, and concise cues.
- Root-cause text explicitly separates observed measurements from likely technique, possible physical contributors, alternative explanations, and additional testing.
- The trusted-metric summary remains visible, but detailed issue sections use the evidence-backed Sprint Intelligence finding rather than recreating another rule set.

## Priority and impact

`impactScore` remains the transparent rule weight × severity calculation. `priorityScore` is:

```text
round(impactScore × measurementConfidenceScore / 100)
```

The ordering is priority, then impact, severity, and stable metric identifier. Only metrics that successfully evaluate against the shared threshold registry create findings.

Performance cost is a conservative directional 100 m planning range attached to each rule and halved for `watch` severity. It is always labeled as non-predictive. It must not be presented as a guaranteed improvement or added across interacting issues.

## Root-cause safety

The engine never diagnoses injury, weakness, or pathology. It uses:

- **Observed:** direct measured result versus expected range.
- **Likely:** fixed technical hypotheses associated with that observation.
- **Possible:** non-diagnostic physical qualities that could contribute.
- **Alternative explanations:** recording, phase, strategy, fatigue, or measurement explanations.
- **Needs additional testing:** independent measurements required to distinguish causes.

## Recommendation scope

Recommendations are themes, not programs. Every recommendation is attached to a finding with measured evidence. No sets, repetitions, loading, return-to-play, or medical claims are generated.

## Extension points

- Feed exact contact frame ranges instead of phase-window frame ranges.
- Derive cost bands from a validated athlete-specific sensitivity model.
- Promote the observation/interpretation/priority graph to the customer surface after compatibility and duplication checks.
- Add longitudinal persistence to priority scoring once session protocols are demonstrably comparable.

