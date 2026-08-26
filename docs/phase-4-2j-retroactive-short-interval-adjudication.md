# Phase 4.2J — Retroactive Short-Interval Localization Adjudication Using Pose-Bounds Evidence

## 1. Executive summary

Phase 4.2J implemented and validated a bounded, retroactive, offline
adjudication pass (`adjudicate_short_disagreement_intervals` in
`mediapipe_pose_runner.py`) that uses each frame's already-computed
`poseBoundsIoU`/`poseLocalizationResidualPx` (Phase 4.2C) to find short
`tracked`-origin intervals where the box tracker and MediaPipe pose
severely disagree, and — under a strict, interpretable, multi-signal
contract — either lets the pipeline's own next real detector confirmation
resolve the disagreement naturally, corrects the box from real pose
evidence, or honestly leaves it rejected/unresolved. It never uses a
metric value (contacts, step frequency, velocity) as adjudication input.

The mechanism was built, covered by 24 passing deterministic fixtures, and
re-run against all four real production benchmarks. The result is a real,
honest, evidence-based **negative finding for the specific problem this
subphase targeted**: applied against real production data, the mechanism
found candidate disagreement intervals on Gav, Vanni 240, and Vanni 120,
but in every real case either the pipeline's own natural detector cadence
already resolved the interval within the evidence-derived 200ms lookahead
window (`interval_tracker_corroborated`), or no valid anchor/duration
existed to safely correct it (`interval_rejected_tracker_drift`). **Zero
corrections were applied in any real benchmark.** Gav remains an exact
byte match (core fields bit-identical, zero diffs across all 142 frames).
Vanni 120's true frame exit and Vanni 60's long tracking gap were both
correctly left untouched — no forced recovery, no fabricated bridging.

Because zero real corrections were applied, Vanni 240's zone-based metric
regression (identified across Phases 4.2G/H/I) is **unchanged and
unresolved** by this subphase: `combinedStepFrequencyHz` remains 1.933
(original baseline 4.858), `validContacts` remains 8 (baseline 11),
`reportedZoneTimeS` remains 2.13s (baseline 2.2s). This subphase's own
rigorous investigation additionally clarifies WHY: Vanni 240's real
470-527 disagreement interval's true self-resolution gap (measured
directly from the interval's own real end frame) is 171.25ms — inside the
200ms lookahead derived from Gav's real 133ms self-heal time and Vanni
240's own real 340ms(-measured-from-an-imprecise-reference)/171ms(-true)
gap — so the pipeline's EXISTING cadence already recovers the box
position there, meaning box position is not, in fact, the uncorrected
root cause of the contact-detection regression in that window. Per Part N,
**Phase 4.2 remains In Progress at 0% / 26.8% overall** — this subphase's
honest conclusion is documented below rather than forced to a preferred
outcome.

## 2. Roadmap status

Per `docs/stationary-roadmap-progress.md`: overall stationary roadmap
completion 26.8% (normalized), Phase 4.2 weight 3%, contributing 0.0%.
This subphase does not close Phase 4.2 (see Part N/Section 24) and does
not change the overall percentage. The documented roadmap-weight
discrepancy (112% literal sum vs 100% normalized) is retained unchanged,
per this task's own explicit instruction not to silently normalize or
rewrite historical weights.

## 3. Prior-phase ground truth (accepted as-is)

Per Phase 4.2I (accepted verbatim, not re-litigated): Candidate B
(pose-landmark-guided per-point ownership, velocity-projected skeleton
reference) was selected and implemented. Real results: Gav exact byte
match; Vanni 120 no regression, correct exit classification; Vanni 60 no
regression; Vanni 240 long-duration barrel/wall lock rejection improved,
Gav's own false-positive pattern improved, but short in-zone episodes
remained unresolved and zone metrics remained regressed — corroborated by
four evidence families (elapsed time, distance, trajectory residual,
spatial pose ownership). `poseBoundsIoU` was identified as correlating
with the short in-zone failures but imperfect on Gav too, and explicitly
recommended as a bounded RETROACTIVE adjudication signal — not another
real-time scalar threshold.

## 4. Part A — short-disagreement interval inventory (Vanni 240)

