# Phase 4.2D — Segment-Aware Crop Planning (Vanni 240 Crop-Planning Regression Repair)

## 1. Executive summary

Phase 4.2C left Phase 4.2 blocked on a real, evidence-confirmed regression: after
Phase 4.2B's frozen-track protections went live, `vanni_fly_240`'s crop planning
degraded (new tracking-loss gaps, confidence drift, stride-frequency drift), even
though the protected `gav_stationary_reference` benchmark stayed byte-identical and
`vanni_fly_120` was both fixed and cheaper to run. Phase 4.2D's mandate was to repair
crop planning — not revert the frozen-track protections, not hardcode Vanni 240, not
tune to the old metric values — and to re-run the full Phase 4.2 acceptance contract
across all four benchmarks.

**What was done**: `plan_crops()`'s single whole-clip linear trend fit was replaced
with a segment-aware design that partitions the clip into independent trusted
segments and fits/smooths each locally. Building and debugging a deterministic,
synthetic fixture for this design (Part 10) surfaced two further real bugs — a
seed-anchored freeze-detection displacement check in `box_tracker.py` that went
permanently stale after genuine pre-freeze motion, and two Gav-regressing side
effects of the first segment-aware implementation attempt (routine `detected`
refreshes wrongly fragmenting segments; loss of the original clip-edge
extrapolation behavior) — all fixed and re-verified against the protected Gav
benchmark before being accepted.

**Result**: Gav is exactly byte-identical to its original, always-protected
baseline. Vanni 120 is exactly byte-identical to Phase 4.2C's corrected baseline.
Vanni 240 is substantially improved and stable (no longer non-deterministically
drifting), and its whole-clip global-fit failure mode is mathematically proven fixed
— but its final metrics do **not** exactly match the Phase 1/2 hand-verified
baseline, and the difference has not been independently proven correct against
ground truth (only mechanistically explained). Per this phase's own acceptance rule,
**Phase 4.2 remains In Progress and contributes 0% to the roadmap**, unchanged at
**26.8%**. See Section 24/25 for the full acceptance tables and Section 26 for the
exact recommended next scope.

## 2. Roadmap status (before and after this phase)

- **Before Phase 4.2D**: 26.8% overall, Phase 4.2 (weight 3%, normalized) at 0.0%,
  blocked on the Vanni 240 regression (per `docs/phase-4-2c-crop-provenance-and-benchmark-validation.md`).
