# Phase R3B-4 — Early Raw Detection Recall + Hint-Guided Tiled Search Audit

**Status: EVIDENCE-ONLY audit COMPLETE. Zero production code changed.**

## 1. Executive summary

This phase set out to answer why `tiled_locate()` fails on Vanni 60's
critical startup frames (7, 20, 21). The decisive, visually-confirmed
answer: **it mostly doesn't fail.** When the REAL, unmodified production
functions are used exactly as production uses them — the real primary
full-frame `num_poses=3` VIDEO-mode pass, then the real `tiled_locate()`
fallback with real per-frame `hint_x` continuity — raw tile-search
detection succeeds on **34/34** real invocations across the 10 audited
critical frames (100%), including frames 7 and 8. This directly contradicts
this whole R3B track's working assumption (built on R3B-2/R3B-3's own
simplified, single-tile, IMAGE-mode, `num_poses=1` diagnostic
reimplementation, which under-detects relative to real production — a
limitation those phases partially disclosed but this phase now fully
confirms and corrects).

Two narrower, real, visually-confirmed defects DO exist, independent of raw
recall:

1. **Frame 20 — candidate-ranking miss.** `tiled_locate()`'s first-tile-
   with-any-hit-wins policy (not confidence-ranked) selected a **0.267-
   confidence false-positive pose hallucinated on an empty bleacher
   railing** over a **0.699-confidence real detection of the visible
   athlete** sitting in a different, unreached tile. Directly visible in
   `tmp/phaseR3B4/tile-layouts/vanni60_frame020_candidate_ranking_miss.jpg`
   — this is the exact Day-100 bleacher-hallucination failure mode this
   codebase has fought before, now caught winning a tile-search tiebreak.
2. **Frames 0/21/30 — primary-pass suppression.** The primary full-frame
   pass intermittently (8/42 = 19% of early frames) "detects" a persistent,
   tiny (1-4% of frame height), low-quality candidate near a fence/railing
   — also visually confirmed as empty space, no person present
   (`vanni60_frame021_primary_pass_suppression.jpg`). Because production's
   fallback gate is a bare `not any(candidates)`, this spurious hit's mere
   presence **prevents tile-fallback from ever running** on these frames —
   even though tile-fallback reliably finds the real, clearly-visible
   athlete every time it IS allowed to run. This affects frame 21 (a named
   target frame) and frame 37 (R3A's own reported first-authoritative-
   contact frame).

Both defects are narrow, detector-layer-only, and — per a real Day-100
control this phase ran using the actual observed spurious candidate fed
through the real, unmodified `athlete_tracker.py` — **safe to fix without
touching identity logic**, which independently rejects that candidate today
regardless. A size-based plausibility floor (candidates must be ≥5% of
frame height to suppress tile-fallback) cleanly separates all 3 suppression
cases from every real athlete detection in this data (real: 8.7%-13.6%;
spurious: max 3.7%) — a 2x+ margin, not tuned to one frame.

## 2. Prior architecture inherited

R3B-1/R3B-2/R3B-3's identity-acquisition chain (unchanged, untouched this
phase); R3A's original warmup-latency findings; the real production
`tiled_locate()`/`make_options()`/primary-detector-pass architecture in
`mediapipe_pose_runner.py`, inspected in full this phase for the first time
in this session's history (prior phases read excerpts; this phase imported
and RAN the real functions).

## 3. Prior findings independently verified / corrected

**Verified**: R3B-2's 81.7% torso-presence finding and general "detection
intermittency exists" framing — still true in a narrower, more precise
sense (see Section 13).