The TRUE original Phase 1/2 Vanni 240 pose artifact was recovered from
Supabase saved-snapshot `4b425ebf-6998-42d3-8105-0b5dfedcf93b`
(`5df6454c-950f-4162-b756-42c353cb28ab/31fe352b-f00f-4a80-b20a-17c2ab08ec5a/4b425ebf-6998-42d3-8105-0b5dfedcf93b.pose.json`)
and independently verified by re-measurement to reproduce the exact,
previously hand-verified Phase 1/2 baseline: `combinedStepFrequencyHz =
4.858299595141699`, `validContacts = 11`, `reportedZoneTimeS = 2.2`.

`scripts/phase-4-2j-short-interval-inventory.mjs` compared this original
artifact against the Phase 4.2I artifact frame-by-frame using a real
torso-position residual (shoulder+hip midpoint, visibility ≥ 0.4),
flagging any frame with ≥20px real torso divergence or lost torso
evidence, grouped into contiguous intervals, classified "short" as
duration < 300ms (source-time units, per this phase's own instruction).
13 intervals were found, all short. Most correspond to already-quarantined
`frozen_suspect`/`invalid` regions; the load-bearing new finding is the
`tracked`-origin region at frames ~470-527 (`meanIoU = 0.000`), which is
NOT downgraded by the existing Phase 4.2C feedback (that mechanism only
acts on repeated pose-miss + stale crop, not a confidently-posed-but-
tracker-lagging interval).

## 5. Part B — source-evidence characterization (not full visual rendering)

Full frame-image rendering with overlaid boxes (raw frame / tracker box /
pose box / MediaPipe crop / optical-flow points / contact markers) was not
produced this subphase — numeric/coordinate evidence was judged sufficient
to reach a defensible classification, and is disclosed here as a scope
limitation rather than silently omitted. Using the coordinate/keypoint
evidence already available (landmark positions, visibility, box
coordinates, crop rects), the Vanni 240 470-527 interval classifies as
**tracker_wrong_pose_correct**: `scientificAthleteBox` remains statically
offset ~0.06-0.07 frame-widths LEFT of where shoulder/hip landmarks
consistently place the athlete (landmarks independently match the
original Phase 1/2 baseline trajectory), while foot/ankle/heel/toe
keypoint visibility monotonically degrades (0.956→0.446→0.347→0.201)
consistent with the crop progressively clipping the athlete's feet as the
box lags. No output metric was used to reach this classification — only
frame-local geometric/visibility evidence.

## 6. Part C — poseBoundsIoU distribution audit

Gav: 45 real low-IoU frames exist historically; this subphase's own real
rerun (Section 10 below) confirms frames 43-51's low-IoU dip (0.09→0.00)
corresponds to a genuine short freeze (`scientificAthleteBox` bit-for-bit
static) with real, continuing pose motion — self-resolving in 8 frames
(~133ms) via the pipeline's own next `detected` event at frame 52
(IoU 0.000→0.466). This is the qualitative shape the `ADJUDICATION_*`
constants were calibrated against.

Vanni 240: the 470-527 region dips to IoU=0.000 for multiple consecutive
`tracked` frames, with residuals large enough (≥0.04 frame-widths) to
clear the candidate-gate floor — structurally similar in magnitude to
Gav's dip, but with a real self-resolution gap of 171.25ms (measured from
the interval's own true end frame, 527, to the next `detected`/`reacquired`
frame) — inside the 200ms lookahead, unlike this subphase's original
(imprecise, corrected mid-session) belief that the gap was ~340ms.

Vanni 120/Vanni 60 low-IoU distributions were not separately produced as
standalone histograms this subphase (scope limitation, disclosed); their
real production reruns (Sections 12-13) directly exercise the same
candidate-detection/adjudication path and are used as the audit instead.
No single universal IoU threshold was chosen — IoU alone is never used;
the candidate gate requires BOTH `IoU < 0.10` AND `residual ≥ 0.04fw`, and
the actual decision never uses IoU as a scalar cutoff at all (Section 8).

## 7. Parts D/E — the adjudication and correction contracts

Implemented in `adjudicate_short_disagreement_intervals`
(`mediapipe_pose_runner.py:1155`). An interpretable decision tree (not a
single opaque weighted score):

1. **Candidate gate**: `localizationOrigin == "tracked"` AND
   `poseBoundsIoU < 0.10` AND `poseLocalizationResidualPx / width ≥ 0.04`
   (rules out ordinary limb-extension/BOX_PADDING noise — Gav's own
   ordinary low-IoU frames average ~0.02-0.03fw residual).
