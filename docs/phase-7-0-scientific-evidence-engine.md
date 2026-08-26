# Phase 7.0 — Scientific Evidence and Metric Availability Engine

**Date:** 2026-08-07  
**Status:** **CLOSED** (unweighted evidence architecture phase)  
**Roadmap:** 29.5% (unchanged)

## 1. Executive summary

AVA now has one versioned, deterministic scientific-evidence vocabulary layered
onto the inherited per-metric availability evaluator. It records canonical
reasons, evidence classes, low-level atoms, dependencies, inputs, exclusions,
contributing source frames/time ranges, and legacy provenance gaps. It does not
calculate metrics and did not alter any scientific formula or threshold.

The existing `evaluateMetricEvidence` function remains the authoritative
availability decision point. Phase 7.0 enriches each result with
`scientific-evidence-v1`; it does not replace the proven Day 98 gates. Consumer
UI continues to show a value or a concise reason and never a confidence percent.

## 2. Roadmap status

Phase 7.0 was not assigned a weight. It is recorded CLOSED without invented
credit. Weighted completion remains **29.5%**. Phase 6.2 remains IN PROGRESS
solely because browser playback validation is blocked. All previously closed
phases remain closed. The roadmap's older weighted “Phase 7” is a different
future skeleton-controls entry; it was not silently reassigned to Phase 7.0.

## 3. Existing evidence audit

| Module | Decision/evidence | Duplication or gap before Phase 7.0 |
|---|---|---|
| `measurements.ts` | formulas, crossing verification, contacts, windows, coverage | strong raw provenance; no common metric graph |
| `recordingMode.ts` | geometry/cadence trust and camera-mode blanket safety | intentionally reused by metric evaluator |
| `metricEligibility.ts` | source-FPS eligibility for acceleration contact timing | separate analysis family; not previously represented as atoms |
| `metricEvidence.ts` | independent metric availability and legacy reasons | authoritative gate; provenance shape was shallow |
| `trustedMetrics.ts` | null/value adapter from evidence results | no second scientific gate |
| `PerformanceSummaryCard.tsx` | metric-level rendering and legacy session headline | reason presentation correct; legacy three-state headline retained |
| `zoneStepAnalysis.ts` | canonical contacts/intervals/quality flags | rich frames existed but were not attached to metric provenance |
| `contacts.ts` / Phase 5.0D | contact, touchdown, toe-off, flight products | valid contact and valid timing were not formally separate contracts |
| result/artifact schemas | historical values and optional provenance | older artifacts cannot supply v1 frame lists |
| direct raw consumers | benchmark/debug panels and some intelligence fallbacks | still exist; consumer performance card uses trusted evidence path |

The only duplicated validity decisions found on the primary consumer path were
intentional upstream scientific production gates plus downstream availability
gates. Phase 7.0 did not remove either. Direct benchmark/debug displays remain
outside the consumer contract and are documented follow-up work.

## 4. Evidence vocabulary

`EvidenceAtom` records type, status, interpretable class, frame or frame range,
timestamp or time range, provenance source, canonical reason, direct/derived
origin, and dependencies. The vocabulary includes source frame/timestamp,
localization, pose/lower-limb pose, contact/sequence, both crossings,
calibration/world transform, step interval, velocity window, zone distance, FPS,
camera mode, crop provenance, touchdown, toe-off, contact duration, and flight
interval. Atoms are in-memory/artifact JSON, not database rows.

## 5. Evidence quality classes

| Class | Meaning | Consumer exact metric | Exact timing | Spatial measurement |
|---|---|---:|---:|---:|
| `direct_verified` | directly observed and provenance-valid | yes | yes | yes |
| `derived_verified` | deterministic derivation from verified inputs | yes | yes | yes |
| `bounded_inferred` | explicit bounded recovery | no by default | no | no |
| `partial_supported` | real but incomplete support | no by default | no | no |
| `unsupported` | required support absent | no | no | no |
| `rejected` | evidence explicitly failed a gate | no | no | no |
| `ambiguous` | evidence cannot support one interpretation | no | no | no |

Contracts have no allowable inference by default. A future contract must opt in
explicitly; presentation/debug permission does not authorize a metric.

