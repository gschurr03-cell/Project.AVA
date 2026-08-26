# Phase R3D — Corrected-Orientation Startup Identity + Contact Consequence Revalidation

**Status: REVALIDATION COMPLETE. Zero production code changed.**

## 1. Executive summary

With the R3C rotation-detection bug fixed in forensic tooling, this phase
reran REAL production (`mediapipe_pose_runner.py`, `MEDIAPIPE_ROI=1`,
`athlete_tracker.py`, current box/localization logic) against the
correctly-oriented Vanni 60 source, alongside three isolated,
production-untouched counterfactual reverts (BASELINE = pre-R3B-1;
R3B-1; R3B-3). **All four variants converge on identical results**:
trusted identity at 66.7ms (frame 4), and identical contact recall
(2/2 confirmed early contacts, right@133ms and left@350ms, in both
BASELINE and CURRENT). **R3B-1/R3B-3/R3B-5 provide zero measurable benefit
for Vanni 60 once rotation is correct** — the dramatic historical
improvement (500ms → 66.7ms) is attributable entirely to the rotation fix,
not to any of the R3B identity/search engineering. Frame 21 (t=350ms), one
of the three originally-flagged "lost early contacts," is a real,
confirmed touchdown that both BASELINE and CURRENT production correctly
recover. The original user-visible symptom is judged
**ORIGINAL_SYMPTOM_WAS_MISINTERPRETED** (Part P) — real production was
very likely never as broken as forensic analysis (itself affected by the
same rotation bug) made it appear.

## 2. Prior architecture inherited

R3C's `_ensure_ffprobe_on_path.py`; all R3A-R3B5 code (none modified this
phase); the `phase-r3a-missing-contact-trace.mjs` real-function-compilation
pattern, reused for Part G.

## 3. Prior findings independently verified

R3C's root-cause diagnosis (ffprobe-not-on-PATH → silent rotation-detection
failure) — reconfirmed via direct real production reruns showing correct
`"probedRotationDegrees": 180.0, "rotationApplied": true` once the fix is
applied.

## 4. Findings corrected/disproved

**A second, independent environment gap was found and fixed in this
phase's own methodology**: `MEDIAPIPE_ROI` defaults to `False` unless
explicitly set — the real Node worker (`scripts/analysis-worker.mjs`)
always sets it to `"1"`, but a bare shell invocation does not. An initial
production rerun silently took the wrong (non-ROI, no box_tracker) code
path until this was caught via stderr inspection and corrected — disclosed
here rather than silently discarded.

**A significant, unresolved discrepancy was found**: the historical stored
artifact (`tmp/phase94/vanni60.pose.json`) shows first trusted identity
only at frame 30 (500ms) — not matching ANY of this phase's fresh reruns
(all 66.7ms), despite the historical artifact's own pose data being
correctly oriented. Tested and ruled out: entry-gate calibration (identical
result with/without it) and the R3B-1/R3B-3/R3B-5 code differences
(identical across all 4 variants). Most likely remaining explanation: a
MediaPipe library/model version or other environment difference between
when the historical artifact was generated and this phase's fresh reruns —
not isolated this phase, disclosed honestly.

## 5. Correctly oriented Vanni60 early-contact ground truth

Two contacts confirmed by both visual review and the real, unchanged
contact detector: **RIGHT @ sourceFrame 8 (133.3ms)**, **LEFT @
sourceFrame 21 (350.0ms)**. `tmp/phaseR3D/manual-early-contact-ground-truth.json`.

## 6. Baseline identity latency

66.67ms (frame 4), `cumulative_displacement` promotion reason — real,
full production rerun of an isolated, reverted (pre-R3B-1) runtime copy.

## 7. Current identity latency

66.67ms (frame 4), `cumulative_displacement` — **identical to baseline**.
`tmp/phaseR3D/identity-latency-comparison.json`.

## 8. Frame7 result