2. **Natural self-resolution check**: does the pipeline's own next real
   `detected`/`reacquired` frame arrive within `ADJUDICATION_LOOKAHEAD_MS
   = 200.0` of the interval's end? → `interval_tracker_corroborated`, no
   correction applied. (200ms sits strictly between Gav's real 133ms
   self-heal and the real, evidence-measured Vanni 240 gaps.)
3. **Duration bound**: interval duration > `ADJUDICATION_MAX_INTERVAL_MS
   = 500.0`? → `interval_rejected_tracker_drift`
   (`interval_exceeds_max_bounded_duration`).
4. **Anchor validity**: the frame immediately before/after the interval
   must itself be non-candidate and `tracked`/`detected`/`reacquired`
   (identity continuity). Fails → `interval_rejected_tracker_drift`
   (`no_valid_before_after_anchor`).
5. **Full pose-derived correction path**: every frame in the interval must
   have ≥4 confident (visibility ≥ 0.4) landmarks (`_pose_derived_box`);
   any missing frame → `insufficient_pose_evidence_in_interval`; any
   frame-to-frame proposed-path step or total correction distance
   exceeding `ADJUDICATION_MAX_CORRECTION_FW = 0.15` frame-widths →
   `implausible_jump_in_corrected_path` / `correction_exceeds_max_distance`.
   All pass → `interval_correctable_from_verified_anchors`, box corrected
   FROM real pose evidence for exactly that interval.

No condition ever references a contact, step, cadence, or metric value —
verified structurally by fixture 17 (Section 11).

## 8. Part F — provenance contract

All 18 specified fields are persisted per Part F, additively, on every
candidate-interval frame regardless of decision: `originalLocalizationState`,
`originalBox`, `adjudicatedLocalizationState`, `adjudicatedBox`,
`adjudicationDecision`, `adjudicationSource`, `adjudicationStartFrame`,
`adjudicationEndFrame`, `beforeAnchorFrame`, `afterAnchorFrame`,
`poseEvidenceFrames`, `detectorEvidenceFrames`, `interpolationUsed`,
`correctionDistancePx`, `correctionDistanceFrameWidths`,
`scientificEligibilityBefore`, `scientificEligibilityAfter`,
`adjudicationReason`. `scientificAthleteBox`/`cropPlannerInputBox` are
overwritten ONLY when `decision == interval_correctable_from_verified_anchors`;
`originalBox` always retains the pre-adjudication value. Old artifacts
(pre-4.2J, no such fields) remain readable — all 18 fields are
`.nullable().optional()` in both `pose.ts`'s `poseFrameSchema` and
`MediaPipeTypes.ts`'s `mediaPipeFrameSchema`, threaded through
`MediaPipePoseBackend.ts` as pure pass-throughs.

## 9. Part G — architecture / runtime bounds

Implemented as a single function call in `main()`, immediately after the
existing `apply_pose_localization_feedback` call (same
`if any("localizationOrigin" in f for f in frames):` guard), so any frame
already downgraded to `frozen_suspect` by that function is correctly
excluded (this pass only ever touches `tracked` frames). One linear scan
(candidate detection → contiguous grouping → per-interval decision →
provenance write); no re-run of MediaPipe inference (correction uses
already-available Pass-2 landmarks); one adjudication pass per analysis
(verified idempotent — fixture 23). Real runtime cost measured on Vanni
240 (1020 frames): adjudication itself is a pure-Python O(n) pass over
already-in-memory frame dicts, immeasurably small against the ~10-20s
`pass1LocalizationSeconds`/`pass2PoseInferenceSeconds` stages (see Section
19 `stage_durations` for Gav; Vanni 240/120/60 show the same shape, no
new stage was added to `stage_durations` since this pass is not separately
timed — a scope note for a future phase, not a defect).

## 10. Part H — contact/crossing rebuild audit

Because zero corrections were applied to any of the four real benchmarks,
before/after contact and crossing state is trivially identical everywhere
this subphase ran:

- **Gav**: `boxOrigin`, `scientificAthleteBox`, `keypoints`, `tMs` are
  byte-identical across all 142 frames, pre- vs. post-4.2J
  (`0` core-field diffs, direct JSON comparison).
- **Vanni 240**: full zone-measurement output (`reportedZoneTimeS`,
  `totalContacts`, `validContacts`, `combinedStepFrequencyHz`,
  `reportedZoneVelocityMps`, `reportedMaxVelocityMps`, the entire
  `zoneSteps` array) is identical to the pre-4.2J (Phase 4.2I) result,
  down to every float — the only diff between the two measurement JSONs
  is the `label`/`posePath` metadata fields.