- **After Phase 4.2D**: unchanged, **26.8%**, Phase 4.2 still at 0.0%. The regression
  that blocked Phase 4.2C is fixed (Vanni 240 no longer regresses relative to Phase
  4.2C's own broken state, and its crop-planning failure mode is fixed and proven),
  but Phase 4.2's own full acceptance contract requires Vanni 240 to either match or
  be scientifically justified against the **Phase 1/2** baseline specifically — not
  merely to stop regressing further — and that bar is not yet met. Per this phase's
  explicit instruction: **no partial weighted credit is invented** for this subpart.

## 3. Vanni 240 regression timeline

| Point in time | `athleteTrackingConfidence` | `tracking_loss_ranges` | `strideFrequencyHz` |
|---|---|---|---|
| Phase 1/2 (hand-verified baseline) | 0.9055 | `[{668,1019}]` | 5.93 |
| Phase 4.2C (post frozen-track wiring, regressed) | 0.8677 | (new gaps from frame 126) | 4.95 |
| Phase 4.2D, segment-aware fit only (mid-session) | 0.9055-ish / 0.906 | gap 483→525, 126-255 still open | improved, not final |
| Phase 4.2D, + rolling-window freeze fix | 0.8677 (start) → 0.867 | `[{149,174},{180,183},{525,1019}]` | ~5.56 |
| Phase 4.2D, final (all fixes, Gav re-verified) | **0.8668850002139353** | **`[{149,174},{180,183},{525,1019}]`** | **5.56** |

The mechanism differs materially between the Phase 4.2C regression and the Phase
4.2D final state: the 4.2C regression was the whole-clip trend fit reacting to
excluded segments (an unintended side effect with no evidentiary basis). The 4.2D
final state's difference from the Phase 1/2 baseline is instead a **direct
consequence of a second, independently-justified bug fix** (the rolling-window
freeze-detection fix in `box_tracker.py`) surfacing real evidence of a freeze that
box_tracker's own prior seed-anchored logic could never detect once genuine
pre-freeze motion had occurred. See Section 5.

## 4. Existing `plan_crops()` architecture (pre-Phase-4.2D audit)

The prior design (`mediapipe_pose_runner.py`, pre-4.2D):

1. Collect all non-`None` boxes across the **entire clip** (`frozen_suspect`,
   `invalid`, and never-detected frames already excluded upstream by Phase 4.2C).
2. Fit **one** ordinary-least-squares line (`_lin_fit`) through `cx`, `cy`, `w`, `h`
   independently, using **every** valid frame index in the whole clip as the
   regressor.
3. Fill every `None` frame — whether a 2-frame internal gap or a 500-frame excluded
   span — with that **single global line's** value at that index.
4. Apply **one** whole-clip centered moving average (`_moving_avg`, window
   `ROI_SMOOTH_WINDOW` = 3) across the entire filled track.
5. Bound frame-to-frame center/size change (`MAX_CENTER_STEP_FRAC` /
   `MAX_SIDE_CHANGE_FRAC`) and clamp to frame bounds.

This design has no concept of a "segment": every valid frame anywhere in the clip —
approach, fly-zone cruise, post-finish deceleration, and any excluded span in
between — is collapsed into one regression. It was designed under an implicit
assumption that violates the constant-velocity premise the moment a large, uneven
fraction of the clip is legitimately excluded: two motion regimes with different
slopes will "vote" against each other in the same fit, distorting the line even in
regions with perfectly good local evidence of their own. This did not surface as a
problem before Phase 4.2B because exclusion rates were low; Phase 4.2B's
`frozen_suspect` gating pushed `vanni_fly_240`'s exclusion rate to ~48%, exposing it.

## 5. Whole-clip fit failure — mathematical proof

Proven directly (not asserted) via the deterministic fixture
(`scripts/crop-segment-planning-sanity.py`, checks 2/2b/2c), using synthetic data
built to the same *shape* as the real regression:

- Segment 1 ("approach"): 60 frames, `cx` increasing exactly 5px/frame (residual 0
  against its own local fit — the data is exactly linear by construction).
- Segment 3 ("fly-zone"): 140 frames, `cx` **decreasing** exactly 4px/frame.
- A single whole-clip least-squares fit through the union of both:
  - Residual sum of squares against each **segment's own** local fit: **0.0**
    (exact — the segments are individually perfect lines).
  - Residual sum of squares of the **one global fit** against the same real data:
    **> 1,000,000** (measured: ~9.4M in the concrete fixture run).
  - The two segments' true slopes disagree even in **sign** (+5 vs -4) — a failure
    mode no single straight line can represent at all, regardless of weighting.

This is a direct, reproducible demonstration that a whole-clip linear model is
mathematically incapable of representing two genuinely different real motion
regimes at once, and that fitting one anyway produces a large, avoidable residual —
exactly the mechanism that measurably distorted `vanni_fly_240`'s crop in regions
that had perfectly good local evidence of their own.

## 6. Crop evidence classes

| Class | Examples (`boxOrigin`) | May anchor segment center/size | May influence a segment's local trend | May be interpolated through (short gap) | May create scientific pose evidence | Max age before segment reset | Weight in local fit | Provenance |
|---|---|---|---|---|---|---|---|---|
| **A — Verified anchor** | `detected`, `reacquired`, `tracked` (post identity/teleport/freeze checks) | Yes | Yes | N/A (is the evidence) | Yes (subject to existing pose-gating) | N/A | 1.0 (OLS) | `boxOrigin` + `trackState` |
| **B — Provisional guidance (bridged)** | interpolated point strictly between two Class-A points inside one segment, gap ≤ `MAX_BRIDGE_GAP_MS` | No (never a fit input) | No | Yes | No | bounded by `MAX_BRIDGE_GAP_MS` (200ms) | 0 (not fit) | derived, not persisted per-frame |
| **C — Excluded** | `frozen_suspect`, `invalid`, `predicted` (stale), never-detected, or any gap `> MAX_BRIDGE_GAP_MS` | No | No | No — held flat at nearest Class-A edge, never fabricated | No | segment boundary itself | 0 | excluded upstream (Phase 4.2C) or by segmentation |

Class A is exactly `boxes[i] is not None` at the point `plan_crops()` receives it —
Phase 4.2C's own upstream gating already excludes `frozen_suspect`/`invalid`/
never-detected before this phase's code ever sees them. Class B/C is a Phase 4.2D
distinction that did not exist in the prior design (which treated every gap
identically, and every valid box as global-fit-eligible regardless of distance from
other valid boxes).

## 7. Segment-aware design

Implemented in `mediapipe_pose_runner.py`:

- `MAX_BRIDGE_GAP_MS = 200.0` — matches the existing `FREEZE_MIN_SUSPECT_MS`/
  `POSE_MISS_SUSPECT_MS` precedent from Phase 4.2B/4.2C; converted to frames via
  `max(1, round(MAX_BRIDGE_GAP_MS / 1000.0 * fps))`.
- `_partition_crop_segments(boxes, origins, max_bridge_gap_frames)` — splits the
  valid-box indices into contiguous segments. A new segment starts when the gap to
  the next valid box exceeds the bridge threshold, **or** the next valid box is a
  genuine identity-verified reacquisition (`boxOrigin == "reacquired"` — a real
  loss-then-recovery event, box_tracker's own signal; explicitly **not**
  `"detected"`, which fires routinely on a healthy, never-lost track's periodic
  refresh cadence and must not fragment it — see Section 8's Gav investigation).
- `_segment_local_track(boxes, segments, n)` — fits each segment's own `(cx, cy, w,
  h)` independently via `_lin_fit`, using only that segment's own data. Internal
  gaps between two segments are held **flat** at the nearest segment's nearest real
  edge value (Class C: bounded, not fabricated). The clip's own leading edge
  (before the first segment) and trailing edge (after the last) **extrapolate**
  from that boundary segment's own local trend — preserving the original design's
  load-bearing intent ("the far end before MediaPipe could see the small athlete
  extrapolate the centre + size from the linear trend"), now scoped to a local
  rather than global fit.
- `_segment_aware_moving_avg(track, seg_id, window)` — the same centered moving
  average as before, restricted so its window never mixes two different segments'
  own frames.
- `plan_crops(..., origins=None)` — signature extended with an optional `origins`
  parameter (backward compatible; omitting it falls back to gap-size-only
  segmentation). Call site passes `crop_origins = [rec.boxOrigin for rec in
  box_track_records]`.

## 8. Temporal causality and offline use

This pipeline runs **offline** (a completed video, not a live stream), so a full
non-causal (forward+backward) pass across the whole clip is architecturally
available — the prior whole-clip design used exactly that. Phase 4.2D deliberately
keeps offline-appropriate **local** non-causality (each segment's own fit uses all
of that segment's own frames, both before and after any given frame within it) while
eliminating **cross-segment** non-causality (a segment's fit never uses another
segment's frames, and post-finish trailing frames never reach backward into earlier
segments — proven directly in Section 10).

The one edge case investigated and *not* changed: the centered moving-average
smoothing step's window can include exactly one adjacent frame from the clip's own
extrapolated leading/trailing edge when smoothing the outermost real frame of the
first/last segment (bounded to `ROI_SMOOTH_WINDOW // 2` = 1 frame, never
propagating further). A real attempt to close even this last bounded gap was made,
verified via the fixture, and then **reverted** after it shifted the protected Gav
benchmark's metrics away from its established baseline (see `_segment_aware_moving_
avg`'s own docstring in the source for the full account, and Section 15 below). This
pre-existing characteristic predates Phase 4.2D — the prior whole-clip design's own
single moving average had the identical property at the clip's one global boundary
— and is retained rather than "fixed" at the cost of an unexplained Gav shift, per
this phase's explicit hard constraint.

## 9. Gap and reacquisition contract

- **Short gap** (≤ `MAX_BRIDGE_GAP_MS`, both endpoints in the same segment):
  bridged via that segment's own local linear fit (Class B, provisional — never a
  fit input itself, never persisted as scientific evidence).
- **Long gap** (> `MAX_BRIDGE_GAP_MS`): starts a new segment; the intervening frames
  are held flat at the nearest real edge (Class C) rather than interpolated —
  proven by fixture checks 4/4b/4c/4d (a bounded 2-value step, never a fabricated
  ramp between two unrelated motion regimes).
- **Reacquisition** (`boxOrigin == "reacquired"`): always starts a new segment, even
  if the gap itself would have been bridgeable — resets the local trend/smoothing
  model on genuinely fresh, post-loss evidence rather than quietly carrying a
  pre-loss trend across it (fixture checks 1/1d).
- **Routine `detected` refresh** on an otherwise continuous, never-lost track: does
  **not** start a new segment (fixture check 1b; this was the actual root cause of
  a real Gav regression found and fixed mid-phase — see Section 15).

## 10. Reacquisition behavior and post-finish exclusion

Fixture checks 3/3b prove an isolated, wildly implausible single-frame detection
(simulating a spurious mis-detection deep inside an excluded span) forms its own
one-point segment and is **byte-identical** in its effect on both real trusted
segments' planned crops whether present or absent. Fixture checks 8/8b prove
deleting an entire clip's worth of post-finish trailing frames leaves the
segmentation and every earlier frame's trend-fit-derived crop unchanged, and the
only measurable effect anywhere is bounded to at most `ROI_SMOOTH_WINDOW // 2`
frames at the very trailing edge (see Section 8) — never propagating into the
fly-zone or approach segments.

