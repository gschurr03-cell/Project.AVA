# Phase 7.1 — Evidence-Aware Athlete Explanations and Coach Debugging

**Date:** 2026-08-07  
**Status:** **CLOSED** (unweighted explanation/presentation phase)  
**Roadmap:** 29.5% (unchanged)

## 1. Executive summary

Phase 7.1 turns Phase 7.0's canonical scientific evidence into deterministic,
audience-specific explanations. Every canonical reason now has athlete wording,
coach context, a developer description, and evidence-backed recording guidance
where appropriate. Available metrics can explain the evidence that authorized
them; unavailable metrics explain the primary or downstream dependency failure.

The consumer metric card now uses this one policy instead of a local legacy-text
map. Shared root causes are consolidated so recording advice appears once. A
feature-gated developer inspector exposes dependencies, frames, exclusions, and
calculation versions without exposing raw provenance in athlete mode.

No scientific eligibility, value, formula, threshold, localization, pose,
contact, timing, calibration, gate, crop, worker, or database behavior changed.

## 2. Roadmap status

Phase 7.1 is CLOSED and currently unweighted. No roadmap credit was invented;
weighted completion remains **29.5%**. Phase 6.2 remains IN PROGRESS solely
because browser-playback validation remains outstanding. All other previously
closed phases remain closed.

## 3. Current message audit

| Source | Existing message family | Audience | Finding |
|---|---|---|---|
| `PerformanceSummaryCard` | local `humanizeReason` table | athlete | duplicated Phase 7.0 reason semantics; some terse engineering language |
| `PerformanceSummaryCard` | generic partial/unavailable copy | athlete | could issue generic re-record advice unrelated to the actual cause |
| `PerformanceSummaryCard` | numeric partial-zone endpoints | athlete | accurate but more technical than necessary |
| `MetricsPanel` | calibration/FPS/tracking placeholders | experimental consumer UI | separate legacy trust system; retains numerical confidence UI outside primary metrics |
| `metricEligibility.ts` | unsupported FPS explanations | uploader/analysis consumer | clear but not connected to canonical explanation payload |
| `OverlaySurface` | unavailable overlay reasons | consumer/developer | correctly separated by Phase 6.4; not a metric explanation surface |
| analysis report | “Unavailable,” confidence, missing-input text | athlete/coach/organization | separate persisted report model; not yet supplied Phase 7 provenance |
| developer panels | observations/interpretation/recommendation traces | developer | existing feature-gated boundary suitable for evidence inspector |

Conflicts included `not_calibrated` versus `calibration_required`,
`insufficient_step_evidence` versus `insufficient_stride_evidence`, and multiple
tracking/camera phrases for canonical equivalents. Phase 7.1 maps them through
Phase 7.0 first. It does not rewrite unrelated experimental/intelligence
confidence systems.

## 4. Audience model

- **ATHLETE:** short, neutral, non-technical; no raw atoms, dependency names,
  frame lists, provenance, or confidence percentage.
- **COACH:** slightly more causal detail plus recording guidance supported by
  the actual reason.
- **DEVELOPER:** full technical description, dependency path, contributing
  frames/time ranges, excluded evidence, and calculation version.

Developer details remain behind `FEATURES.developerDiagnostics`.

## 5. Explanation architecture

```text
MetricEvidence
  → scientific-evidence-v1 canonical reason/provenance
  → deterministic reason policy
  → metric dependency specialization
  → audience projection
  → root-cause consolidation
  → metric card / developer inspector
```

`EvidenceExplanation` carries version, reason, metric, audience, title, message,
actionability, guidance codes/text, technical detail, dependency path, and source
evidence. Athlete projection intentionally nulls technical/source fields.

## 6. Canonical reason mappings

All 25 Phase 7.0 reasons have complete policies. Representative mappings:

| Canonical reason | Athlete | Coach | Developer |
|---|---|---|---|
| `finish_crossing_unavailable` | Finish crossing could not be verified. | Insufficient verified finish-gate evidence for zone time. | `FINISH_CROSSING_VERIFIED` absent. |
| `insufficient_contacts` | Not enough ground contacts were verified. | Not enough athlete-specific contacts for the calculation. | Contact minimum not met. |
| `localization_unverified` | AVA could not verify the athlete through the required part. | Localization provenance did not cover required evidence. | Required localization absent/rejected. |
| `lower_limb_evidence_missing` | Leg and foot evidence was unavailable. | Lower-limb landmarks were insufficient. | Lower-limb atom absent. |
| `metric_not_computed` | Metric is not available for this analysis type. | Current pipeline does not calculate it. | No calculation product exists. |

Unknown runtime reasons fail safely through canonical fallback and never expose a
slug as consumer copy.

## 7. Recording guidance taxonomy

Guidance codes are `KEEP_ATHLETE_VISIBLE`, `KEEP_START_GATE_VISIBLE`,
`KEEP_FINISH_GATE_VISIBLE`, `KEEP_FULL_ZONE_VISIBLE`, `MOVE_CAMERA_CLOSER`,
`USE_HIGHER_FPS`, `USE_SUPPORTED_CAMERA_MODE`, `CONFIRM_DISTANCE`,
`RECALIBRATE_GATE`, `KEEP_FEET_IN_FRAME`, `REDUCE_CAMERA_SHAKE`, and
`NO_ACTION_NEEDED`.

Advice is absent for ambiguous identity/contact-sequence causes where the
evidence cannot justify a user action. `metric_not_computed` and legacy
provenance use `NO_ACTION_NEEDED`. The engine never labels a recording “bad.”

## 8. Metric dependency explanations

Average Velocity specializes crossing/timing failures as a downstream failure:
“Average Velocity is unavailable because verified Zone Time is unavailable.”
The Zone Time card carries the full crossing explanation. Coach/developer output
retains the dependency chain. Other metrics use their own Phase 7.0 contracts.

## 9. Available metric explanations

Coach/developer explanations include deterministic inputs:

- Step Frequency: verified contact count and source timestamps.
- Average Step Length: eligible interval count and calibrated zone.
- Peak Step Length: current rolling contract and eligible interval count.
- Zone Time: verified crossings and source timestamps.
- Average Velocity: confirmed distance and verified Zone Time.
- Peak Velocity: verified stride-window count.

Athlete cards continue to emphasize values; available evidence detail is not
expanded by default.

## 10. Coverage language

Athlete/coach copy describes which portion was supported without raw percentages:
“AVA measured the middle and finish portions of this run. Step metrics are based
only on the verified portion.” Developer mode retains exact percentage and metre
range. Full coverage produces no warning.

## 11. Session summaries

Summaries reuse Phase 7.0 states: `complete`, `partially_available`,
`timing_only`, `technique_only`, and `unavailable`. No parallel state system was
created. Root causes are consolidated across the six primary session metrics;
unimplemented advanced metrics do not turn a complete session into a warning.

## 12. Metric-card integration

`PerformanceSummaryCard` now obtains unavailable copy from
`explainMetricEvidence`. It shows one concise reason per unavailable metric and,
for partial sessions, one small expandable “How to improve this recording” item
from the consolidated root cause. The prior local wording table was removed.

## 13. Recording-fix consolidation

`consolidateRootCauses` groups unavailable metrics by canonical reason and sorts
the result deterministically. A finish-crossing failure affecting Zone Time and
Average Velocity yields one root cause and one recording action, not duplicated
advice on both cards.

## 14. Coach/developer evidence inspector

The backend produces complete coach payloads. The session page adds a lightweight
developer inspector under its existing diagnostics feature flag. Each metric
shows status, explanation, dependency list, calculation version, contributing
frames, and excluded-evidence count. The payload already carries frame/time
ranges for future “Jump to evidence/problem” navigation; no frame browser was
built.

The separately persisted analysis report was audited but not expanded because it
does not currently receive `TrustedMetrics.evidence`; adding that storage/load
contract is Phase 7.2 scope. Existing report confidence UI is not presented as
Phase 7.1 scientific-availability confidence.

