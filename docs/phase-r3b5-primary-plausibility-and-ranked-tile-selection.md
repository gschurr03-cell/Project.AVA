# Phase R3B-5 — Primary-Pass Plausibility Gate + Confidence-Ranked Tile Selection

**Status: implementation COMPLETE and shipped. A critical, unresolved
methodological discovery (frame-content correspondence) was made during
this phase's own verification work and is disclosed prominently below —
it qualifies, but does not invalidate, the code change itself.**

## 1. Executive summary

This phase implemented both defects R3B-4 identified: (A) a minimum
plausibility floor before a primary-pass candidate may suppress tile
fallback, and (B) confidence-ranked tile selection instead of first-hit-
wins. Both are implemented, generally (no benchmark-specific branches),
scale-invariant, and verified safe (a real Day-100 control still never
promotes) and bounded (candidate volume increases only modestly, 0-2 extra
tile searches per benchmark in this data). The frame-20 bleacher/railing
hallucination no longer wins a tile-search tie against a real, higher-
confidence detection; the frames-0/21/30 suppression bug is fixed
generally (fallback now always runs when warranted).

**While verifying this fix (Part N), this phase discovered something more
important than the fix itself deserves top billing over:** this diagnostic
environment's frame-by-frame decode of the Vanni 60 source file does
**not** match the real, historical production analysis's own frame
content for early frames. The real stored analysis (`tmp/phase94/vanni60.pose.json`,
a genuine past production run) shows a real athlete detected at
99.7-100% visibility from its own frame 0, near the calibrated start gate,
on a clean, complete left-to-right sprint trajectory. This diagnostic
environment's own "frame 0" (visually inspected directly, not just
compared numerically) shows an **empty field** at that exact position —
the person this phase (and R3B-4) has been detecting and analyzing near
the stairs is very likely a **different person or moment entirely**, not
the officially-tracked flying-sprint athlete. Root cause not isolated this
phase (candidates include HEVC B-frame reordering/decoder differences) —
disclosed honestly rather than guessed at or hidden. This means the
specific "frame 7/20/21" claims made in R3B-4 and this phase describe this
diagnostic environment's own internally-consistent frame numbering, not
confirmed to be the real production system's frames of the same number.

## 2. Prior architecture inherited

R3B-4's real detection-layer audit; the real, unmodified (until this
phase) `tiled_locate()`/primary-pass architecture in `mediapipe_pose_runner.py`.

## 3. Prior findings independently verified / corrected

**Verified**: R3B-4's core mechanism findings (first-hit-wins tile search;
unconditional primary-suppression gate) — confirmed still present pre-fix,
fixed this phase.

**Corrected (critical, new)**: R3B-4's own "visually confirmed real
athlete" (the person near the stairs, cx 0.68-0.97) is now, on stronger
evidence (the real historical stored analysis), very likely **not** the
officially-tracked sprinter. R3B-4's visual confirmation checked "is a real
person visible here" (yes) but not "is this the SAME person/moment the
real production system tracked" (apparently no). See
`tmp/phaseR3B5/frame-correspondence-discovery.json`.

## 4. Exact primary plausibility contract

`PRIMARY_SUPPRESSION_MIN_HEIGHT_FRACTION = 0.04` (env-overridable, matching
this file's own convention). A primary-pass detection may suppress tile
fallback only if at least one candidate's `Candidate.h` (already a
normalized, scale-invariant fraction of frame height) clears this floor.
Re-derived from FRESH real evidence this phase (`tmp/phaseR3B5/candidate-size-distribution.json`):
true-athlete candidates ranged 0.0354-0.1746 (median 0.117); the visually-
confirmed spurious cluster never exceeded 0.0369 — **not** a clean 2x gap
as R3B-4's narrower sample suggested (true min and spurious max nearly
touch). Because a below-floor candidate is never discarded (only triggers
an additional, harmless tile search), the floor is set with a small safety
margin *above* the observed spurious maximum rather than splitting the
near-zero gap — intentionally not R3B-4's own unverified "~0.05" estimate.

## 5. Exact tile ranking contract

`tiled_locate()` now scans every tile (bounded, ~7 for a 1920px frame) and
returns the highest-confidence hit; `TILE_RANK_CONFIDENCE_TIE_EPS = 0.02`
only lets `hint_x` proximity break a near-tie — never override a clearly
stronger candidate. `hint_x` still orders the scan (unchanged cost in the
common case).

## 6. Code changed

`src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py` only:
new constants (`PRIMARY_SUPPRESSION_MIN_HEIGHT_FRACTION`,
`TILE_RANK_CONFIDENCE_TIE_EPS`), new `_primary_pass_has_plausible_candidate()`
helper, `tiled_locate()` rewritten to scan-and-rank, all 3 call sites'
suppression gate updated, `searchSource`/`primaryFallbackReason`
provenance added to `tracking_diagnostics`. No other production file
touched.