**Corrected (major)**: R3B-2/R3B-3's own diagnostic scripts' apparent
"frame 7/20 not detected at all" result is **not representative of real
production**. The real primary pass uses `num_poses=3` in VIDEO mode (not
`num_poses=1` IMAGE mode); the real `tiled_locate()` uses genuine
`hint_x`-guided tile-priority search with real per-frame continuity (not a
fresh, unguided search each frame). Once these real functions are used,
detection succeeds essentially everywhere in this window. This phase's own
first replay attempt initially miscomputed `hint_x`/promotion-latency
values too (an indentation bug placing a print outside its loop, caught and
fixed before use — see the script's own history) — disclosed, not hidden.

**Genuinely new, unresolved discrepancy (disclosed, not guessed at)**: this
phase visually confirmed the real athlete's motion is right-to-left in raw
pixel space across frames 6-37, while the session's stored
`timing_direction` field is `left_to_right`. Not resolved this phase.

## 4. Exact Vanni60 raw detection failure mechanism

Not a coverage, resolution, or model-capability problem. It is an
**architectural coupling defect**: (a) the fallback trigger has no
plausibility floor, so any low-quality primary-pass hit — however small or
spurious — blocks the (working) tile fallback; (b) the tile search returns
the first hit above a lenient confidence floor rather than the best
available hit. Full detail: `tmp/phaseR3B4/root-cause-classification.json`.

## 5. Critical frame-by-frame classifications

| Frame | tMs | Classification |
|---|---:|---|
| 0 | 0.0 | HINT_UNDERUSED (primary-pass suppression) |
| 6 | 100.0 | NONE — real success (conf 0.994) |
| 7 | 116.67 | NONE — real success (conf 0.538) |
| 8 | 133.33 | NONE — real success (conf 0.602) |
| 20 | 333.33 | CANDIDATE_RANKING_MISS |
| 21 | 350.0 | HINT_UNDERUSED (primary-pass suppression) |
| 27 | 450.0 | NONE — real success (conf 0.767) |
| 30 | 500.0 | HINT_UNDERUSED (primary-pass suppression) |
| 32 | 533.33 | NONE — real success (conf 0.932) |
| 33 | 550.0 | NONE — real success (conf 0.825) |

Full detail: `tmp/phaseR3B4/root-cause-classification.json`,
`tmp/phaseR3B4/vanni60-critical-frame-trace.json`.

## 6. Tile coverage result

Full, correct — every real athlete detection landed inside a real tile;
coverage/overlap/step-size were never the limiting factor.
`tmp/phaseR3B4/tile-layouts/`.

## 7. Athlete pixel-scale result

Real athlete: 93-147px tall (8.7%-13.6% of 1080px frame height) at the
critical frames where tiled_locate succeeded. No resolution threshold
separates success from failure frames, because raw detection succeeded at
6/10 critical frames outright; pixel scale does not explain the 4 remaining
frames (those are architectural). `tmp/phaseR3B4/athlete-pixel-scale.json`.

## 8. Full-frame detector result

Never finds the real athlete at any of the 10 critical frames — only
intermittently finds the same tiny, spurious, ~1-4%-of-frame-height
candidate. Confirms tiling is necessary and already working; full-frame
alone would fail completely. `tmp/phaseR3B4/full-frame-control.json`.

## 9. Upscale result

Detection fails at native (1.0x) crop resolution even in a tight,
correctly-centered crop; succeeds by 2.0x-4.5x — consistent with, not
contradicting, production's own already-shipped fixed 3x tile upscale.
ATHLETE_TOO_SMALL_FOR_DETECTOR is real at native scale but already
mitigated by the existing upscale. `tmp/phaseR3B4/upscale-control.json`.

## 10. hint_x result

Correctly prioritizes the right tile first on the large majority of real
frames (34/34 successes). Not filtered by any plausibility check before use
— directly implicated in frame 20's ranking miss (a stale/spurious-adjacent
hint biased search toward the wrong tile first).
`tmp/phaseR3B4/hint-x-audit.json`.

## 11. Candidate ranking result

First-hit-wins, not confidence-ranked — the single most consequential,
narrow, fixable defect found this phase. `tmp/phaseR3B4/candidate-ranking.json`,
`tmp/phaseR3B4/hint-guided-counterfactual-search.json`.

## 12. Day-100 false-positive control