## 11. Crop stability measurements

Bounded-step limiter (`MAX_CENTER_STEP_FRAC = 0.35`, `MAX_SIDE_CHANGE_FRAC = 0.12`,
both pre-existing from Phase 4.2/Day 96 and unmodified this phase) continues to
bound frame-to-frame center and size change relative to the previous frame's own
side length. Containment (the real, non-excluded box always remains inside its
planned crop) is directly proven for both real segments in the fixture (check 11)
and by the pre-existing `athlete-tracker-sanity.py`/`box-tracker-sanity.py` suites
(re-run clean, see Section 20). No new lag was introduced: segment-local fits are
computed from the same underlying per-frame data the whole-clip fit used, just
scoped more narrowly; the smoothing window width (`ROI_SMOOTH_WINDOW = 3`) and the
step-limiter constants are unchanged from the pre-4.2D design.

## 12. Files changed

- `src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py` — `plan_crops()`
  replaced with the segment-aware design; new `MAX_BRIDGE_GAP_MS`,
  `_partition_crop_segments`, `_segment_local_track`, `_segment_aware_moving_avg`;
  call site updated to pass `origins=crop_origins`.
- `src/lib/biomechanics/mediapipe/runtime/box_tracker.py` — new
  `ROLLING_DISPLACEMENT_WINDOW_MS = 250.0`, `self._recent_positions`,
  `_note_recent_position`, `_rolling_net_displacement_fw`; the tracked branch's
  `net_displacement_fw` now uses the rolling window instead of the seed-anchored
  distance (see Section 13). `spread_growth_ratio` (still seed-anchored) is
  unchanged.