## 7. Tests added

`scripts/phase-r3b5-search-policy-sanity.py` — **20/20 passing**.

## 8. Vanni60 frames 0/20/21/30 results

Within this diagnostic environment's own consistent methodology (caveat:
Section 1/3): frame 0 — suppression fixed, real detection recovered
(0.696 confidence). Frame 20 — ranking fixed, real detection (0.699) now
wins outright over the bleacher hallucination (0.267). Frame 21 —
suppression fixed (fallback now runs) but the specific detector call that
frame found only a different, low-confidence (0.269), geometrically
anomalous candidate — an honest, disclosed detector-recall limit, not a
policy defect (Part I explicitly allows this outcome). Frame 30 —
suppression fixed, real detection recovered (0.994 confidence). Full
detail: `tmp/phaseR3B5/primary-suppression-before-after.json`,
`tmp/phaseR3B5/frame20-ranking.json`.

## 9. Vanni60 identity latency before/after

Not assertable as real-production-accurate given Section 1's discovery.
Within this diagnostic environment: the tracked person (outside the
left_to_right entry corridor) never locks in 700ms; a right_to_left
diagnostic-only test locks in 50ms — this result is reported only to show
internal consistency, not as evidence about the real system's behavior,
since this person is likely not the real athlete. `tmp/phaseR3B5/startup-latency-before-after.json`.

## 10. Vanni60 contacts 7/20/21 result

**NOT DETERMINED** — re-adjudicating real contacts requires resolving the
frame-correspondence discrepancy first; this report declines to fabricate
a confident-sounding answer built on possibly-wrong frame content.
`tmp/phaseR3B5/contact-consequence.json`.

## 11. Gav control

No evidence of the same frame-correspondence issue (R3B-4's own cross-
benchmark check found Gav's primary-pass detections smoothly, plausibly
progressing). Detection-layer change bounded: +1 tile invocation across 42
frames. `tmp/phaseR3B5/cross-benchmark-control.json`.

## 12. Vanni120 control

Bounded: +2 tile invocations across 84 frames, both from real, small,
early candidates falling marginally below the floor (harmless, expected).

## 13. Vanni240 control

Zero change — Vanni240's primary-pass candidates were already comfortably
above the floor; no quality-gate/duplicate-suppression/off-frame-gap
behavior could be affected (steps.ts untouched regardless).

## 14. Day-100/background result

The real, observed spurious candidate (8 real hits, same as R3B-4's)
correctly fails the new plausibility floor on every hit, and still never
promotes under unchanged identity logic — two independent layers both
reject it. `tmp/phaseR3B5/day100-control.json`.

## 15. Candidate volume before/after

Bounded across all 4 benchmarks (`tmp/phaseR3B5/candidate-volume.json`) —
no pathological/unbounded growth; at most one extra tile-derived candidate
per newly-unsuppressed frame.

## 16. Legitimate scientific output changes

None — no scientific file (steps.ts, box_tracker.py, measurements.ts) was
touched or rerun. `tmp/phaseR3B5/scientific-before-after.json`.

## 17. Regressions

None in the code itself. All prior Python regression suites re-run clean
except R3B-4's own check 17, which by design asserts "mediapipe_pose_runner.py
unchanged since R3B-4" — now correctly fails, since R3B-5 legitimately
modified exactly that file; R3B-4's other 16 checks remain fully valid.
`typecheck`/`lint` clean.

## 18. Whether the early-contact problem is now actually resolved

**Unknown, honestly** — the search-policy defects R3B-4 identified are
genuinely fixed, safely and generally. But this phase's own frame-
correspondence discovery means neither this phase nor R3B-4 can currently
confirm whether the specific frames analyzed throughout this whole R3B
track are even the correct real-world moments. The early-contact problem
may or may not be resolved by this fix — that question cannot be honestly
answered until the frame-correspondence issue is resolved.

## 19. Exact next recommendation

**Before any further Vanni60-specific forensic work**: resolve the frame-
content correspondence between this diagnostic environment's decode and
the real production worker's decode of the same file (candidate approach:
compare decoded frame hashes/visual fingerprints from an actual worker run
against this environment's `cv2.VideoCapture` decode, frame-by-frame,
isolating whether HEVC B-frame reordering, decoder version, or another
cause is responsible). Only after that is resolved should frame 7/20/21's
real-world contact-recovery status be re-adjudicated.

## 20. Phase status: implementation COMPLETE; a critical open question surfaced

## 21. Current remediation-roadmap status

R3A-R3B4 closed. R3B-5's code fix shipped and verified safe/general/bounded.
The frame-correspondence discovery (Section 1) is now the single most
important open item blocking confident further Vanni60-specific work.

## 22. Legacy roadmap completion

Not tracked as a percentage this phase.

**STOP AFTER R3B-5.**