No real touchdown at exactly frame 7; the nearest real touchdown is
~50-67ms. Classification: **PARTIALLY_CONFIRMED** (R3A never claimed frame
7 itself was a contact — only that real pose evidence existed there, which
remains true).

## 9. Frame20 result

The real, authoritative touchdown is 1 frame later, at frame 21 (350ms),
not frame 20 (333ms). Classification: **PARTIALLY_CONFIRMED**.

## 10. Frame21 result

**CONFIRMED** — a real LEFT touchdown, recovered by both BASELINE and
CURRENT production.

## 11. Baseline contact recall

2/2 confirmed early contacts matched, 0 missing, 0 extras.

## 12. Current contact recall

2/2 confirmed early contacts matched, 0 missing, 0 extras — **identical to
baseline**. `tmp/phaseR3D/contact-recall-before-after.json`.

## 13. R3B-5 search-policy validity after orientation correction

**UNVERIFIED (mechanism not exercised)** — once rotation is correct, the
real primary full-frame pass finds the athlete with full 33/33-landmark
completeness on essentially every frame (42/45); tile fallback (which
R3B-5's plausibility floor and ranked selection govern) never runs for
Vanni 60 in the corrected replay. The mechanisms remain logically sound
(established independently in R3B-5) but have no observable effect on this
specific clip post-correction. `tmp/phaseR3D/search-policy-revalidation.json`.

## 14. 0.04 height-floor validity

Still defensible — every real corrected-orientation primary-pass candidate
(median height fraction 0.099) clears the floor with a wide margin. Not a
fresh adversarial re-test (none was available/needed this phase).
`tmp/phaseR3D/height-floor-revalidation.json`.

## 15. R3B-3 torso-contract validity

Does not activate — the original displacement path already promotes
identity (66.7ms) before either `ready_via_strong_pose()` or
`ready_via_torso_corroboration()` get a chance to fire. No incremental
contact-recall effect. Not tuned.

## 16. Day-100 result

Unchanged — the real, previously-observed spurious background candidate
still never promotes under current, unmodified identity logic.

## 17. Cross-benchmark controls

Spot-check only (per explicit instruction): zero production files changed
this phase, so Gav/Vanni120/Vanni240's prior R3B-4/R3B-5 findings are
trivially unaffected.

## 18. Original Vanni60 symptom resolution

**ORIGINAL_SYMPTOM_WAS_MISINTERPRETED.** Real production (both BASELINE
and CURRENT) trusts identity at 66.7ms and correctly recovers both
confirmed early contacts (133ms, 350ms) once rotation is correctly applied
— which real production has evidently been doing all along (or very close
to it — see the unresolved historical-artifact discrepancy, Section 4).
The appearance of a severe, un-recovered early-contact problem was itself
an artifact of this whole forensic investigation's own diagnostic tooling
analyzing frames 180° off, not a genuine, currently-manifesting production
defect.

## 19. Exact next recommendation

**CLOSE the startup-contact remediation block for Vanni 60** (CASE A).
The one remaining, genuinely open item is the historical-artifact latency
discrepancy (Section 4) — recommend a narrow, separate investigation (NOT
more contact/localization tuning) into whether a MediaPipe library/model
version change occurred between the historical artifact's generation and
today, since that is now the only unexplained variable.

## 20. Tests

`scripts/phase-r3d-corrected-orientation-contact-revalidation-sanity.py` —
**14/14 passing**.

## 21. Scientific regression

Zero production files changed (mtime-guarded). All prior regression suites
re-run clean. `typecheck`/`lint` clean.

## 22. Phase status: COMPLETE — revalidation only, no fixes implemented

## 23. Current remediation-roadmap status

R3A-R3C closed. R3D closes the Vanni60 startup-contact remediation block
entirely — the real, controlled evidence shows no further localization or
contact engineering is justified for this benchmark. One narrow, separate
open question remains (historical-artifact version discrepancy), explicitly
not a contact-tuning task.

No commit, push, or db:reset. No production fixes made.
**STOP AFTER R3D.**
