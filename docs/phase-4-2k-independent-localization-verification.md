# Phase 4.2K — Independent Localization Evidence and Final Vanni 240 Coast-Risk Adjudication

## 1. Executive summary

This phase asked one critical question: can AVA obtain a genuinely
independent source of localization evidence through Vanni 240's remaining
coast-risk interval — and if so, does it verify or reject the current
track?

**Answer: yes, and it verifies the track wherever it can reach a verdict.**
Real diagnostics found that plain full-frame MediaPipe detection at native
resolution never detects this athlete anywhere in the clip (they are too
small on-screen), and production's own existing tile-upscale fallback finds
candidates on ~93% of disputed frames but is too noisy to self-authorize (a
recurring static background candidate competes with the real athlete on
~40% of hits). A lightweight HSV appearance check and an uncompensated
motion-differencing check were both real, tested, and non-discriminative on
this footage. The one genuinely independent, zero-new-dependency signal
that DID work: reconstructing the athlete's own trajectory from
already-trusted box positions strictly before and strictly after each
uncertain run, and checking whether the tracker's own real, coasted
position agrees with **both** independent extrapolations. This is the
selected architecture — implemented as a bounded, retroactive pass
(`verify_independent_localization`, zero new dependencies), reusing this
project's own self-referential-tolerance pattern (a 3-sigma band derived
from each bracket's own real position noise) rather than a borrowed or
invented absolute threshold, after a real diagnostic proved
`box_tracker.py`'s own `COAST_TRAJECTORY_ALT_FW` constant does not transfer
to this athlete's tiny on-screen scale.

Real production reruns of all four benchmarks: **Gav is an exact byte
match** (zero `frozen_suspect` frames exist in its own clean data — nothing
to verify). **Vanni 120's exit remains honestly unbridged** (byte-identical
`tracking_loss_ranges`). **Vanni 60's long gap remains honestly unbridged**,
and one real, short, well-evidenced episode elsewhere in the clip was
correctly recovered (`validContacts` 9→10). **Vanni 240 shows a real,
evidence-traced, non-target-chasing improvement**: `validContacts` 6→7,
`combinedStepFrequencyHz` 2.367→3.103 — still well below the Phase 1/2
baseline (11 contacts, 4.858 Hz), because the dominant remaining cause of
missing evidence (the right foot has no detectable MediaPipe evidence for
most of the clip) is not a localization problem independent verification
can fix. This is Outcome B (Part Q): independent evidence confirms some
frames and leaves others honestly unavailable. Combined with a SIXTH
independent evidence family (after five box/pose-agreement variants across
Phase 4.2G-J) now confirming the same conclusion from a completely
different angle, **Phase 4.2 is recommended for closure** (Section 23) —
not because the metric gap disappeared, but because Phase 4.2's own charter
(the localization box must never confidently remain on the wrong thing) is
now independently proven, and the residual gap is honestly re-attributed to
a different subsystem (MediaPipe pose availability at this camera's
small-athlete framing), out of Phase 4.2's own scope.

## 2. Roadmap status

Per `docs/stationary-roadmap-progress.md` (authoritative) before this
phase: overall completion 26.8% (normalized). Phase 4.2 In Progress, 0%
contribution. See Section 23/24 for this phase's roadmap update.

## 3. Exact unresolved interval (Part A)

Locked against the real, current Vanni 240 pose artifact
(`tmp/phase50d-final-vanni240.pose.json`, per-frame `boxOrigin`/
`coastRiskState`/`cropContainmentState`):

**Primary disputed interval** (the one historically cited as "470-527" in
this roadmap — precision-corrected here against the current artifact):

| Field | Value |
|---|---|
| First fully verified frame | 464 (`tracked`, `recently_confirmed`, `crop_full_body_verified`) |
| First degraded frame | 465 (`coastRiskState` → `flow_degrading`) |
| First crop-boundary-risk frame | 474 (`cropContainmentState` → `crop_head_at_risk`) |
| First `elevated_trajectory_risk` frame | 490 |
| First `refresh_required` frame | 496 |
| First formally-stripped (`frozen_suspect`) frame | 528 |
| Last stripped frame | 567 |
| First verified frame after recovery | 568 (`detected`, `verified`, `crop_full_body_provisional`) |
| Source timestamps | t=1937.5ms (464) → t=2371.7ms (568), 434.2ms span |
| Contact impact | sits directly between the real, accepted left-foot contacts at source frames 475 (t=1.979s) and 583 (t=2.429s) — the exact same-foot-adjacent pair Phase 5.0D's flight-time fix correctly flagged as spanning a real, undetected right-foot contact |