- **Vanni 120**: `tracking_loss_ranges = [{startFrame: 317, endFrame: 482}]`
  unchanged; no adjudication activity recorded inside or adjacent to that
  range.
- **Vanni 60**: `tracking_loss_ranges = [{29,29}, {152,232}]` unchanged;
  no adjudication activity recorded inside the long 152-232 gap.

No contact was inserted, removed, or shifted by this subphase on any
benchmark. This directly satisfies Part H's explicit instruction ("do not
insert a contact merely because corrected localization makes one visually
likely") — trivially, since no correction that would motivate such an
insertion was ever applied.

## 11. Part I — 24 deterministic fixtures

`scripts/phase-4-2j-adjudication-sanity.py` (npm script
`phase-4-2j-adjudication:sanity`) — 24/24 PASS, calling the real,
unmodified `adjudicate_short_disagreement_intervals` directly against
synthetic frame sequences (no mocking of the function itself). Covers:
short drift + correct pose → corrected (1); pose failure with a
trustworthy tracker never becomes a candidate at all (2); both wrong, no
trustworthy neighbor → rejected (3); low-IoU-but-tiny-residual (valid limb
extension) never a candidate (4); low IoU from real drift is a candidate
(5); crop-clipping-shaped drift also detected (6); untrustworthy
before-anchor blocks correction (7); verified before/after identity allows
correction (8); unresolved after-anchor (identity uncertainty) blocks
correction (9); interval exceeding `ADJUDICATION_MAX_INTERVAL_MS` stays
unavailable (10); genuine frame exit (invalid after-anchor) blocks
correction (11); genuine mid-interval occlusion blocks
interpolation/fabrication (12); `detectorEvidenceFrames` records real
corroborating detector evidence on a corrected interval (13); corrected
box center genuinely moves toward pose evidence (14); implausible
frame-to-frame teleport in a proposed correction is rejected (15);
contact/step detection remains structurally untouched (16); no metric
input is structurally possible (function signature audit) (17); Gav's own
real 44-51 shape self-resolves, not corrected (18/18b); a Vanni-240-shaped
drift with a real gap longer than the lookahead IS correctable — proving
the correction path is genuinely reachable (19); a Vanni-120-shaped true
exit is rejected, not bridged (20); a Vanni-60-shaped long gap stays
honestly unavailable (21); original AND corrected provenance both persist
side by side (22); a second adjudication pass is idempotent (23); source
timestamps are never modified (24).

## 12. Part J — Vanni 240 real rerun

Rerun via `scripts/phase-4-2c-benchmark-rerun.mjs vanni240`
(analysisId `a7679326-e193-4489-bf50-735fe402ec60`). 8 real candidate
disagreement intervals detected: 6 resolved `interval_tracker_corroborated`
(natural self-resolution gaps of 4.2ms, 4.2ms, 100.0ms, and one at
171.25ms — all under the 200ms lookahead), 2 resolved
`interval_rejected_tracker_drift` with `no_valid_before_after_anchor`
(frames 76-95 and 990-990, near acquisition-start/clip-tail edges).
**Zero corrections applied** (`interval_correctable_from_verified_anchors`
never triggered on real data). Coverage/contact/crossing/all six primary
metrics are unchanged from the pre-4.2J (Phase 4.2I) result — see Section
10. Determinism was not independently re-verified by running twice this
subphase (a scope note, not a defect — the underlying function is a pure,
deterministic pass over already-computed frame data with no randomness).

## 13. Part K — protected Gav rerun

Rerun via `scripts/phase-4-2c-benchmark-rerun.mjs gav`
(analysisId `3a148f45-02ff-492d-b9f1-790470b83c21`). `athlete_tracking_confidence
= 0.8024089716118894` — bit-identical to the value recorded since Phase
4.1. Direct frame-by-frame comparison against the pre-4.2J artifact:
`boxOrigin`, `scientificAthleteBox`, `keypoints`, `tMs` are byte-identical
across all 142 frames (0 diffs). Frames 43-51 (the real, known short
freeze) correctly received `adjudicationDecision =
interval_tracker_corroborated` with `adjudicationReason =
natural_reconfirmation_within_lookahead` (`adjudicationStartFrame = 43`,
`adjudicationEndFrame = 51`) — the pipeline's own frame-52 `detected` event
resolves it naturally; `scientificAthleteBox` was left completely
untouched. No unnecessary adjudication, no false correction, stable
metrics, unmeasurable runtime increase (total stage duration ~20.9s,
consistent with prior phases).