## 6. Metric contracts

Contracts exist for Zone Time, Average/Peak Step Length, Step Frequency,
Average/Peak Velocity, GCT, Flight Time, joint angle, asymmetry, Step Count, and
Zone Step Count. Each declares required and optional atom types, forbidden
classes, minimum evidence count, allowable inference, and calculation version.
Current formulas remain in their existing modules.

## 7. Zone Time evidence

Zone Time requires verified start and finish crossings, source timestamps, and
calibration. A bracketed crossing is a non-extrapolated crossing backed by the
existing consecutive-frame/continuity policy. An extrapolated crossing remains
unavailable. Missing or rejected crossings never fall back to clip, pose, or
contact duration. Provenance persists the existing crossing frames/timestamps,
detection method through legacy fields, and corresponding v1 atoms. The current
measurement artifact does not expose the internal interpolation fraction; Phase
7.0 does not invent it.

## 8. Step Frequency evidence

The contract requires athlete-specific accepted contacts, a valid sequence, and
source timestamps, minimum two contacts. Canonical zone contacts contribute
their exact frames/times when the v1 `zoneStepSummary` exists. Same-foot or other
invalid intervals cannot satisfy `CONTACT_SEQUENCE_VALID`; unsupported gaps are
not bridged. The metric formula and cadence trust gate are unchanged.

## 9. Step Length evidence

Average and Peak Step Length require accepted contacts, at least two eligible
step intervals, valid calibration, and world transforms. Only valid
`zoneStepSummary.intervals` become atoms. Peak retains the repository's current
`computePeakStrideLengthM` rolling-four calculation; the evidence engine neither
reimplements nor tunes it. Excluded contacts retain their source frame and
coverage reason where available.

## 10. Velocity evidence

Average Velocity depends on confirmed zone distance and verified Zone Time.
Peak Velocity depends on the current stride-velocity windows and spatial safety,
not gate-crossing timing. These remain distinct contracts. Window inputs retain
contact-index membership and reported duration; exact source frames are not
invented when legacy window records only contain contact indices.

## 11. Contact/GCT/Flight evidence

Contact existence, touchdown, toe-off, contact duration, and flight interval are
separate atom products. GCT requires touchdown + toe-off + contact duration.
Flight requires toe-off + the next supported touchdown + a valid flight interval.
A contact alone authorizes neither. Phase 5.0D's same-foot and unsupported-gap
integrity remains unchanged.

## 12. Canonical reason codes

The taxonomy includes crossing-specific reasons, insufficient contacts/steps,
invalid sequence, localization/pose/lower-limb failures, calibration/distance,
FPS, camera motion, coverage/gaps/identity/mode, not-computed, and legacy
provenance absence. Compatibility mapping includes:

| Legacy | Canonical |
|---|---|
| `not_calibrated`, `calibration_required` | `calibration_unavailable` |
| `insufficient_step_evidence`, `insufficient_stride_evidence` | `insufficient_step_intervals` |
| `insufficient_contact_evidence` | `insufficient_contacts` |
| `athlete_tracking_unreliable/unavailable` | `localization_unverified` |
| camera/panning unsafe reasons | `camera_motion_unverified` |
| `not_computed_by_current_pipeline` | `metric_not_computed` |

Legacy `reasonCode` is preserved externally; canonical reason is authoritative
inside `provenance.scientific`.

## 13. Evidence graph

`evidenceDependencyGraph(metricId)` returns a stable sorted root/dependency graph.
For example Average Velocity resolves to zone distance, both crossings, source
timestamps, and calibration. No AI, state, clock, or I/O participates.

## 14. Provenance payload

Each metric now carries `schemaVersion`, metric/value/available/reason,
evidenceClass, contributing frames/time ranges, input values, dependencies,
excluded evidence, calculation version, atoms, and
`legacyProvenanceIncomplete`. Existing shallow provenance fields remain intact.

## 15. UI availability model

`PerformanceSummaryCard` already consumes `TrustedMetrics.evidence` metric by
metric. Available values render normally; unavailable values render
“Unavailable” and a reason. No raw atom list, internal class, numeric confidence,
or confidence percentage is exposed. A developer inspector was not added because
the backend graph/payload satisfies this phase without expanding consumer UI.