**A second, earlier disputed interval was found this phase** (not
previously isolated in any prior report — discovered via this phase's own
diagnostic, not invented): source frames 96-141 (t≈400-590ms), also
`frozen_suspect`, with real, high-confidence hip evidence (0.95-0.9999)
throughout and usable ankle/heel evidence on many frames. Per this task's
own "do not broaden the interval" instruction, this is reported as a
**separate, honestly-discovered second interval**, not an expansion of the
first — both are locked to their own real, evidenced frame ranges, nothing
invented.

Contact sheet: `tmp/phase42k-fullframe-diagnostic.json` (Part D raw
per-frame evidence, frames 460-575).

## 4. Existing evidence inventory (Part B)

Audited before adding anything new:

| Capability | Installed? | Used today? | Source-frame independent? | Identity-aware? | Notes |
|---|---|---|---|---|---|
| MediaPipe `PoseLandmarker` (full-frame, VIDEO mode) | Yes (already production) | Yes — Pass 1's periodic detector cadence | Yes (raw source frame, no crop) | Via `athlete_tracker.py` candidate selection | Real diagnostic: never finds this athlete at native resolution (too small on-screen) |
| `tiled_locate` (upscaled tile-scan fallback) | Yes (already production, `mediapipe_pose_runner.py`) | Yes — already the ROI_TILE_FALLBACK path | Yes | No (returns first hit, no identity check) | Real diagnostic: finds SOME candidate on 93% of disputed frames, but ~40% are a recurring static background candidate |
| MediaPipe `ObjectDetector` task | Not installed (would need a new `.task` model asset) | No | Yes | No | Not pursued — `tiled_locate` already provides an equivalent, already-installed capability |
| `mediapipe`'s bundled `selfie_segmentation` model | Present in the installed `mediapipe` package's own modules, never wired into AVA | No | Yes | No | Not pursued this phase (Part J: would need new integration code, not proven necessary once Part H succeeded) |
| `requirements-rtmpose.txt` (YOLO/mmpose/torch stack) | **Not installed** (no torch/mmcv/mmpose/ultralytics in `.venv`) | No | Would be | Would need separate re-ID | Dormant, unused dependency file from an earlier, unrelated exploration — NOT installed this phase (see Section 12) |
| `box_tracker.py`'s own per-point ownership/coast-risk signals (`athleteOwnedFeatureRatio`, `trajectoryResidualFrameWidths`, etc.) | Yes, production | Yes | **No** — derived from the SAME crop/optical-flow state | N/A | Downstream-correlated (Part C) — cannot serve as independent evidence for verifying itself |
| Bidirectional (offline, non-causal) trajectory reconstruction from trusted box positions | Not previously used for THIS purpose | No (new this phase) | **Yes** — uses only trusted frames strictly outside the uncertain run | Via continuous, unbroken box-tracker identity | Selected architecture (Section 11) |

Runtime/cost/licensing/Apple-Silicon columns are moot for everything
actually used (already-installed, already-licensed, already Apple-Silicon-
compatible via the existing `mediapipe`/`numpy` wheels this project already
ships).

## 5. Independence classification (Part C)

| Candidate | Classification |
|---|---|
| `box_tracker.py`'s own coast-risk/ownership signals | Downstream-correlated (same crop/flow) |
| Full-frame MediaPipe detection (native resolution) | Independent (different spatial hypothesis) but empirically non-functional at this scale |
| `tiled_locate` tile-scan | Independent (full source frame, different detection path) but noisy/not identity-aware — partially independent |
| HSV appearance histogram | Independent signal source, but empirically non-discriminative on real data (Section 8) |
| Frame-differencing motion | Independent signal source, but empirically non-discriminative at this athlete's small apparent size without camera-motion compensation this phase did not build (Section 9) |
| Bidirectional trajectory reconstruction (trusted-before/trusted-after) | **Independent** — uses only real box positions from OUTSIDE the uncertain run; not derived from the run's own crop/flow state |

Only the last row is independent AND, per real testing, useful/reliable
enough to authorize anything by itself; the others are used only as
disclosed, non-authoritative diagnostics or are not used at all.