- `scripts/crop-segment-planning-sanity.py` — new, 24-check deterministic,
  synthetic fixture (Part 10).
- `scripts/phase-4-2d-fetch-analysis.mjs` — new, small read-only helper used to
  pull `athlete_tracking_confidence`/`tracking_loss_ranges`/`metrics`/origin
  distribution for a given analysis ID from the live database + pose-artifact
  storage, for this phase's own real-rerun reporting.

## 13. The rolling-window freeze-detection fix

While validating the segment-aware `plan_crops()` alone against a real
`vanni_fly_240` rerun, a persistent gap (frames 126-255) remained even though the
whole-clip-fit distortion was fixed. Direct inspection of the real pose artifact's
`scientificAthleteBox` field showed box_tracker's own box was genuinely frozen from
frame ~65 onward (x pinned at ~0.0900) while `featureSpreadGrowthRatio` reached
2.87-3.5x — well over the 1.8x suspicion threshold — yet `freezeSuspect` never
fired. Root cause: the freeze-suspicion "net displacement" signal compared the
current tracked position to `self._seed_center`, fixed at the last flow-point
reseed (frame 10). The athlete had genuinely moved ~77px (0.0404 normalized) from
frame 10 to frame 65 **before** the freeze began — permanently exceeding the 0.02fw
threshold for that seed's remaining lifetime, so the freeze signal could never fire
again no matter how long the freeze lasted afterward.