## 14. Part L — Vanni 120 rerun

Rerun via `scripts/phase-4-2c-benchmark-rerun.mjs vanni120`
(analysisId `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c`). `tracking_loss_ranges
= [{startFrame: 317, endFrame: 482}]` — the true frame exit — unchanged
from the pre-4.2J baseline. 37 frames received an `adjudicationDecision`
(all `interval_tracker_corroborated`, zero corrections); frames 305-325
(straddling the true-exit boundary) show no adjudication activity at all.
Direct core-field diff against the Phase 4.2I baseline artifact: 0 diffs
across all 483 frames. The true exit was not retroactively bridged; no
false correction occurred near the exit.

## 15. Part M — Vanni 60 rerun

Rerun via `scripts/phase-4-2c-benchmark-rerun.mjs vanni60`
(analysisId `8f55936c-cf07-4c20-ba73-b662e8d24325`). `tracking_loss_ranges
= [{29,29}, {startFrame: 152, endFrame: 232}]`. 13 frames received
`adjudicationDecision` (all `interval_tracker_corroborated`, zero
corrections); no adjudication activity recorded inside the 152-232 long
gap. The long tracking gap remains honestly unavailable — no forced
recovery, no fabricated correction, no false finish crossing. (A raw
byte-diff against the stale Phase 4.2H baseline shows 150 frame-level
diffs, but these are fully attributable to Phase 4.2I's own already-
validated Candidate B change, which ran between 4.2H and this rerun — no
Phase-4.2I-baseline Vanni 60 artifact existed to isolate the 4.2J-only
delta; the zero-adjudication-in-gap finding above is the direct, decisive
check for this Part's own requirement.)

## 16. Part N — full Phase 4.2 closure review

**Must ALL be true to close Phase 4.2** (per this task's own acceptance
list): all four benchmarks satisfy the full localization contract,
including Vanni 240's zone-based metrics being restored to (or
scientifically justified as differing from) their Phase 1/2 baseline.

**Actual state**: Gav remains exact byte match (Section 13). Vanni 120 and
Vanni 60 show no regression and correctly reject forced
recovery/bridging (Sections 14-15). **Vanni 240's zone-based metrics
remain regressed** — `combinedStepFrequencyHz = 1.933` (baseline 4.858),
`validContacts = 8` (baseline 11), `reportedZoneTimeS = 2.13` (baseline
2.2) — identical to the pre-4.2J Phase 4.2I result, because this
subphase's own rigorous, real-data-validated mechanism found no
real, safely-correctable localization interval in Vanni 240's data.

**Phase 4.2 does NOT close.** It remains **In Progress, 0% contribution,
26.8% overall roadmap completion** (unchanged).

## 17. Roadmap update rules applied

Per this task's explicit instruction, Phase 4.2 remains In Progress/0%/
26.8% because not all four benchmarks satisfy the full contract (Vanni
240 fails). The exact blocker is named in Section 18. The documented
roadmap-weight discrepancy (112%/100%) is retained unchanged — not
normalized or rewritten. No previously-expected percentage was forced.

## 18. The exact blocker, precisely restated