## 15. Files changed

- `src/lib/intelligence/evidenceExplanations.ts` — audience policies, guidance,
  dependency messages, available explanations, coverage, summaries, consolidation.
- `src/app/sessions/[id]/PerformanceSummaryCard.tsx` — athlete integration.
- `src/app/sessions/[id]/EvidenceInspector.tsx` — feature-gated developer view.
- `src/app/sessions/[id]/page.tsx` — inspector placement under existing flag.
- `scripts/phase-7-1-evidence-explanations-sanity.mjs` — 24 checks.
- `scripts/phase-4-2k-verification-rerun-check.mjs` — explanation replay output.
- `package.json`, this report, and roadmap.

## 16. Database changes

None. Existing calibration records were queried read-only for four replays. No
row, schema, migration, artifact, storage object, worker state, or database state
was changed.

## 17. Deterministic tests

`npm run phase-7-1-evidence-explanations:sanity`: **24/24 passed**. It covers
complete mapping, fallback, dependencies, consolidation, guidance boundaries,
consumer privacy, available evidence, coverage, session state, legacy mapping,
developer provenance, unchanged values/eligibility, and four deterministic
benchmark payloads.

Also passed: Phase 7.0, Phases 6.1–6.5, Phase 5.0D/E, contacts, Phase 4.2K,
measurement recovery, timing verification, analysis report/FPS, zone-step
counting/coverage, lint, final typecheck, and production build. `pose:sanity`
retains its documented standalone TypeScript path-alias failure; full project
compilation passes and no pose code changed. A typecheck started concurrently
with `next build` briefly observed `.next/types` regeneration; the required
post-build typecheck passed.

## 18. Gav validation

Session summary: **Full analysis available**. Six primary metrics plus GCT/Flight
are available; knee-flexion/asymmetry remain not computed with
`NO_ACTION_NEEDED`. Frequency remains **4.848484848484849 Hz**. Coach explanations
cite 9 contacts, 9 eligible intervals, 7 velocity windows, and verified crossing
frames 13/128. No recording guidance is issued for the complete primary result.

## 19. Vanni 240 validation

Session summary: **Full analysis available**. Frequency remains
**3.103448275862069 Hz**. Coach explanations cite 7 contacts, 4 eligible
intervals, 5 velocity windows, and verified crossing frames 59/567. No recording
guidance is issued. In particular, AVA does not blame recording technique for
the known MediaPipe small-athlete lower-limb capability limitation; the current
primary metrics are available and the explanation policy makes no unsupported
causal claim.

## 20. Vanni 120 validation

Session summary: **Full analysis available**. Frequency remains
**3.6206896551724137 Hz**. Coach explanations cite 8 contacts, 6 eligible
intervals, 6 velocity windows, and crossing frames 28/290. No recording guidance
is issued for the complete primary result.

## 21. Vanni 60 validation

Session summary: **Full analysis available**. Frequency remains
**4.385953327434329 Hz**. Coach explanations cite 10 contacts, 10 eligible
intervals, 8 velocity windows, and crossing frames 9/145. No recording guidance
is issued for the complete primary result.

## 22. Scientific replay check

All four real Phase 4.2K artifacts were replayed through `buildOverlayFrames`,
FPS normalization, unmodified `computeSprintMeasurements`, Phase 7.0 evidence,
and Phase 7.1 explanations. Scientific values/statuses were unchanged:

| Benchmark | Frequency | Zone Time | Peak Velocity |
|---|---:|---:|---:|
| Gav | 4.848484848484849 Hz | 1.92 s | 11.092149424565784 m/s |
| Vanni 240 | 3.103448275862069 Hz | 2.12 s | 9.591178790487021 m/s |
| Vanni 120 | 3.6206896551724137 Hz | 2.19 s | 9.416358925269277 m/s |
| Vanni 60 | 4.385953327434329 Hz | 2.40 s | 10.881288775005759 m/s |

## 23. Phase 7.1 acceptance table