## 16. Session result states

The inherited public headline states (`verified`, `partial`, `unavailable`) are
preserved for compatibility. The new deterministic adapter supports `complete`,
`partially_available`, `timing_only`, `technique_only`, and `unavailable`, derived
only from metric statuses. It never blanket-hides an unrelated available metric.

## 17. Backward compatibility

The v1 payload is additive and optional on the existing provenance interface.
Historical artifacts remain readable. Legacy reasons are mapped. If an artifact
lacks `zoneStepSummary`, its value and inherited verified availability remain
unchanged, while exact contact/interval frame provenance is empty and
`legacyProvenanceIncomplete=true`. Missing history is disclosed, never fabricated.

## 18. Files changed

- `src/lib/intelligence/scientificEvidence.ts` — vocabulary, taxonomy,
  contracts, graph, payload, invariants, and session-state adapter.
- `src/lib/intelligence/metricEvidence.ts` — additive v1 provenance attachment.
- `scripts/phase-7-0-scientific-evidence-sanity.mjs` — 26 deterministic checks.
- `scripts/phase-4-2k-verification-rerun-check.mjs` — read-only evidence output.
- `package.json` — Phase 7.0 command.
- this report and roadmap.

## 19. Database changes

None. Four calibration records were read for replay. No row, storage object,
migration, schema, worker, or database state was changed.

## 20. Deterministic tests

`npm run phase-7-0-scientific-evidence:sanity`: **26/26 passed**. It covers all
26 requested cases, including required/rejected/inferred evidence, metric
contracts, legacy mapping, independent GCT/flight, frame tracing, state derivation,
consumer percentage exclusion, unchanged formula ownership, and four graph
determinism checks.

Also passed: measurement recovery, timing verification, contacts, Phase 4.2K,
Phase 5.0D, Phase 5.0E, Phases 6.1–6.5, analysis report, analysis FPS, zone-step
counting, zone coverage, lint, typecheck, and production build. `pose:sanity` has
one pre-existing standalone TypeScript path-alias failure (`@/lib/video/*` from
`calibration/index.ts`); full project typecheck/build pass and no pose code changed.

## 21. Gav replay

Old/new availability was identical: the six primary metrics plus GCT/Flight are
available; joint angle/asymmetry remain unavailable (`metric_not_computed`). Zone
Time and Average Velocity cite crossing frames **13/128**. Frequency remains
**4.848484848484849 Hz**, Zone Time **1.92 s**, Peak Velocity
**11.092149424565784 m/s**. Legacy step-frame provenance is explicitly incomplete.

## 22. Vanni 240 replay

Availability was identical. Crossing frames are **59/567**. Frequency remains
**3.103448275862069 Hz**, Zone Time **2.12 s**, Peak Velocity
**9.591178790487021 m/s**. Joint angle/asymmetry remain unavailable. Legacy
step-frame provenance is explicitly incomplete.

## 23. Vanni 120 replay

Availability was identical. Crossing frames are **28/290**. Frequency remains
**3.6206896551724137 Hz**, Zone Time **2.19 s**, Peak Velocity
**9.416358925269277 m/s**. Joint angle/asymmetry remain unavailable. Legacy
step-frame provenance is explicitly incomplete.

## 24. Vanni 60 replay

Availability was identical. Crossing frames are **9/145**. Frequency remains
**4.385953327434329 Hz**, Zone Time **2.40 s**, Peak Velocity
**10.881288775005759 m/s**. Joint angle/asymmetry remain unavailable. Legacy
step-frame provenance is explicitly incomplete.

## 25. Scientific regression check

All four production replays used the real Phase 4.2K pose artifacts, existing
calibration records, `buildOverlayFrames`, FPS normalization, and the unmodified
`computeSprintMeasurements`. Values and availability were identical before and
after provenance enrichment. No scientific source or threshold changed.

## 26. Phase 7.0 acceptance table