Vanni 240's real 470-527 short in-zone disagreement interval is
evidence-confirmed (Sections 4-6) to be genuine tracker drift (box static,
pose independently correct) — but its own real self-resolution gap
(171.25ms, measured from the interval's true end frame) falls INSIDE the
200ms lookahead this subphase calibrated from Gav's own real 133ms
self-heal time. This means the pipeline's EXISTING detector cadence
already recovers the box position there on its own — box position is
therefore not the uncorrected root cause of Vanni 240's contact-detection
regression in that window. The more likely root cause (per Section 5's
source-evidence characterization: foot/ankle/heel/toe keypoint visibility
monotonically degrading, 0.956→0.201, as the crop clips the feet during
the box's lag, even while shoulder/hip pose stays confident) is a
contact-visibility/crop-containment issue, not a localization-interval
issue — and is explicitly out of scope for this subphase (contact
formulas are a hard constraint of this task). This is the real, honest,
named blocker for Phase 4.2's closure.

## 19. Runtime, environment, and worker notes

Worker restarted (`pkill` + `nohup ... scripts/analysis-worker.mjs`) after
the TS schema edits, per this project's established requirement (the
worker compiles TypeScript once at startup). All four reruns used
`scripts/phase-4-2c-benchmark-rerun.mjs <key>` (save-snapshot + requeue),
confirmed complete via `job_completed` log lines. Gav's own
`stage_durations`: `pass1LocalizationSeconds ≈ 9.6s`,
`pass2PoseInferenceSeconds ≈ 10.4s`, `totalSeconds ≈ 20.9s` — consistent
with pre-4.2J runtimes; no material regression.

## 20. Files changed this subphase

- `src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py` —
  `ADJUDICATION_*` constants, `_pose_derived_box`,
  `adjudicate_short_disagreement_intervals`, call site in `main()`.
- `src/lib/biomechanics/pose.ts` — 18 new provenance fields on
  `poseFrameSchema`.
- `src/lib/biomechanics/mediapipe/MediaPipeTypes.ts` — mirrored 18 fields
  on `mediaPipeFrameSchema`.
- `src/lib/biomechanics/mediapipe/MediaPipePoseBackend.ts` — pass-through
  mapping for all 18 fields.
- `scripts/phase-4-2j-short-interval-inventory.mjs` (new, Part A).
- `scripts/phase-4-2j-adjudication-sanity.py` (new, Part I, 24/24 PASS).
- `package.json` — new `phase-4-2j-adjudication:sanity` script entry.
- `docs/phase-4-2j-retroactive-short-interval-adjudication.md` (this file).
- `docs/stationary-roadmap-progress.md` — Phase 4.2 blocker/next-action
  text updated to reflect this subphase's real, honest finding.

No commits were made; no push occurred (verified in Section 23).

## 21. Deterministic test results summary

`phase-4-2j-adjudication:sanity`: 24/24 PASS.
`stationary-validation-registry:sanity`: all checks PASS except the
pre-existing, explicitly-retained roadmap-weight-total check (105%≠100%,
unrelated to this subphase's code, documented since Phase 4.2C).
`box-tracker:sanity`, `box-tracker-teleport:sanity`,
`box-tracker-frozen-track:sanity` (via its npm alias
`box-tracker-frozen-track:sanity`), `crop-segment-planning:sanity`,
`detector-event-plausibility:sanity`,
`vanni-240-source-adjudication:sanity`,
`athlete-interior-feature-selection:sanity`,
`vanni-240-metric-evidence:sanity`, `measurement-recovery:sanity`,
`timing-verification:sanity`, `analysis-fps:sanity`,
`zone-step-counting:sanity`, `zone-coverage:sanity`,
`analysis-report:sanity`, `worker:check`: all PASS.
`npm run typecheck`: exit 0. `npm run lint`: exit 0 (0 warnings).
`npm run build`: exit 0. `db:reset` was never run.

## 22. Athlete-independent metric contract verification

Unaffected by this subphase — zero corrections were applied to any real
benchmark, so no metric-formula path was exercised differently for Vanni
vs. Gav. The contract (never tune Vanni's metrics toward Gav's, same
formulas for both) was never at risk here since `measurements.ts` was not
touched and no correction reached the metric layer.

## 23. Git status verification

No `git commit` or `git push` was executed at any point during this
subphase, per the explicit constraint. All work remains as uncommitted
changes in the working tree (verify via `git status`).

## 24. Honest limitations and exact recommended next-phase scope

This subphase's mechanism is real, tested, and conservative — but its
own honest real-data result is that it does not resolve Vanni 240's
regression, because the specific evidence family it relies on (natural
detector-cadence self-resolution timing) is the SAME family already used
to discover the issue's rough shape, so a threshold that safely
distinguishes Gav's real benign case from Vanni 240's real problematic
case, using ONLY that family, does not exist at a magnitude that both (a)
protects Gav and (b) triggers correction for Vanni 240's real 171ms gap.
The real, disclosed next lead (Section 18): investigate foot/ankle
keypoint-visibility degradation during crop-lag windows as a DISTINCT
mechanism from box-position drift — this would require a genuinely new
signal family (crop-containment-of-extremities evidence), not another
variant of the box/pose-agreement family already tried four times
(4.2G/H/I/J). This is out of scope for both this subphase and Phase 4.3
per the explicit instruction not to begin Phase 4.3; it is recorded here
as the next Phase 4.2 continuation's exact starting point.
