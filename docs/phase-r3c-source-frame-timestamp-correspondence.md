# Phase R3C — Source Frame / Timestamp Correspondence Reconciliation

**Status: ROOT CAUSE FOUND AND FIXED (forensic tooling only). Zero
production code changed.**

## 1. Executive summary

The contradiction R3B-5 surfaced is fully resolved. **Root cause: the
Vanni 60 source file carries a real `rotate=180` container tag. This
diagnostic environment's forensic scripts call `mediapipe_pose_runner.py`'s
`probe_rotation_degrees()`, which shells out to a bare `ffprobe` command —
and `ffprobe` is not on this shell's `$PATH`** (only reachable via the
project's own bundled `node_modules/@ffprobe-installer/*` binary). The
probe's `except (OSError, ...)` clause silently swallows the resulting
`FileNotFoundError` and returns `None` ("no rotation needed"), by design —
so every R3B-4/R3B-5 forensic script analyzed every Vanni 60 frame
**unrotated**, 180° off from the correct orientation. Rotating a frame 180°
swaps both left↔right and top↔bottom, which explains everything: the
"drone-like" sideways view, the "athlete moving right-to-left opposite the
configured direction," the "empty field at frame 0," and the "bleacher
hallucination" all trace back to this single tooling gap. The real
production worker's own invoking environment has `ffprobe` correctly on
`PATH` (proven by the real historical artifact's own correct tracking) —
this was never a production bug.

## 2. Prior architecture inherited

R3B-4/R3B-5's real-production-replay scripts; `probe_rotation_degrees()`/
`rotation_code_for_angle()`/`apply_rotation()` (unmodified, all correct —
the bug was environmental, not in this code).

## 3. Exact Vanni60 source identity

`tmp/phase50e/sources/vanni_fly_60.mov`, sha256
`ff61af9a638ec5c36ba1c42ff778ea9119d605c9b3692ec629c800f992bc2111`,
8,306,130 bytes (matches the DB session record exactly). HEVC Main 10,
1920×1080 display (1920×1088 coded), `rotate=180` tag + Display Matrix
side data confirming -180°, `r_frame_rate=60/1`, `time_base=1/600`,
duration 3.896667s, iPhone 16 / QuickTime. `tmp/phaseR3C/source-metadata.json`.

## 4. Whether source is CFR or VFR

**Effectively CFR at 60fps.** Real PTS delta analysis of all 233 decoded
frames: 154/233 deltas at exactly 16.667ms, 77/233 at 16.666ms (float
rounding), one single 18.333ms blip. The container's `avg_frame_rate`
(≈56.53fps) and the DB's own `variableFrameRate: true` classification
reflect a different frame-count metric (`nb_frames=246` format-level vs.
233 real decoded frames), not genuine irregular delivery.
`tmp/phaseR3C/frame-pts-timeline.json`.

## 5. Whether B-frame reordering exists

B-frames are present (174/233 = 75%) but do **not** explain the
contradiction: `pkt_pts_time == pkt_dts_time` for all checked frames in the
first ~1 second (2 genuine, minor mismatches exist later in the file at
~2.55s, both B-frames, one-frame-interval off, fully outside this
investigation's 0-700ms scope — disclosed, not hidden). Both the real
worker and this diagnostic environment read frames via standard
presentation-order decode, so B-frame reordering was never the mechanism.

## 6. Exact production-worker frame0 source PTS

`sourcePtsSeconds=0.0`, `sourceFrameIndex=0` — and, once `ffprobe` is
correctly on `PATH`, the correctly-rotated frame 0 shows a real, clearly
sprinting athlete near the left edge/start blocks, matching the real
stored artifact exactly (99.9% visibility, cx≈0.02-0.05).

## 7. Exact forensic/OpenCV frame0 source PTS

Same PTS (`0.0`) — `CAP_PROP_POS_MSEC`/`CAP_PROP_POS_FRAMES` were **never
wrong** (Part F: reported values exactly match the nominal 60fps PTS grid
for every checked frame). The forensic frame *content* was wrong only
because of the unapplied 180° rotation, not because of frame-index/seeking
error. `tmp/phaseR3C/opencv-frame-trace.json`.

## 8. Root cause of the frame-content contradiction

`probe_rotation_degrees()`'s bare `subprocess.run(["ffprobe", ...])` call
fails silently (`ffprobe` not on this shell's `PATH`) and the function's
own `except` clause returns `None`, indistinguishable from "genuinely no
rotation." Confirmed directly: calling the function with and without the
bundled ffprobe binary prepended to `PATH` returns `None` vs. `180.0`
respectively, on the identical file, in the identical Python process.

## 9. Whether stored pose artifact correspondence is correct

**Yes — fully correct.** The artifact's own real, high-visibility trajectory
(cx 0.018→0.99 over 2.5s) was right all along; this phase's own earlier
diagnostic tooling was the misaligned side. `tmp/phaseR3C/artifact-correspondence.json`.

## 10. Whether browser mediaTime correspondence is correct

**Yes, by design** — `VideoOverlay.tsx` already uses
`requestVideoFrameCallback`'s native `metadata.mediaTime` (a real
presentation timestamp), matched against `loadOverlayFrames.ts`'s
`frame.tMs / 1000` — both PTS-based, not frame-index arithmetic. Not
independently verified via a live browser session this phase (would
require a running dev server + browser automation; code review was
judged sufficient once the PTS-based design was confirmed) — disclosed.
`tmp/phaseR3C/browser-correspondence.json`.

## 11. Canonical frame/timestamp identity adopted

`{ sourcePtsSeconds (PRIMARY), sourceFrameIndex (derived/secondary),
presentationOrderIndex (== sourceFrameIndex for this file) }`. For THIS
file specifically, `sourceFrameIndex / 60.0` safely reconstructs
`sourcePtsSeconds` (proven CFR, Section 4) — but this equivalence is a
property of this file, never to be assumed for a future source without
re-verifying real PTS deltas first. `tmp/phaseR3C/canonical-frame-key.json`.

## 12. Reconciled meaning of prior frames 7/20/21

Same event, same `sourcePtsSeconds`/`sourceFrameIndex` as originally
claimed — the frame *identity* was never wrong; only its *visual
interpretation* was (180° off). `tmp/phaseR3C/vanni60-prior-event-reconciliation.json`.

## 13. Which R3A conclusions remain valid

All of them, now on solid footing: the athlete is genuinely visible from
`sourcePtsSeconds≈0`; the startup-warmup mechanism (identity-trust discards
real, already-detected early evidence) is a pure logic finding independent
of orientation and remains valid. `tmp/phaseR3C/r3a-reassessment.json`.

## 14. Which R3B-4 conclusions remain valid

**VALID**: the primary-suppression code defect, the first-hit-wins ranking
code defect, the cross-benchmark controls (Gav/V120/V240 showed no
evidence of this rotation issue). **VALID_MECHANISM_BUT_WRONG_FRAME**: the
specific "frame 20 is a bleacher railing" and "frames 0/21/30 show a
stationary railing hallucination" visual claims — the underlying
suppression/ranking mechanisms are real, but those specific visual
identifications were made on unrotated frames and need re-verification.
**UNVERIFIED**: which specific candidates are "true athlete" vs. "spurious"
in the height-fraction distribution (the floor arithmetic likely still
holds since height fraction is rotation-invariant, but the class labels
need re-checking). Full detail: `tmp/phaseR3C/prior-phase-validity-review.json`.

## 15. Which R3B-5 conclusions remain valid

**VALID**: the shipped code itself (untouched by this discovery — rotation
affects diagnostic interpretation, not the shipped logic; Day-100 control
still passes). **INVALIDATED**: the specific pre/post frame-20/0/21/30
narrative and the "identity never locks in 700ms" result — both were
built on unrotated frames. This phase's corrected re-run
(`tmp/phaseR3B5/candidate-traces/vanni60.json`, regenerated with `ffprobe`
correctly on `PATH`) shows a materially different, more coherent picture:
a smooth, monotonic, real athlete trajectory from frame 0 through frame 33,
with frame 21 now recovering a well-positioned 0.64-confidence real
candidate. A fresh identity/contact counterfactual on this corrected data
was **not** run to completion this phase (explicitly out of scope — no
more contact tuning) — recommended as the next phase's first task.

## 16. Forensic tooling fixes

New `scripts/_ensure_ffprobe_on_path.py` — prepends this repo's bundled
ffprobe/ffmpeg to `PATH` for the current process; imported (for its side
effect) at the top of `scripts/phase-r3b4-real-production-replay.py`,
`scripts/phase-r3b5-post-fix-replay.py`,
`scripts/phase-r3b5-identity-counterfactual.py`, and
`scripts/phase-r3b4-tile-coverage-sheets.py`, before their own
`mediapipe_pose_runner` import. No production file touched — this is a
forensic-tooling-only fix, per this phase's explicit scope. Copies saved
to `tmp/phaseR3C/corrected-forensic-tooling/`.

## 17. Tests

`scripts/phase-r3c-frame-correspondence-sanity.py` — **14/14 passing**.

## 18. Scientific regression

Zero production files changed (mtime-guarded). All prior Python regression
suites re-run clean, including R3B-5's own 20/20. `typecheck`/`lint` clean.

## 19. Phase status: COMPLETE — root cause found, forensic tooling fixed

## 20. Exact next recommendation

Rerun R3B-3's identity counterfactual and R3B-5's contact-consequence
analysis against the NOW-CORRECTLY-ROTATED candidate stream
(`tmp/phaseR3B5/candidate-traces/vanni60.json`, already regenerated this
phase) to determine Vanni 60's true identity-lock latency and whether
frames 7/20/21 actually become recoverable contacts — this is real,
substantive follow-up work explicitly deferred per this phase's "no more
contact tuning" constraint, not resolved here.

No commit, push, or db:reset. **STOP AFTER R3C.**