| Criterion | Result |
|---|---|
| current gates inventoried | Pass |
| canonical vocabulary/classes/contracts/reasons | Pass |
| structured provenance and graph | Pass |
| evidence-driven UI; no percentage | Pass |
| metric-derived session state | Pass |
| legacy artifacts readable | Pass |
| four real replays audited | Pass |
| scientific values unchanged | Pass |
| deterministic and relevant regression suites | Pass, with pre-existing standalone `pose:sanity` alias limitation disclosed |
| roadmap honest | Pass |

## 27. Roadmap progress

Phase 7.0 is CLOSED and unweighted. Completion remains **29.5%**. Phase 6.2
remains IN PROGRESS solely for browser playback validation.

## 28. Remaining limitations

- Current production replay artifacts use the legacy points-only measurement
  path and do not populate `zoneStepSummary`; contact/step source-frame lists
  therefore cannot be reconstructed and are honestly marked incomplete.
- Crossing interpolation fraction is not exposed by the inherited timing
  artifact and was not invented.
- FPS and pose/localization provenance have canonical atom types, but the current
  `SprintMeasurements` payload does not yet carry all upstream raw records.
- Direct benchmark/debug and some intelligence fallback consumers still read raw
  measurements; the trusted consumer card is authoritative for availability.
- No developer UI inspector was built; the deterministic backend payload is ready.
- Browser playback was not required and Phase 6.2's blocker remains unchanged.

## 29. Git status and agent handoff provenance

No commit, push, or database reset occurred. The worktree was already heavily
dirty; unrelated changes were preserved.

- **Prior architecture inherited:** measurement formulas, Day 98 per-metric
  evaluator, trusted adapter/UI, timing/contact/zone provenance, and Phase 4.2–6.5 work.
- **Prior findings independently verified:** metric-specific availability,
  crossing safety, contact/flight separation, UI reason behavior, and four replay values.
- **Findings corrected/disproved:** no prior scientific conclusion was disproved;
  the audit corrects the assumption that existing shallow provenance could name
  every contributing frame—legacy step artifacts cannot.
- **Code changed personally:** only the files in Section 18.
- **Tests added personally:** the 26-check Phase 7.0 suite.
- **Real benchmarks run personally:** all four read-only production measurement
  and evidence replays in Sections 21–24.
- **Not personally validated:** browser playback, external ground truth, raw
  upstream provenance absent from existing artifacts, and prior benchmark model inference.

## 30. Exact recommended Phase 7.1 scope

Add provenance-only plumbing—without formula or gate changes—from canonical
contact IDs/source frames, stride-window endpoint contact IDs, FPS eligibility,
pose/localization/crop atoms, and crossing interpolation fraction into the
versioned analysis artifact. Then add a developer-only inspector consuming the
existing graph. Re-run the same four artifacts and require values/availability
to remain byte-identical; do not backfill missing historical frames by inference.

## 31. Closure conclusions

1. Phase 7.0 is **CLOSED**.
2. Roadmap completion remains **29.5%** because Phase 7.0 is currently unweighted.
3. Phase 6.2 remains **IN PROGRESS** solely because browser-playback validation
   is still outstanding.
4. The canonical scientific evidence engine now includes evidence atoms,
   evidence quality classes, a canonical reason taxonomy, metric-specific
   contracts, dependency graphs, structured provenance, invariants, and
   metric-derived session result states.
5. `scientific-evidence-v1` provenance is additive and integrated into the
   authoritative metric evaluator.
6. Legacy artifacts and legacy reason codes remain backward compatible.
7. No formulas, thresholds, localization, pose inference, contacts, timing,
   gates, calibration, crop planning, worker behavior, or database behavior changed.
8. No consumer-facing confidence percentage was introduced.
9. Production replay frequencies remain exactly: Gav
   **4.848484848484849 Hz**, Vanni 240 **3.103448275862069 Hz**, Vanni 120
   **3.6206896551724137 Hz**, and Vanni 60 **4.385953327434329 Hz**.
10. Two unrelated existing issues remain documented and untouched:
    `pose:sanity` has a standalone TypeScript path-alias failure while full
    project compilation passes and no pose code changed; `git diff --check`
    reports an unrelated pre-existing trailing blank line in
    `src/lib/supabase/database.types.ts`.
11. Neither unrelated issue was modified during closeout.
12. No commit, push, database reset, or database mutation was performed.