The REAL, observed, persistent spurious candidate (not synthetic) fed
through the real, unmodified `athlete_tracker.py`: **never promotes**
(8 real hits, 0 promotions). Confirms any future detector-layer fix remains
safe without touching identity logic. `tmp/phaseR3B4/day100-control.json`.

## 13. Gav/V120/V240 controls

Vanni 120: tile fallback succeeds 100% (78/78) when invoked. Vanni 240:
83% (82/99). Gav: primary pass genuinely finds the real, closer athlete
directly (smooth, monotonic, high-completeness trajectory) — no spurious-
candidate pattern detected in a quick scan. The suppression defect is
confirmed specific to Vanni 60's own background content, not universal —
but the underlying architectural gap (no plausibility floor) is generic
and could recur on other clips. `tmp/phaseR3B4/cross-benchmark-control.json`.

## 14. Whether improved raw detection restores contacts

**Not proven either way — reported honestly, not assumed.** Frame 7 needs
no detector fix (already detected) and remains blocked purely by identity
timing (already-exhausted R3B-1/2/3 territory). Frames 20/21 would gain
real candidate availability from a narrow fix, but both remain earlier than
Vanni 60's current 400ms identity-lock time; whether the additional
evidence would itself pull the lock earlier was not quantified this phase.
`tmp/phaseR3B4/contact-counterfactual.json`.

## 15. Exact dominant root cause

Architectural: (1) no plausibility floor gates whether a primary-pass hit
suppresses tile-fallback, and (2) tile search is first-hit-wins rather than
confidence-ranked. NOT: coverage, resolution, model capability, hint
staleness alone, or detector cadence (re-confirmed unchanged, Part 16 of
R3B-2/R3B-3, still true — acquisition already runs the detector every
frame).

## 16. Whether R3B-5 is justified

**Yes — CASE A, narrow — with an explicit caveat.** Justified on the real,
visually-confirmed defects' own merits (candidate quality/availability),
independent of whether it turns out to fully resolve the original frame
7/20/21 symptom (Section 14's honest uncertainty).

## 17. Exact R3B-5 recommendation, if any

Two narrow, detector-layer-only changes: (a) require the primary pass's
best candidate to clear a minimum plausibility bar (e.g., a size/height-
fraction floor around 0.05, evidence-derived this phase) before it is
allowed to suppress tile-fallback; (b) change tile search from first-hit-
wins to confidence-ranked among all tiles actually scanned (or a small
bounded continue-past-first-hit). Identity promotion logic remains
untouched — the independent safety layer, confirmed via a real Day-100
control. NOT recommended: further tile-coverage/upscale tuning (not the
bottleneck) or identity-threshold tuning (exhausted).
`tmp/phaseR3B4/recommended-next-step.json`.

## 18. Tests

`scripts/phase-r3b4-early-detection-recall-sanity.py` — **17/17 passing**.

## 19. Scientific regression

Zero production files changed this phase (mtime-guarded). All prior
regression suites re-run clean: athlete-tracker-sanity, box-tracker-sanity,
cross-athlete-coast-risk-sanity, phase-r3b1/r3b2/r3b3 sanity suites (all
passing). `npm run typecheck`/`lint` clean. `npm run build` not run —
judged unnecessary (evidence-only phase, zero TS/JS files touched this
phase). Note: `git status` shows `mediapipe_pose_runner.py` as modified —
this predates this phase (present in the very first git status of this
session, before R3B-2/R3B-3/R3B-4 began) and was not touched this phase.

## 20. Phase status: COMPLETE — audit only, no implementation

## 21. Current remediation-roadmap status

R3A/R3B-1/R3B-2/R3B-3 closed. R3B-4 audit complete: raw detection recall is
NOT the bottleneck it was assumed to be; a narrow, different, well-
evidenced R3B-5 (candidate-quality gating + confidence-ranked tile search)
is recommended but not started.

## 22. Legacy roadmap completion

Not tracked as a percentage this phase.

**STOP AFTER R3B-4.**
