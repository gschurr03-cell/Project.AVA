# Project AVA
## Metric Evidence Framework — Replacing the All-or-Nothing Spatial Gate (Day 98)

Status: Architectural change, implemented and tested. No tracking algorithm,
panning logic, or database schema was modified. Nothing was committed or
pushed. This document and its accompanying code changes remain uncommitted in
the working tree, as directed.

This is the direct implementation follow-up to
[`docs/day-97-stationary-measurement-recovery-audit.md`](day-97-stationary-measurement-recovery-audit.md),
whose central finding was that the production measurement engine already
computes real, well-corroborated values for Average/Peak Step Length and Peak
Velocity on the Vanni 240fps session, but a single whole-recording gate
(`spatialMetricEligibility === "withheld"`, triggered by `recordingMode ===
"athlete_tracking_lost"`) suppressed all of them together. That report
deliberately did not touch the gate and recommended a dedicated milestone
instead. This is that milestone.

---

## Part 1 — Eligibility architecture, before

Every spatial/velocity metric shared exactly one boolean:

```
recordingAssessment.recordingMode
        │
        ▼
classifyRecordingMode()              (src/lib/video/recordingMode.ts — UNCHANGED)
        │
        ▼
spatialMetricEligibility: "eligible" | "conditional" | "withheld"
        │
        ▼
metricTrustForRecording("spatial", assessment, calibrationAvailable)
        │  — returns "withheld" whenever spatialMetricEligibility === "withheld",
        │    OR recordingMode === "smooth_pan" (pending panning validation)
        ▼
spatialAvailable: boolean            (trustedMetrics.ts, ONE flag)
        │
        ├──► avgStrideLengthM   = spatialAvailable ? value : null
        ├──► peakStrideLengthM  = spatialAvailable ? value : null
        ├──► strideRetentionPct = spatialAvailable ? value : null
        ├──► topSpeedMps        = spatialAvailable ? value : null
        └──► avgVelocityMps     = spatialAvailable ? value : null
```