| Criterion | Result |
|---|---|
| current messages audited | Pass |
| explicit audiences/object/full mapping | Pass |
| dependency/root-cause behavior | Pass |
| evidence-backed guidance | Pass |
| available and coverage explanations | Pass |
| Phase 7.0-derived summaries | Pass |
| metric-card integration | Pass |
| coach backend/developer inspector | Pass |
| no consumer availability confidence percentage | Pass |
| four real payloads reviewed | Pass |
| scientific outputs unchanged | Pass |
| required validation | Pass, with inherited `pose:sanity` alias limitation disclosed |
| roadmap honest | Pass |

## 24. Roadmap progress

Phase 7.1 is CLOSED and unweighted. Completion remains **29.5%**. Phase 6.2
remains IN PROGRESS solely for browser-playback validation.

## 25. Remaining limitations

- Legacy artifacts lack exact step/contact frame membership; explanations disclose
  rather than reconstruct it.
- The inspector prepares frame navigation but does not implement seeking.
- Coach payload exists, but the standalone persisted report does not yet ingest it.
- Browser interaction was not required; Phase 6.2 remains blocked as documented.
- Existing experimental/report confidence systems were not redesigned.
- The pre-existing `pose:sanity` alias failure and unrelated trailing blank line
  in `database.types.ts` remain untouched.

## 26. Git status and agent handoff provenance

No commit, push, database reset, or database mutation occurred. The worktree was
already heavily dirty; unrelated changes were preserved.

- **Prior architecture inherited:** Phase 7.0 evidence engine, trusted evaluator,
  metric card, overlay audience boundary, developer feature flags, and report UI.
- **Prior findings independently verified:** canonical reasons/contracts,
  audience separation, four production values, and existing message conflicts.
- **Findings corrected/disproved:** available developer explanations initially
  used failure fallback text during development; real-payload review caught and
  corrected it before closure. Session roots were also narrowed to primary metrics.
- **Code changed personally:** only files in Section 15.
- **Tests added personally:** the 24-check Phase 7.1 suite.
- **Real benchmarks run personally:** Gav, Vanni 240, Vanni 120, and Vanni 60
  production measurement/evidence/explanation replays.
- **Not personally validated:** browser interaction, report persistence changes,
  external ground truth, and source evidence absent from legacy artifacts.

## 27. Exact recommended Phase 7.2 scope

Add an optional versioned explanation/provenance snapshot to the analysis-report
load/build contract without changing metric eligibility. Render athlete-safe
unavailable reasons and coach evidence summaries in the persisted report, add
developer-only frame/time navigation from the existing payload, and validate
report round-trips plus four replay values byte-identically. Do not merge the
older report-confidence score with scientific metric availability.

## 28. Closure conclusions

1. Phase 7.1 is **CLOSED**.
2. Overall weighted roadmap completion remains **29.5%**.
3. Phase 6.2 remains **IN PROGRESS** solely because browser playback validation
   is still outstanding.
4. Athlete, coach, and developer explanations are deterministic and evidence-driven.
5. Canonical reason codes remain the single source of truth for explanation generation.
6. Recording guidance is generated only when directly supported by scientific evidence.
7. Root-cause consolidation prevents duplicated explanations across dependent metrics.
8. Available metrics can explain the evidence that produced them.
9. Partial-coverage messaging accurately reflects verified evidence without
   overstating coverage.
10. The developer evidence inspector remains feature-gated and separate from
    athlete-facing UI.
11. No consumer-facing confidence percentages were introduced.
12. Production replay frequencies remain exactly: Gav
    **4.848484848484849 Hz**, Vanni 240 **3.103448275862069 Hz**, Vanni 120
    **3.6206896551724137 Hz**, and Vanni 60 **4.385953327434329 Hz**.
13. The documented standalone `pose:sanity` TypeScript path-alias issue remains
    unrelated to Phase 7.1 and was not modified during closeout.
14. No unrelated outstanding issue was modified during closeout.
15. No commit, push, database reset, or database mutation was performed.
16. Phase 7.2 was not begun.