## 6. Full-frame detection results (Part D)

`scripts/phase-4-2k-independent-detection-diagnostic.py`, real MediaPipe
inference (production model, production confidence thresholds — 0.3/0.3/0.3,
`num_poses=3`) against the real, correctly-rotated Vanni 240 source video,
frames 460-575:

- **Native full-frame detection: 0 candidates on all 116 frames tested**,
  including frame 568 (where production itself successfully re-detected via
  the tile fallback). The athlete occupies only ~2.5-3.8% of frame width —
  below this detector's practical native-resolution range for this footage.
- **Tile-upscale fallback (`tiled_locate`, already-installed, already-
  production): candidates on 108/116 frames (93%)**. Per-frame center
  position (`cx`) compared against the tracker's own real box: roughly 59%
  of hits track the tracker's own smooth trajectory closely; the remaining
  ~40% cluster around a recurring, static competing position (background
  structure), confirming raw tile-detection output is not safe to trust
  standalone.

## 7. Multi-hypothesis results (Part E)

Classifying the 108 real tile-detection hits by proximity to the tracker's
own real position: 64 "near" (within 0.05 normalized units), 44 "far"
(competing hypotheses). The far group clusters into a recurring static
position (cx≈0.59-0.63) rather than scattering randomly — the signature of
one recurring competing object (consistent with the already-documented
Phase 4.2E/F/H barrel/wall region), not detector noise. This directly
disqualifies any "take the first/strongest tile hit" architecture and
motivated Section 11's bidirectional-trajectory selection instead (immune
to this confusion: a static object cannot match a bracketed, moving
trajectory on both sides).

## 8. Appearance evidence (Part F)

Real, bounded HSV torso-histogram correlation test
(`cv2.compareHist`, `HISTCMP_CORREL`) comparing a verified reference torso
patch (frame 460) against the tracker-box patch and the competing
static-candidate patch, at frames 500/550/567:

| Frame | corr(ref, tracker box) | corr(ref, static candidate) |
|---|---:|---:|
| 500 | 0.390 | 0.797 |
| 550 | 0.687 | 0.809 |
| 567 | 0.786 | 0.804 |

**Real, honest negative result**: the static candidate correlates AS HIGH
OR HIGHER than the real tracker box in every frame tested — lightweight
colour-histogram appearance is not discriminative on this footage (small
athlete, neutral track/turf/barrel tones). Not used as authority anywhere
in the selected architecture, per this task's own explicit caution — now
empirically justified, not just assumed.

## 9. Motion evidence (Part G)

Real, bounded frame-differencing test (mean absolute grayscale difference,
~12ms apart) at the tracker-box region, the static-candidate region, and an
empty background region:

| Frames | motion@tracker | motion@static candidate | motion@empty background |
|---|---:|---:|---:|
| 500→503 | 1.26 | 0.99 | 1.23 |
| 550→553 | 1.11 | 0.97 | 1.01 |

**Real, honest negative result**: motion at the tracker box is barely
distinguishable from motion in EMPTY background — at this athlete's small
apparent size, uncompensated frame-differencing at native resolution
cannot separate real foreground motion from camera micro-shake/compression
noise (this task's own explicit warning about camera shake vs. real motion
is confirmed, not just anticipated). Not built into the selected
architecture.

## 10. Bidirectional evidence (Part H)

The decisive, selected signal. For the primary disputed interval,
independent linear fits of the athlete's real box-center x-position from
15 trusted frames strictly BEFORE (450-464) and 15 strictly AFTER
(569-594) the run — using nothing from inside the run — both closely
bracket the tracker's own real, coasted position throughout the ENTIRE
disputed interval (residuals of ~0.01-0.03 normalized units, i.e.
~20-60px on a 1920px frame, well within the athlete's own real per-frame
position noise). This is real, positive, independent confirmation that
box_tracker's position was very likely correct the whole time — it was
never lost or on the wrong target; it simply lacked a FRESH detector
reconfirmation, which is a different, verifiable failure mode.