**Fixed**: replaced the seed-anchored displacement check with a rolling 250ms
window (`ROLLING_DISPLACEMENT_WINDOW_MS`) comparing the current position against
the oldest position still in that window (`_rolling_net_displacement_fw`),
verified via an isolated synthetic test to preserve the original design's
confirmation-timing behavior when the raw signal fires continuously. This is a
general fix to a real, previously-uncaught freeze-detection gap — not something
tuned to Vanni 240's specific numbers, and it is why Vanni 240's final `frozen_
suspect` count (578/1020 frames) is substantially larger than Phase 4.2C's own
(which never triggered this code path correctly for this clip at all).

## 14. Vanni 120 regression rerun

Real production rerun (`node --env-file=.env.local scripts/phase-4-2c-benchmark-rerun.mjs vanni120`),
analysis `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c`:

- `athlete_tracking_confidence`: **0.9171411404253191** — exact byte match to
  Phase 4.2C's corrected baseline.
- `tracking_loss_ranges`: **`[{317,482}]`** — exact match (the frame-215 incident
  still correctly caught, now starting detection at frame 232 per Phase 4.2C).
- `strideFrequencyHz`: **5.01** — exact match.
- `originsCount`: `invalid=8, detected=22, tracked=367, frozen_suspect=86` (frame
  count 483).

No regression. Vanni 120's Phase 4.2B/4.2C correction is fully retained.

## 15. Protected Gav rerun ("no unexplained regression is acceptable")

Gav was re-run after **every** code change this phase, per this task's own explicit
rule. Three real deviations were found and investigated to root cause before being
accepted or reverted — none were waved away:

1. **First segment-aware `plan_crops()` alone**: `athlete_tracking_confidence`
   shifted `0.8024089716118894` → `0.7862786633478067`, `strideFrequencyHz` `4.4` →
   `4.48`. Investigated: `boxOrigin` distribution unchanged (`invalid=7,
   detected=12, tracked=123`), ruling out a freeze-detection false positive.
   Root-caused to `_segment_local_track` holding the clip's own leading/trailing
   edges **flat** instead of extrapolating (an unintended behavior change beyond
   this phase's actual mandate — internal gaps, not clip edges). **Fixed**: added
   `_extrapolate` to restore the original edge-extrapolation design intent, scoped
   to each boundary segment's own local trend. Re-ran Gav: **exact byte match**
   restored (`0.8024089716118894` / `[]` / `4.4`).
2. **Reacquisition-boundary condition** (`origins[cur] in ("detected",
   "reacquired")`): suspected as a contributing cause, tested independently — fixed
   to `"reacquired"` only, re-ran Gav, **no change** (proving this was not, by
   itself, the cause of deviation #1; both fixes were needed together to fully
   restore byte-identity once both were combined with the edge-extrapolation fix).
3. **Post-finish causality fix** (Section 8): a real attempt to close the last
   remaining bounded look-ahead property found by the deterministic fixture (window
   clipped to each segment's own real span) shifted Gav again
   (`0.7964159439425603` / `4.48`). Root-caused to the fix being too broad — it
   also narrowed the moving-average window at every ordinary internal segment
   boundary, not just the clip's own two true edges, and Gav's own track is
   periodically re-fragmented into fresh segments by routine detector-cadence
   refreshes. **Reverted** to a version that would only restrict the clip's own two
   true edges; even that narrower version still moved Gav, because Gav's own real
   segmentation structure interacts with the narrower restriction in the same way.
   Reverted entirely rather than accept an unexplained Gav shift; the fixture's own
   Property 8 assertion was corrected to test the true, bounded (not zero) nature of
   this pre-existing edge effect instead (see Section 8).

**Final state**: real production rerun, analysis `3a148f45-02ff-492d-b9f1-790470b83c21`:
`athlete_tracking_confidence` **0.8024089716118894**, `tracking_loss_ranges`
**`[]`**, `strideFrequencyHz` **4.4**, `originsCount` `invalid=7, detected=12,
tracked=123` — **exact byte match** to Gav's original, always-protected baseline.
No regression.

## 16. Vanni 60 rerun (regression behavior only, not solved)

Real production rerun, analysis `8f55936c-cf07-4c20-ba73-b662e8d24325`:
`athlete_tracking_confidence` **0.9123913445997682**, `tracking_loss_ranges`
**`[{29,29},{154,159},{161,232}]`**, `strideFrequencyHz` **4.07**, `originsCount`
`invalid=6, detected=11, tracked=196, frozen_suspect=19, reacquired=1` (frame count
233). No hand-verified Phase 1/2 baseline exists for Vanni 60 to regress against.
Per this phase's explicit instruction ("do not solve its broader late-run loss
here"), this result is reported as-is and not further investigated this phase.

## 17. Cross-benchmark results table

| Benchmark | `athlete_tracking_confidence` | `tracking_loss_ranges` | `strideFrequencyHz` | Detector-origin frames | `frozen_suspect` frames | vs. established baseline |
|---|---|---|---|---|---|---|
| **Gav** (protected) | 0.8024089716118894 | `[]` | 4.4 | 12 | 0 | **Exact byte match** |
| **Vanni 120** | 0.9171411404253191 | `[{317,482}]` | 5.01 | 22 | 86 | **Exact byte match** (Phase 4.2C baseline) |
| **Vanni 240** | 0.8668850002139353 | `[{149,174},{180,183},{525,1019}]` | 5.56 | 16 | 578 | Improved vs. 4.2C regression; **does not exactly match** Phase 1/2 baseline (0.9055 / `[{668,1019}]` / 5.93) |
| **Vanni 60** | 0.9123913445997682 | `[{29,29},{154,159},{161,232}]` | 4.07 | 11 | 19 | No baseline to compare against; not investigated further (in-scope deferral) |

## 18. Detector-cost retention

Vanni 120's detector-origin frame count (22 of 483, plus the `reacquired` events
counted separately in Phase 4.2C's own accounting) remains consistent with Phase
4.2C's measured, validated cost reduction — no code touched this phase changes
detector-invocation cadence logic in `box_tracker.py` itself (only the freeze
displacement signal and the crop-planning trend fit were changed). The Phase 4.2C
detector-cost reduction is retained by construction, not re-derived from scratch.

## 19. Tests and exact outcomes

New this phase:

- `scripts/crop-segment-planning-sanity.py` — **24/24 PASS** (deterministic,
  synthetic Vanni-240-shaped fixture; Part 10's 8 required elements, Part 3's
  mathematical proof, Part 5/8/9's segment/gap/causality contract).

Re-run, all pre-existing (no regressions):

| Suite | Result |
|---|---|
| `athlete-tracker:sanity` | ALL PASSED |
| `box-tracker:sanity` | ALL PASSED |
| `box-tracker-teleport:sanity` | ALL PASSED |
| `box-tracker-frozen-track:sanity` | ALL PASSED |
| `box-tracker-crop-provenance:sanity` | ALL PASSED |
| `stationary-validation-registry:sanity` | 1 pre-existing, disclosed failure ("roadmap phase weights total exactly 100%, got 105%") — documented at the top of `docs/stationary-roadmap-progress.md` since before this phase; not caused by this phase |
| `vanni-240-metric-evidence:sanity` | ALL PASSED |
| `measurement-recovery:sanity` | ALL PASSED |
| `timing-verification:sanity` | ALL PASSED |
| `analysis-fps:sanity` | passed |
| `zone-step-counting:sanity` | 25/25 |
| `zone-coverage:sanity` | ALL PASSED |
| `analysis-report:sanity` | ok |
| `worker:check` | `worker_configuration_valid` |
| `lint` (`eslint src --max-warnings=0`) | clean, 0 warnings |
| `typecheck` (`tsc --noEmit`) | clean |
| `build` (`next build`) | succeeded |

## 20. Phase 4.2D acceptance table

| # | Criterion | Result |
|---|---|---|
| 1 | Regression reconstructed | Empirically reconstructed via real evidence during debugging (Section 3, 13); formal frame-by-frame table not separately produced beyond the timeline in Section 3 |
| 2 | Whole-clip fit failure mathematically proven | **Met** — Section 5, fixture checks 2/2b/2c |
| 3 | Localization states assigned explicit crop-planning eligibility | **Met** — Section 6 (Class A/B/C table) |
| 4 | Crop planning becomes segment-aware | **Met** — Section 7 |
| 5 | Suspect/rejected points cannot distort trusted segments | **Met** — fixture checks 3/3b |
| 6 | Short/long gaps handled differently and honestly | **Met** — fixture checks 4/4b/4c/4d/5 |
| 7 | Post-finish cannot influence pre-finish | **Substantially met** — trend/segmentation has zero look-ahead (fixture check 8); smoothing has a bounded, pre-existing, documented 1-frame edge effect deliberately not "fixed" to protect Gav (Section 8, 15) |
| 8 | Crop lag/containment measured and bounded | **Met** — Section 11 |
| 9 | Vanni 240 returns to Phase 1/2 verified outputs OR difference is scientifically justified | **Not fully met** — mechanistically explained (Section 13), not independently proven against ground truth |
| 10 | Vanni 120 retains correction | **Met** — Section 14 |
| 11 | Gav does not regress | **Met** — Section 15 |
| 12 | Vanni 60 does not regress | **N/A / deferred** — no baseline exists (Section 16) |
| 13 | Detector-cost gains remain | **Met** — Section 18 |
| 14 | Provenance complete | **Met** — unchanged from Phase 4.2C, `origins` threading is additive |
| 15 | All tests pass | **Met**, with 1 pre-existing disclosed failure unrelated to this phase (Section 19) |
| 16 | Roadmap updated honestly | **Met** — Section 25 |

## 21. Full Phase 4.2 acceptance table (re-evaluated after Phase 4.2D)

| # | Criterion | Result |
|---|---|---|
| 1 | Vanni 120 corrected | **Met** |
| 2 | Vanni 240 regression resolved | **Partially met** — no longer regressing arbitrarily; does not exactly match Phase 1/2; difference explained but not proven |
| 3 | Gav non-regressed | **Met** |
| 4 | Vanni 60 non-regressed | **N/A** (no baseline) |
| 5 | Crop provenance complete | **Met** |
| 6 | Pose feedback bounded | **Met** (unchanged from Phase 4.2C) |
| 7 | Detector cost measured/safe | **Met** |
| 8 | No unsupported localization creates scientific evidence | **Met** |
| 9 | All benchmark reruns and tests pass | **Met**, with the one pre-existing disclosed failure |

**Overall determination**: because criterion 2 is not fully met, **Phase 4.2 remains
In Progress**. Per the explicit, non-negotiable rule this phase operated under, no
partial weighted credit is invented for this subpart — Phase 4.2 continues to
contribute **0%** to the roadmap.

## 22. Roadmap progress before/after

**Before**: 26.8% (Phase 4.2 at 0.0%, blocked on the Vanni 240 regression).
**After**: **26.8%**, unchanged. Phase 4.2 remains at 0.0%.

## 23. Remaining limitations

- Vanni 240's stride-frequency and confidence difference from its Phase 1/2
  baseline (5.56 vs 5.93 Hz; 0.867 vs 0.9055) is real, reproducible, and
  mechanistically explained by a second, independently-justified bug fix (Section
  13) — but has not been independently validated against the source video or any
  ground truth beyond the box_tracker's own internal signals. It is plausible this
  represents genuinely new, previously-undetected evidence (as Vanni 120's
  frame-215 incident once was), and equally plausible the rolling-window threshold
  is somewhat over-sensitive for this specific clip. Neither has been proven.
- Vanni 60 has no hand-verified baseline; its current behavior (detector
  invocations, gap pattern, stride frequency) is reported but not validated as
  correct or incorrect.
- The bounded, single-frame moving-average edge effect described in Section 8/15 is
  disclosed, not eliminated.
- Part 1 (formal frame-by-frame regression reconstruction) and Part 15's table exist
  in this document at a level derived from real evidence gathered during debugging,
  not as an exhaustive separately-generated frame-by-frame artifact.

## 24. Git status

No commits or pushes were made this phase. All changes remain in the uncommitted
working tree (file edits only): `src/lib/biomechanics/mediapipe/runtime/
mediapipe_pose_runner.py`, `src/lib/biomechanics/mediapipe/runtime/box_tracker.py`,
new `scripts/crop-segment-planning-sanity.py`, new `scripts/phase-4-2d-fetch-
analysis.mjs`, this report, and the roadmap update (Section 25). Verified via `git
status`/`git log` before finishing.

## 25. Roadmap update

See `docs/stationary-roadmap-progress.md`'s Phase 4.2 section, updated in the same
change set as this report to add a fourth subphase entry (Phase 4.2D) documenting
this work, keep **Status: In Progress**, keep **Completed weight (normalized):
0.0%**, and keep overall roadmap completion at **26.8%**.

## 26. Exact recommended Phase 4.2E scope (not Phase 4.3)

Per this phase's own instruction ("do not begin Phase 4.3"), the concrete next step
is a Phase 4.2E continuation, not a new phase:

1. Independently validate whether Vanni 240's newly-flagged `frozen_suspect` span
   (578/1020 frames, mostly frames 149-183 and 525-1019) represents genuine
   box-tracker freezes by cross-referencing against the source video directly
   (frame-by-frame visual review, not just internal signals) — the same standard
   Vanni 120's frame-215 incident was eventually held to.
2. If confirmed genuine: formally document Vanni 240's new lower stride frequency
   (5.56 Hz) as the corrected, more honest measurement, superseding the Phase 1/2
   baseline (5.93 Hz) which predates the rolling-window freeze fix and likely never
   caught this freeze at all — then Phase 4.2 can be marked complete.
3. If found to be a false-positive (over-sensitive rolling-window threshold for
   this specific clip): tune `ROLLING_DISPLACEMENT_WINDOW_MS` or the underlying
   freeze thresholds against **general** freeze-detection accuracy criteria — never
   against Vanni 240's specific metric target — and re-validate all four benchmarks
   again.
4. Only after (2) or (3) resolves cleanly: mark Phase 4.2 complete and update the
   roadmap to reflect its 3% (normalized) weighted contribution.