Two metrics sat outside this flag entirely, already independent:
`frequencyHz` (gated by its own `cadenceAvailable`, tracking-confidence only)
and `zoneTimeS` (gated purely by `timingProvenance.verified`). Everything
else lived or died as one unit. Consumption reached the UI through a second,
separate override: `PerformanceSummaryCard.tsx`'s `deriveSprintResultState`
took a `recordingMode` prop directly and forced the ENTIRE card to
`"unavailable"` — blanking even `frequencyHz`, which had already
independently cleared its own gate — whenever `recordingMode` was in
`UNRELIABLE_TRACKING_MODES`. So the coarseness existed at two separate
layers: once in `trustedMetrics.ts` (blocking 5 of 7 fields together) and
again in the UI component (blocking the remaining fields' *display* too).

---

## Part 2 — Metric evidence contracts, after

Every metric now has an independent contract, implemented in the new module
`src/lib/intelligence/metricEvidence.ts` (`evaluateMetricEvidence`). Each
entry below states the real, existing minimum the codebase already used
internally somewhere — none of these numbers were invented weaker or looser
than what already existed; the change is that they are now checked
*per-metric* rather than folded into one shared flag.

| Metric | Required evidence | Minimum evidence | Validation condition | Failure condition → reason | Camera-motion / panning gate |
|---|---|---|---|---|---|
| **Zone Time** | Verified start + finish torso-gate crossings | Both crossings bracketed, not extrapolated (`timingProvenance.verified`) | `MIN_VERIFIED_CROSSING_CONFIDENCE = 0.45` per crossing (unchanged, existing) | Either crossing missing/unverified → `start_crossing_unavailable` / `finish_crossing_unavailable` / `start_and_finish_crossings_unavailable` / `crossing_confidence_below_threshold` / `crossing_extrapolated_not_verified` | None — was already camera-motion-independent |
| **Average Velocity** | Verified Zone Time + zone distance scale | Same as Zone Time, plus a real `metersPerPixel` scale | Same crossing confidence floor | Same as Zone Time; else `calibration_required` | Yes — camera-motion-unsafe modes always withheld; `athlete_tracking_lost` relaxed only if camera confirmed stationary |
| **Peak Velocity** | ≥1 stride-velocity window (3 consecutive valid contacts, 2 strides apart) | `strideVelocityWindows.length >= 1` (existing internal minimum — the function already returned nothing below 3 contacts) | Tracking confidence ≥0.6 (existing "geometry" threshold, reused) | `insufficient_stride_evidence` / `athlete_tracking_unreliable` / `camera_motion_unreliable` / `calibration_required` | Yes, same as above |
| **Average Step Length** | ≥2 valid opposite-foot step intervals | `individualStepLengthsM.length >= 2` (matches `computePeakStrideLengthM`'s own existing internal floor) | Tracking confidence ≥0.6 | `insufficient_step_evidence` / `athlete_tracking_unreliable` / `camera_motion_unreliable` | Yes, same as above |
| **Peak Step Length** | Same as Average Step Length | Same (`computePeakStrideLengthM` already returns `null` below 2) | Same | Same | Yes, same as above |
| **Step Frequency** | Ground-contact events across the run | `cadenceAvailable`: tracking confidence ≥0.7 (existing, unchanged) | Existing "cadence" trust group, unmodified | `foot_events_unreliable` | **No** — never was gated by camera motion, unchanged |
| **Ground Contact Time** | Full contact+toe-off phase pairs, in zone | Non-null `groundContactCombinedMs` | Tracking confidence ≥0.6 | `insufficient_contact_evidence` / tracking/camera reasons | Yes |
| **Flight Time** | Full flight-interval pairs, in zone | Non-null `flightCombinedMs` | Tracking confidence ≥0.6 | Same as Ground Contact Time | Yes |
| **Joint Angles** (`peakKneeFlexionDeg`) | Not computed by the current live measurement engine for any session type | — | — | `not_computed_by_current_pipeline` | N/A |
| **Asymmetry** (`asymmetryPct`) | Not computed by the current live measurement engine | — | — | `not_computed_by_current_pipeline` | N/A |

Every metric also reports a **confidence category** (`"high" | "medium" |
"low"`) — internal-only metadata, never a second availability gate, per this
task's explicit design: availability and confidence are reported as separate
fields, not confidence-gated-availability. Step-length confidence reuses the
engine's own existing coefficient-of-variation classifier
(`stepLengthConfidence`); velocity confidence reuses the existing
method-agreement spread (`velocitySpreadPct`, the same 15%/30% bands already
used for the existing "methods disagree" warning); timing confidence uses
the existing `timingStatus` tri-state (`verified` / `provisionally_verified`
— the Day 96 continuity-evidence refinement); ground-contact/flight
confidence is based on contributing contact count.

### The panning-safety boundary (unchanged, load-bearing)

Camera-motion-driven classifications — `smooth_pan`, `unstable_pan`,
`pan_with_zoom`, `excessive_camera_motion`, `unsupported_recording` — remain
**unconditionally** blanket-withheld for every scale-dependent metric,
exactly as before. `classifyRecordingMode` itself was not touched. The new
per-metric evaluation only ever applies to the `athlete_tracking_lost` case
(an *athlete* tracking problem, not a *camera* motion problem — it fires for
stationary cameras too, as the Vanni session proves), and only when the
caller can affirmatively prove — via the coach-confirmed
`calibration_gates.cameraType`, never inferred — that the camera itself was
`"stationary"`. Omitting that signal (every pre-Day-98 call site still does)
or passing `"panning"` falls back to the exact original conservative
behavior with zero change. This is defense-in-depth by construction: a
camera-motion-unsafe `recordingMode` wins even over an explicit
`"stationary"` claim, and an unconfirmed camera type never gets the relaxed
path even when `recordingMode` is merely `athlete_tracking_lost`.

---

## Part 3 — Implementation

`evaluateMetricEvidence(measurements, recordingAssessment, options)` is the
new single source of truth: given a `SprintMeasurements` object (already
computed by the untouched `computeSprintMeasurements`) plus the recording's
camera-motion assessment plus the coach-confirmed camera type, it returns one
`MetricEvidence` record per metric — `{ metric, status, value, unit,
reasonCode, confidenceCategory, provenance }`. It never fabricates a value:
every branch either copies a real number the measurement engine already
computed, or returns `null` with a real reason.

`buildTrustedMetrics` (`src/lib/intelligence/trustedMetrics.ts`) is now a
thin adapter over `evaluateMetricEvidence` — same public shape (`TrustedMetrics`)
and same call signature for every existing caller (the new third `options`
argument is optional), plus one addition: `TrustedMetrics.evidence`, the full
per-metric array, so any consumer can show *why* a specific field is null
without a second lookup. This means every existing consumer of
`TrustedMetrics` — the Sprint Metrics card, the limiting-factor diagnosis
(`src/lib/limitingFactors/loadContext.ts`), Performance Potential — benefits
from the more precise per-metric gating automatically, not just the one card
this task's Part 5 focused on.

`PerformanceSummaryCard.tsx`'s `deriveSprintResultState` lost its
`recordingMode` parameter entirely: recordingMode-driven withholding now
happens upstream, per metric, before a value ever reaches this function. It
is now purely `f(coreMetricsAvailableCount, zoneTimeS availability)` —
simpler, and correctly delegating all evidence judgment to the layer that
actually has the evidence.

---

## Part 4 — Evidence provenance

Every `MetricEvidence` record carries a permanent `provenance` object:

```ts
interface MetricProvenance {
  sourceWindows: Array<{ startContactIndex: number; endContactIndex: number }> | null;
  contactCount: number | null;
  verifiedStrideCount: number | null;
  calibrationSource: string | null;      // e.g. "manual_confirmed"
  timingSource: "world_anchored" | "screen_fixed_interpolated" | null;
  requiredCrossings: Array<"start" | "finish"> | null;
  crossingsVerified: Array<"start" | "finish"> | null;
  evidenceQuality: "high" | "medium" | "low" | null;
}
```

For Peak Velocity this includes the exact contact-index windows the value
was derived from (e.g. contacts 0→2, 1→3, 2→4 for Vanni); for step length it
includes the real count of valid opposite-foot intervals used; for timing
metrics it includes which of the two gate crossings were actually verified.
This is real, derived data — not descriptive text — read directly off the
same `SprintMeasurements` fields Parts 1–4 of the Day 97 audit already
verified by hand. Section 3g of `scripts/measurement-recovery-sanity.mjs`
asserts this provenance is populated, not a stub.

---

## Part 5 — UI behavior

`PerformanceSummaryCard.tsx` now renders each of the five MVP metrics from
its own `trusted.evidence` entry. A metric with a value shows the value; a
metric without one shows `"Unavailable"` plus its humanized reason — never a
bare `"—"`, and never a value borrowed from a state that doesn't apply to it.
One metric's missing evidence never hides a metric that has its own:

```
Average Step Length        Peak Step Length         Peak Velocity
2.03 m                     2.03 m                    10.10 m/s

Average Velocity
Unavailable
Reason: Verified start crossing unavailable.
```

The headline title (`"Verified Performance"` / `"Partial Results"` /
`"Analysis unavailable"`) is unchanged in its three-state shape, but is now
driven purely by how many of the five already-independently-resolved metrics
came back non-null — not by a separate recordingMode override. A session
with real evidence for 3 of 5 metrics (Vanni, under this framework) now
renders `"Partial Results"` with three real numbers and two honest reasons,
instead of `"Analysis unavailable"` with nothing at all.

---

## Part 6 — Regression protection (the four real completed sessions)

Of the four sessions the Day 97 audit identified as having a real, completed
analysis, two (`f284fb85…`, `f7026ec9…`) are `analysis_type = "acceleration"`
and never reach `PerformanceSummaryCard`/`buildTrustedMetrics` at all —
`page.tsx` only renders that card for `analysis_type === "fly"` sessions.
They are **entirely unaffected** by this change, which was independently
confirmed by inspecting `page.tsx`'s render condition, not merely assumed.

The two `fly` sessions were run through the real, unmodified
`computeSprintMeasurements` and the new `evaluateMetricEvidence` directly
against their real pose artifacts and real `calibration_gates`:

**`227ae200…` (Vanni, 240fps):**

| Metric | Before | After |
|---|---|---|
| Average Step Length | unavailable | **available, 2.033m** |
| Peak Step Length | unavailable | **available, 2.033m** |
| Peak Velocity | unavailable | **available, 10.096 m/s** |
| Step Frequency | available, 4.863Hz | available, 4.863Hz (unchanged) |
| Average Velocity | unavailable | unavailable — `start_crossing_unavailable` (unchanged, genuine) |
| Result state | `"unavailable"` (blanked entirely) | `"partial"` — 3 real numbers shown |

**`26d7492b…` (untitled, 120fps fly):** also `athlete_tracking_lost` /
`withheld`, also `calibration_gates.cameraType: "stationary"` /
`manual_confirmed`. Real evidence here is thin — only 3 total contacts, only
2 valid opposite-foot intervals (`0.797m`, `5.598m` — a physically
inconsistent pair) — and the framework's own honesty machinery correctly
flags this: `stepLengthConfidence: "low"`. The ≥2-interval minimum is met
(it is literally the minimum the codebase's own `computePeakStrideLengthM`
already required), so `avgStrideLengthM`/`peakStrideLengthM` do become
"available" with a `"low"` internal confidence category, alongside
`topSpeedMps` (8.357 m/s, from a single stride-velocity window) and
`frequencyHz` (2.636Hz). `avgVelocityMps`/`zoneTimeS` correctly stay
unavailable (`start_and_finish_crossings_unavailable`). This is a genuine,
disclosed edge case — see Part 10.

Every regression check above (plus 12 synthetic edge cases: missing start
crossing only, missing finish crossing only, zero contacts, exactly 1 valid
step interval, provisionally-verified timing, and — most importantly — five
separate camera-motion-unsafe `recordingMode` values each proving the
panning-safety boundary is unconditionally preserved even when
`calibrationCameraType` falsely claims `"stationary"`) is now a permanent,
deterministic check in `scripts/measurement-recovery-sanity.mjs` (61/61
passing).

---

## Part 7 — Scientific validation matrix

| Metric | Evidence required | Evidence present (Vanni 240fps) | Available | Reason |
|---|---|---|---|---|
| Zone Time | Verified start + finish crossing | Finish only (30/30 continuity); start never observed (athlete off-camera before the true crossing) | No | `start_crossing_unavailable` |
| Average Velocity | Zone Time + scale | Same as Zone Time | No | `start_crossing_unavailable` |
| Peak Velocity | ≥1 stride-velocity window | 3 windows, agreeing within ~4% | **Yes** | — |
| Average Step Length | ≥2 valid intervals | 4 valid intervals | **Yes** | — |
| Peak Step Length | ≥2 valid intervals | 4 valid intervals (peak = avg at exactly N=4) | **Yes** | — |
| Step Frequency | Tracking confidence ≥0.7 | 0.9566 | **Yes** | — |
| Ground Contact Time | ≥1 full contact/toe-off phase | 5 valid contacts, sparse per-side (2–3) | **Yes** (low internal confidence) | — |
| Flight Time | ≥1 full flight interval | Same | **Yes** (low internal confidence) | — |
| Joint Angles | Not computed by this pipeline | — | No | `not_computed_by_current_pipeline` |
| Asymmetry | Not computed by this pipeline | — | No | `not_computed_by_current_pipeline` |

| Metric | Evidence required | Evidence present (120fps fly) | Available | Reason |
|---|---|---|---|---|
| Zone Time / Average Velocity | Verified crossings | Neither crossing observed | No | `start_and_finish_crossings_unavailable` |
| Peak Velocity | ≥1 stride window | 1 window (3 contacts) | **Yes** (low confidence — single window) | — |
| Average / Peak Step Length | ≥2 valid intervals | 2 valid intervals, physically inconsistent (0.80m, 5.60m) | **Yes** (`stepLengthConfidence: "low"`, disclosed) | — |
| Step Frequency | Tracking ≥0.7 | 0.975 | **Yes** | — |

No threshold was loosened to produce either row of this table — both are the
real, direct output of `evaluateMetricEvidence` run against real pose
artifacts and real calibration, with zero synthetic substitution.

---

## Part 8 — Files changed

- **New**: `src/lib/intelligence/metricEvidence.ts` — the evidence framework.
- **New**: `docs/day-98-metric-evidence-framework.md` — this document.
- **Modified**: `src/lib/intelligence/trustedMetrics.ts` — delegates to
  `evaluateMetricEvidence`; added `TrustedMetrics.evidence`; new optional
  3rd `options` parameter (backward compatible).
- **Modified**: `src/app/sessions/[id]/PerformanceSummaryCard.tsx` — renders
  each metric from its own evidence; `deriveSprintResultState` no longer
  takes `recordingMode`.
- **Modified**: `src/app/sessions/[id]/page.tsx` — passes
  `calibrationCameraType`/`calibrationSource` into `buildTrustedMetrics`;
  drops the now-unused `recordingMode` prop from the `PerformanceSummaryCard`
  call site.
- **Modified**: `scripts/timing-verification-sanity.mjs` — updated test #10
  for the new `deriveSprintResultState` signature; removed the one assertion
  that specifically tested the now-intentionally-replaced behavior.
- **Modified**: `scripts/stride-metrics-sanity.mjs` — its `buildTrustedMetrics`
  fixture needed a real `individualStepLengthsM` array (evidence-count) to
  keep exercising the peak-vs-average selection logic under the new gate.
- **Modified**: `scripts/measurement-recovery-sanity.mjs` — extended with
  the Day 98 sections described in Parts 6–7 above (61 total checks).

## Part 9 — Database changes

None. Every database access this task performed was a read-only `SELECT`
against the local dev Postgres instance (confirming `calibration_gates`,
`analyses.keypoints_path`, and the sessions inventory already established by
the Day 97 audit).

## Part 10 — Remaining limitations

- **`stepLengthConfidence: "low"` is available, not withheld.** Per this
  task's explicit design (availability and confidence are separate, reported
  fields — Part 3: "Each metric reports available / unavailable / reason /
  confidence category"), a metric that clears its evidence-count minimum is
  "available" even when its internal confidence is low, as the 120fps
  session's inconsistent 0.80m/5.60m step pair shows. This is a real,
  disclosed tension: the framework does exactly what was specified, but a
  future decision may be warranted on whether "low" confidence should ever
  additionally gate availability (not evidence count) for step length and
  velocity specifically — that would be a deliberate threshold decision, not
  something this task's scope authorized unilaterally.
- **Ground Contact Time / Flight Time have real evidence contracts now but
  are still not shown in the MVP UI.** That is a separate, pre-existing
  product-scope decision (`PerformanceSummaryCard`'s own "MVP locked scope"
  comment, predating this task) which this task did not revisit.
- **Joint Angles and Asymmetry are honestly declared but not computed.**
  Recovering them is new metric computation, explicitly out of this task's
  scope ("the goal is not to produce more metrics").
- **The `contact:calibration` / `step:calibration` / `benchmark:stationary:sanity`
  sanity scripts remain broken**, for reasons identified in the Day 97 audit
  (missing `artifacts/pose-sequences/test.pose.json`) and one newly found
  this session (`benchmark:stationary:sanity` references a hardcoded session
  id, `76efcf70-9602-4a7a-be1f-ba5814c3c700`, that does not exist in the
  local dev database) — none of these three are related to this task's
  changes and none were patched with fabricated data.
- **Acceleration-mode metrics were not audited.** As in Day 97, this remains
  a second, independent computation path (`src/lib/acceleration/metrics.ts`)
  that has not received this level of scrutiny.

## Part 11 — Git status

Working tree only; no commits made this session. This task added 2 new
files (`src/lib/intelligence/metricEvidence.ts`, this document) and modified
6 existing files (`trustedMetrics.ts`, `PerformanceSummaryCard.tsx`,
`page.tsx`, and three sanity scripts). All prior uncommitted Day 96/97 work
remains exactly as it was; nothing was reverted or amended.