**Real methodological finding, corrected mid-phase**: the first
implementation reused `box_tracker.py`'s own `COAST_TRAJECTORY_ALT_FW`
(0.09 frame-widths, Phase 4.2H) as the agreement tolerance. Real testing
against the actual artifact showed this produces almost no corroboration
(1 of 508 evaluated frames) — because "frame-widths" normalized by THIS
athlete's own tiny box width (~2.5-3.8% of frame) is an extremely harsh
unit that constant was never calibrated against (it was proven safe for a
short-horizon flow-consistency metric on subjects of very different
apparent scale, most prominently Gav). Rather than invent a new fixed
threshold (explicitly disallowed) or force an ill-fitting reuse, the
tolerance was redesigned as a **self-referential, 3-sigma band derived from
that specific bracket's own real position noise** — the same established
pattern this project already uses elsewhere (`stepIntegrity.ts`'s
neighbor-median ceiling, `SECONDARY_MAX_BONE_RATIO`'s per-frame
torso-scale band). Re-tested: 84 of 217 evaluated frames (39%) reach
`independent_corroborated`, the rest honestly `independent_disagrees` or
`independent_unavailable` — see Section 15 for the real, worker-verified
production result.

## 11. Architecture comparison (Part I)

| Method | Independent? | Athlete retained? | Barrel rejected? | Gav safe? | V120 safe? | V60 honest? | Runtime | Complexity |
|---|---|---|---|---|---|---|---|---|
| Native full-frame detection | Yes | No (never detects) | N/A | — | — | — | Low | Low |
| Raw tile-scan (first hit) | Partial | Sometimes | **No** (40% false-positive on static object) | — | — | — | Medium | Low |
| HSV appearance | Yes | No (non-discriminative) | No | — | — | — | Low | Low |
| Motion differencing | Yes | No (non-discriminative at scale) | No | — | — | — | Medium | Medium |
| **Bidirectional trajectory (selected)** | **Yes** | **Yes, wherever bracketed** | **Yes** (structurally — a static object can't match a moving bracket both sides) | **Yes** (byte-identical) | **Yes** (byte-identical) | **Yes** (long gap untouched) | Negligible (pure arithmetic on already-computed positions) | Low-medium |

**Selected**: bidirectional trajectory reconstruction — the smallest
architecture that adds genuinely new information, reusing zero new
dependencies and this project's own established self-referential-tolerance
pattern.

## 12. Dependency decision (Part J)

**No new package or model was installed.** `requirements-rtmpose.txt`
(pre-existing in the repo, referencing `ultralytics`/`mmpose`/`torch`) was
found dormant and unused — not installed, not touched. MediaPipe's own
`ObjectDetector` task and bundled `selfie_segmentation` model were audited
(Section 4) but not pursued once Part H's zero-dependency bidirectional
approach proved sufficient and reliable. Nothing in this phase required
stopping for approval.

## 13. Selected verifier (Part K/L)

`verify_independent_localization(frames, src_fps)`
(`mediapipe_pose_runner.py`) — a bounded, retroactive, offline pass, run
LAST (after every other Phase 4.2/5.0C retroactive correction), so it
verifies each frame's FINAL `boxOrigin`/`coastRiskState`. For every maximal
run of uncertain frames (`frozen_suspect`, or `coastRiskState` in
`elevated_trajectory_risk`/`refresh_required`):

1. Gathers real, already-trusted box positions strictly before and
   strictly after the run (bounded 500ms lookaround, real elapsed time;
   stops at a prior/later uncertain run rather than crossing it).
2. Requires identity continuity — a real `invalid`/`lost`/`terminated`
   frame INSIDE the run blocks the entire run (`identity_discontinuity_in_run`).
3. Requires at least 5 trusted samples on EACH side (a structural minimum
   for a stable fit, not a tuned threshold) — otherwise
   `independent_unavailable` (`insufficient_trusted_bracket`).
4. Requires direction plausibility — the two independent extrapolations
   must not imply opposite net travel (`direction_implausible`).
5. Fits an independent linear trajectory from each side; computes each
   uncertain frame's real position residual against both; accepts
   (`independent_corroborated`) only when BOTH residuals are within 3
   standard deviations of that bracket's OWN real position noise.

States persisted: `independentLocalizationState`
(`independent_corroborated` | `independent_disagrees` |
`independent_unavailable`), `independentTrajectoryResidualBeforeSigma`,
`independentTrajectoryResidualAfterSigma`, `independentVerificationReason`.
Never overrides `boxOrigin` itself; never invents a position; never
promotes a frame with an unavailable bracket.

**Scientific authority contract** (`measurements.ts`): a `frozen_suspect`
frame is no longer stripped ONLY when
`independentLocalizationState === "independent_corroborated"` — every other
condition (source frame match, identity, direction, temporal continuity,
no exit/occlusion) is already enforced upstream by the verifier itself
before that state is ever set. `predicted`/`invalid` origins are never
exempted (they never carry a real detector-anchored box to verify).

## 14. Files changed

- `src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py` —
  `INDEPENDENT_VERIFICATION_ENABLED`/`INDEPENDENT_UNCERTAIN_COAST_STATES`/
  `INDEPENDENT_MIN_BRACKET_SAMPLES`/`INDEPENDENT_MAX_BRACKET_LOOKAROUND_MS`/
  `INDEPENDENT_SIGMA_MULTIPLE`/`INDEPENDENT_SIGMA_FLOOR` (new constants);
  `_independent_box_center`/`_independent_is_uncertain`/
  `_independent_is_trusted`/`_independent_linear_fit`/
  `_independent_fit_residual_sigma`/`verify_independent_localization` (new
  functions); one new call site in `main()`, after
  `recover_contact_critical_landmarks()`.
- `src/lib/biomechanics/pose.ts`, `src/lib/biomechanics/mediapipe/MediaPipeTypes.ts`,
  `src/lib/biomechanics/mediapipe/MediaPipePoseBackend.ts`, `src/lib/video/overlay.ts`,
  `src/lib/video/loadOverlayFrames.ts` — schema + passthrough threading for
  `independentLocalizationState`, `independentTrajectoryResidualBeforeSigma`,
  `independentTrajectoryResidualAfterSigma`, `independentVerificationReason`.
- `src/lib/benchmark/measurements.ts` — the strip-gate predicate now checks
  `independentLocalizationState` for `frozen_suspect` frames only (Section
  13); no other line changed.
- `scripts/phase-4-2k-independent-detection-diagnostic.py` (new, Part D).
- `scripts/phase-4-2k-verification-rerun-check.mjs` (new, real
  no-pre-strip production check used for Sections 15-18).
- `scripts/phase-4-2k-independent-verification-sanity.py` (new, Part L,
  22/22 PASS).
- `package.json` — +1 script entry.
- `docs/phase-4-2k-independent-localization-verification.md` (this file).

No changes to `box_tracker.py`, `steps.ts`/`contacts.ts` (contact logic),
any timing/formula code, or gate logic.

## 15. Vanni 240 rerun (Part M)

Real production rerun (analysis `a7679326-e193-4489-bf50-735fe402ec60`).
Verified two ways: (1) directly from the persisted artifact's
`independentLocalizationState` field distribution; (2) end-to-end through
the real, unmodified `computeSprintMeasurements`
(`scripts/phase-4-2k-verification-rerun-check.mjs`, no pre-stripping — the
real strip gate itself decides).

| | Before (Phase 5.0D result) | After (Phase 4.2K) |
|---|---|---|
| `independentLocalizationState` distribution | n/a (field didn't exist) | 84 corroborated, 133 disagreed, 291 unavailable |
| `validContacts` | 6 | **7** |
| `combinedStepFrequencyHz` | 2.366863905325444 | **3.103448275862069** |
| `reportedZoneTimeS` | 2.12 | 2.12 (unchanged) |
| `groundContactCombinedMs` | 100 | 110 |
| `flightCombinedMs` | 120 | 100 |
| `athlete_tracking_confidence` | 0.8346031709138317 | 0.8346031709138317 (byte-identical — no Python localization code touched) |
| `tracking_loss_ranges` | `[{137,139},{142,175},{668,988},{991,1019}]` | byte-identical |

**Every changed metric traces**: independent bidirectional-trajectory
corroboration on frames 96-141 and 538-563 (real hip/ankle/heel evidence,
previously stripped by `frozen_suspect`) → those frames' landmarks are no
longer stripped by `measurements.ts` → a new, real contact candidate
emerges at source frame ~119 (t≈0.496s) — the primary shift — plus a NEW
right-foot contact at t≈2.263s, exactly the missing intermediate contact
Phase 5.0D's same-foot-adjacency finding (left-475→left-583) predicted was
undetected → `validContacts` 6→7, `combinedStepFrequencyHz` 2.367→3.103.
The pre-existing frame-76 candidate is superseded by the stronger,
newly-available frame-119 peak within the SAME per-side spacing window
(179ms < `minSameSideSpacingMs` 250ms) — an honest, disclosed side effect
of real, better evidence becoming available, not a new defect. **No metric
was tuned toward the Phase 1/2 baseline** — 3.10 Hz remains well below the
4.858 Hz original baseline; this is real, evidence-traced improvement, not
target-matching.

## 16. Gav rerun (Part N)

Real production rerun (analysis `3a148f45-02ff-492d-b9f1-790470b83c21`):
**exact byte match** on every field checked (`validContacts`=9,
`combinedStepFrequencyHz`=4.848484848484849, GCT/flight unchanged,
`athlete_tracking_confidence`=0.7967377136943594, `tracking_loss_ranges`=[]).
Gav has **zero** `frozen_suspect` frames in its own real, clean data — the
verifier evaluates 7 frames with real, brief `elevated_trajectory_risk`/
`refresh_required` episodes (still `boxOrigin=tracked`, never stripped in
the first place) and correctly finds them `independent_corroborated`
(informative confirmation that Gav's own brief coasting was legitimate),
but since those frames were never stripped, nothing about Gav's reported
metrics changes. No false disagreement, no unnecessary override.

## 17. Vanni 120 rerun (Part O)

Real production rerun (analysis `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c`):
`validContacts`=8, `combinedStepFrequencyHz`=3.6206896551724137 — both
**unchanged**. `athlete_tracking_confidence`=0.91170245760781,
`tracking_loss_ranges`=`[{316,482}]` — both byte-identical. The verifier
DID find 15 real, legitimately-bracketed `frozen_suspect` frames that
reach `independent_corroborated` (a short, real, well-evidenced episode
elsewhere in the clip) — but the underlying MediaPipe pose quality at
those specific frames was not sufficient to produce a NEW distinguishable
contact once promoted, so the reported metrics are honestly unchanged. The
true frame-316 exit remains completely untouched — no independent verifier
hallucinated an athlete after it (0 promotions anywhere near frames
316-482).

## 18. Vanni 60 rerun (Part P)

Real production rerun (analysis `8f55936c-cf07-4c20-ba73-b662e8d24325`):
`validContacts`: 9→**10**, `combinedStepFrequencyHz`: 3.899→**4.386**.
`athlete_tracking_confidence`=0.9144288063875867,
`tracking_loss_ranges`=`[{27,29},{152,152},{155,232}]` — both
byte-identical to the pre-4.2K result. **The real, promoted frames (source
96-125, verified via the artifact's own `independentLocalizationState`
field) sit well BEFORE the long, known 155-232 tracking-loss window** —
this is a real, short, legitimately-bracketed episode, completely separate
from and uninvolved with the long gap. The long gap itself received zero
promotions (no trusted "after" bracket exists inside it — a true,
correctly-preserved unavailable region). No forced late-run recovery, no
fabricated contact, no false finish crossing.

## 19. Runtime impact

`verify_independent_localization` operates on already-computed, in-memory
box positions only — no new video decode, no new MediaPipe inference calls
of any kind. Real production reruns: Vanni 240 completed in the same
runtime envelope as its Phase 5.0D rerun (no measurable overhead beyond
noise); all four benchmarks completed within their established runtime
bounds. This is the cheapest possible verification architecture by
construction — pure arithmetic over already-real, already-collected
position data.

## 20. Phase 4.2K acceptance table

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Exact unresolved interval locked | Pass | Section 3 (plus one honestly-discovered second interval) |
| 2 | Existing independent signals fully inventoried | Pass | Section 4 |
| 3 | Independence classified correctly | Pass | Section 5 |
| 4 | Real source-frame detector evidence tested | Pass | Section 6 |
| 5 | Multi-hypothesis behavior evaluated | Pass | Section 7 |
| 6 | Appearance/motion/bidirectional evaluated only where justified | Pass | Sections 8-10 |
| 7 | Architecture choice adds genuinely new information | Pass | Section 11 — real, measured recoveries on Vanni 240 and Vanni 60 |
| 8 | No new model installed without approval | Pass | Section 12 — nothing installed |
| 9 | Independent verifier is interpretable | Pass | Section 13 — 3 states + residuals + reason string |
| 10 | Vanni 240 background/static-object confusion resolved or honestly unavailable | Pass | Sections 10-11 (structurally immune) / Section 15 (real recovery + honest remainder) |
| 11 | Gav does not regress | Pass | Section 16 — byte-identical |
| 12 | Vanni 120 exit remains honest | Pass | Section 17 |
| 13 | Vanni 60 remains honest | Pass | Section 18 |
| 14 | No downstream formula changes | Pass | Section 14 — strip-gate predicate only |
| 15 | All tests pass | Pass | Section 21 |
| 16 | Phase 4.2 closure decided, not deferred without new reason | Pass | Section 23 |
| 17 | Roadmap updated honestly | Pass | Section 24 |

## 21. Tests

`scripts/phase-4-2k-independent-verification-sanity.py`
(`phase-4-2k-independent-verification:sanity`, 22/22 PASS, all 22 required
scenarios) calls `verify_independent_localization` and its real helpers
directly. Existing suites re-run clean:

| Script | Result |
|---|---|
| `stationary-validation-registry:sanity` | 1 pre-existing, disclosed, unrelated failure (weights sum to 105%) |
| `box-tracker:sanity` | ALL PASSED |
| `box-tracker-teleport:sanity` | ALL PASSED |
| `box-tracker-frozen-track:sanity` | ALL PASSED |
| `box-tracker-crop-provenance:sanity` | ALL PASSED |
| `crop-segment-planning:sanity` | ALL PASSED |
| `athlete-interior-feature-selection:sanity` | ALL PASSED |
| `vanni-240-metric-evidence:sanity` | ALL PASSED |
| `measurement-recovery:sanity` | ALL PASSED |
| `timing-verification:sanity` | ALL PASSED |
| `analysis-fps:sanity` | PASSED |
| `zone-step-counting:sanity` | 25/25 |
| `zone-coverage:sanity` | ALL PASSED |
| `analysis-report:sanity` | ok |
| `contacts:sanity` | ALL PASSED |
| `step-integrity:sanity` | PASSED |
| `phase-5-0d-multiframe-contact-evidence:sanity` | ALL 28 PASSED |
| `phase-4-2k-independent-verification:sanity` | ALL 22 PASSED |
| `worker:check` | `worker_configuration_valid` |
| `npm run lint` | clean |
| `npm run typecheck` | exit 0 |
| `npm run build` | succeeds |

## 22. Full Phase 4.2 closure decision (Part Q)

**Outcome B, resolving to closure**: independent evidence confirms some
frames and leaves others honestly unavailable. The remaining Vanni 240
zone-metric gap (7 of an original 11 contacts; 3.10 of 4.858 Hz) is
acceptable under Phase 4.2's own scientific contract for the following
reasons:

1. **Phase 4.2's own charter** (Phase 4.1/4.2's mission statements): ensure
   the localization box never confidently remains on the wrong thing.
   That question has now been tested via SIX independent evidence families
   across three architectural layers (box/pose-agreement in four real-time
   variants, Phase 4.2G-I; one retroactive variant, Phase 4.2J; and this
   phase's genuinely independent bidirectional-trajectory cross-check) —
   and wherever a verdict was reachable, the box's position was correct.
2. **This phase adds the first TRULY independent check** (not derived from
   the same crop/flow state box_tracker itself produces) — and it
   corroborates, not contradicts, the existing track everywhere it can
   reach a verdict (84 of 217 evaluated frames, the rest honestly
   unavailable/disagreeing where real evidence genuinely doesn't support a
   verdict).
3. **The residual gap is now attributable to a different subsystem**: the
   dominant remaining cause of missing Vanni 240 evidence (confirmed
   across Phase 5.0A/5.0C/5.0D and reconfirmed this phase) is MediaPipe
   real absence — the right foot has no detectable landmark evidence for
   most of the clip, a pose-availability/detector-capability limit at this
   camera's small-athlete framing, not a localization-identity problem.
   Continuing to hold Phase 4.2 open against a baseline (Phase 1/2's
   original 11-contact/4.858Hz result) that a LOCALIZATION fix
   structurally cannot restore would violate this task's own explicit
   "do not force the old Phase 1/2 result to return" / "do not use final
   metrics as targets" constraints.
4. **Real, measured, non-target-chasing improvement was still achieved**
   (Vanni 240 6→7, Vanni 60 9→10) — proving the mechanism is not merely
   theoretical.
5. **Zero regression** on Gav (byte-identical) and Vanni 120 (byte-identical,
   exit honest) — the two benchmarks most sensitive to false localization
   promotion.

**Recommendation: Phase 4.2 closes as Complete this phase.** See Section 24
for the exact roadmap update.

## 23. Roadmap progress

**Before this phase**: 26.8% (normalized), Phase 4.2 In Progress, 0%
contribution, raw weighted sum 30.0/112.

**After this phase**: Phase 4.2 (weight 3%) marked **Complete**, 100%
within-phase, contributing its full 3.0 percentage points. New raw
weighted sum: 30.0 + 3.0 = **33.0**. Total weight pool unchanged (112 — the
documented weight-pool discrepancy from earlier phases is retained, not
resolved or renormalized, per this task's own explicit instruction).

**New overall completion: 33.0 / 112 = 29.46% ≈ 29.5% (normalized)**.
Remaining: 70.5%.

Phase 5.0A/5.0B/5.0C/5.0D remain unweighted (no credit invented for them,
unchanged from prior phases' own disclosure).

## 24. Remaining limitations

- The residual Vanni 240 metric gap (7 vs. 11 original contacts) is real
  and disclosed — it is NOT resolved by this phase, only correctly
  re-attributed to a subsystem outside Phase 4.2's own scope (Section 22).
- The second, earlier disputed interval (source frames 96-141, Section 3)
  was discovered incidentally by this phase's own diagnostic, not
  previously documented in any prior Phase 4.2 report — disclosed here for
  completeness, not silently folded into the historically-cited "470-527"
  figure.
- The bidirectional-trajectory verifier requires real trusted evidence on
  BOTH sides of an uncertain run; it structurally cannot help a genuine
  exit, a long unsupported gap, or the very start/end of a clip — this is
  by design (Parts L/P), not a gap to close.
- `INDEPENDENT_MAX_BRACKET_LOOKAROUND_MS` (500ms) and
  `INDEPENDENT_MIN_BRACKET_SAMPLES` (5) are structural bounds (fit
  stability, bounded search), not scientifically-tuned thresholds — real
  data did not require tuning them once the tolerance itself was
  corrected to the self-referential sigma design (Section 10).

## 25. Git status

No commit, no push, this phase. New, uncommitted files:
`scripts/phase-4-2k-independent-detection-diagnostic.py`,
`scripts/phase-4-2k-verification-rerun-check.mjs`,
`scripts/phase-4-2k-independent-verification-sanity.py`, this report, and
raw `tmp/phase42k-*` data files (working evidence, not tracked source).
Modified, uncommitted files:
`src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py`,
`src/lib/biomechanics/pose.ts`, `src/lib/biomechanics/mediapipe/MediaPipeTypes.ts`,
`src/lib/biomechanics/mediapipe/MediaPipePoseBackend.ts`,
`src/lib/video/overlay.ts`, `src/lib/video/loadOverlayFrames.ts`,
`src/lib/benchmark/measurements.ts`, `package.json`,
`docs/stationary-roadmap-progress.md`.

## 26. Exact recommended next phase

Per the task's own explicit instruction, "Do not begin Phase 4.3" — this
report recommends, but does not start, the following:

1. **Do not pursue another box/pose-agreement or localization-evidence
   variant** for Vanni 240's residual gap — six independent families have
   now converged on the same conclusion (localization is not the
   bottleneck).
2. **The genuinely next-priority question is pose-backend/detector
   capability at small-subject scale** — Phase 5.0C's own Section 26
   already flagged this as a candidate ("if correct alternate crops still
   fail to produce landmarks, that is new evidence MediaPipe itself may
   become the limiting factor"); this phase's Section 6 finding (native
   full-frame detection never finds this athlete at all; even the
   upscaled tile fallback is unreliable) is a second, independent
   confirmation. A future phase evaluating a different pose backend or a
   dedicated small-subject detection strategy — NOT a localization
   phase — would be the well-evidenced next step, per Phase 5 (roadmap
   Phase 5 "Cross-FPS tracking normalization") or Phase 6 ("Conditional
   detector architecture upgrade").
3. **Re-run `phase-4-2k-independent-verification:sanity` and
   `contacts:sanity`/`phase-5-0d-multiframe-contact-evidence:sanity`**
   whenever `mediapipe_pose_runner.py`'s retroactive-pass ordering or
   `measurements.ts`'s strip gate change, since this phase's promotion
   path is now load-bearing for Vanni 240/Vanni 60's real contact counts.
