# Phase R3B-3 — Torso-Corroborated Startup Identity Contract

**Status: evaluation COMPLETE, narrow implementation SHIPPED (CASE A) — a
safe hybrid design that differs from the task's own illustrative example,
because the illustrative example was empirically proven unsafe.**

## 1. Executive summary

R3B-2 proved bilateral torso landmarks (shoulders+hips) are present in
81.7% of real detected startup frames — far more often than the 96%
full-body completeness R3B-1's `ready_via_strong_pose()` requires. This
phase asked whether torso completeness could safely substitute for
`MIN_CUMULATIVE_DISPLACEMENT` the same way full-body completeness does.

**It cannot, on its own.** An honest adversarial reconstruction of the real
Day 100 incident (a stationary candidate with a complete, geometrically
plausible torso and the SAME 51.5% total completeness the real incident's
own best frame reached) promotes within 2-3 hits under a pure
torso-completeness + corroboration-score contract — the existing
corroboration score rewards position self-consistency, which a static
target trivially maximizes, and 4 of 33 landmarks is too weak an
anti-hallucination signal alone. This is a real, empirically-confirmed
finding, not a theoretical worry.

A **safe hybrid variant** — torso completeness + a scale-invariant
degenerate-geometry guard + the existing 0.75 corroboration-score bar +
a **reduced, not eliminated**, displacement floor (0.008, vs. the original
0.03) + 3 qualifying hits within a 750ms physical-time window — passes the
same adversarial test and was implemented. Real, corrected, verified
measurement (see Section 6) shows it improves Vanni 60's identity-lock
latency from 450ms to 400ms, with zero effect on Gav, Vanni 120, or Vanni
240. This is smaller than originally hoped, and does **not** rescue the
specific Vanni 60 frame 7/20 contacts that motivated this whole R3B track —
that is reported honestly, not glossed over.

## 2. Prior architecture inherited

R3B-1's `ready_to_promote()`/`ready_via_strong_pose()` OR-gate; R3B-2's real
full-fidelity tiled-detection evidence for all 4 benchmarks
(`tmp/phaseR3B2/pose-completeness-stage-trace-raw.json`), reused directly
this phase (no re-inference).

## 3. Prior findings independently verified / corrected

Verified: R3B-2's 81.7% torso-presence and intermittency findings, directly
confirmed via real replay this phase.

**Self-corrected mid-phase (disclosed, not hidden):** an early quantitative
estimate ("Gav 233ms→83ms, Vanni60 450ms→367ms") was **wrong** — a bug in
this phase's own first-draft measurement script conflated a qualifying-hit
*time span* with the *absolute promotion latency*. Re-measured via a
corrected, monkeypatch-based 4-way comparison
(`scripts/phase-r3b3-contract-comparison.py`): the real numbers are smaller
(Section 6). Also found: R3B-2's own revert-based regression script
(`scripts/phase-r3b2-full-fidelity-replay.py`) silently stopped reverting
anything once this phase's Part P edit changed the promotion-check code
shape its string-replace targeted — its "before == after" output is no
longer meaningful for future reruns; not fixed (frozen historical script),
worked around via a fresh, monkeypatch-based comparison instead.

**Methodology discrepancy disclosed:** R3A's own real, production-worker
data reports real, high-visibility pose landmarks at Vanni 60 frame 7-8.
This phase's own simplified `tiled_locate()` reimplementation (single-tile-
first-hit, no `hint_x`-guided multi-candidate search) found **no**
detection at frame 7. This is a proven under-detection in this phase's own
diagnostic methodology relative to real production, not evidence the real
pose data is absent — disclosed explicitly rather than either papered over
or treated as authoritative.

## 4. Exact torso evidence contract evaluated (and shipped)

- **Torso completeness**: `left_shoulder`, `right_shoulder`, `left_hip`,
  `right_hip` all present at `visibility >= LANDMARK_VISIBILITY_FLOOR`
  (0.3, the SAME floor identity evidence already uses elsewhere — no new
  tunable on this axis).
- **Geometry**: real-data-corrected. A strict shoulders-above-hips /
  width-ratio gate was tested against 196 real torso-complete frames and
  **rejected 35% of genuine early-clip evidence** — real small/distant-
  athlete torso landmarks are frequently noisy at this scale (comparable in
  magnitude to MediaPipe's own per-frame jitter; even bounding-box-relative
  torso height is negative in over a third of real frames). Only a
  scale-invariant degenerate-point guard (`TORSO_MIN_SPAN_FRACTION = 0.02`
  of the candidate's own bounding-box width) survived real-data testing.
- **Corroboration**: reuses the existing `EARLY_ACQUISITION_MIN_SCORE`
  (0.75) — not threshold-searched to a new value; Part C found no
  evidence-backed reason to deviate from the value R3B-1 already
  established and this codebase already relies on.
- **Displacement**: `TORSO_MIN_CUMULATIVE_DISPLACEMENT = 0.008` — real,
  evidence-derived. Genuine torso-corroborated candidates had already
  accumulated between 0.0098 (Vanni 240) and 0.077 (Gav) cumulative
  displacement by their natural 3rd qualifying hit; 0.008 sits below every
  real benchmark's own naturally-achieved value (costs nothing) while
  remaining categorically unreachable by a truly stationary target
  (cumulative displacement is monotonically non-decreasing; a static
  candidate contributes exactly 0.0, forever).
- **Persistence**: `TORSO_QUALIFYING_WINDOW_MS = 750.0` — the 3
  `MIN_VERIFICATION_HITS` qualifying hits must span no more than 750ms of
  real physical time (never frame count); real observed qualifying windows
  topped out at 366.67ms (Vanni 60), so 750ms is a ~2x margin, not tuned to
  one clip.

## 5. True-athlete vs. false-candidate separation

- **Naive contract** (torso + geometry + corroboration, no displacement
  floor): **UNSAFE**. `tmp/phaseR3B3/false-candidate-evidence.json` — a
  stationary, honest-51.5%-completeness, plausible-torso fixture reaches
  corroboration score ~0.87 and would promote within 2-3 hits.
- **Shipped hybrid contract**: **SAFE**. The identical adversarial fixture,
  run for 30 hits against the real, current, shipped code, never promotes
  via any path (`scripts/phase-r3b3-torso-startup-identity-sanity.py`,
  test 8). Teleport/scale/direction rejections are unchanged and still
  fire regardless of torso completeness (tests 6/7).
- **Known, disclosed, bounded residual risk**: `cumulative_displacement`
  sums step *magnitudes* (a pre-existing property shared with the original
  `MIN_CUMULATIVE_DISPLACEMENT` path, not introduced this phase). A
  candidate drifting consistently in one direction, just under the
  per-frame direction-rejection floor, could in principle cross the reduced
  0.008 floor faster than the original 0.03 floor. This is not
  distinguishable from genuine slow real motion (which the system is not
  designed to reject) and is the same category of risk the original
  mechanism already accepted, just at a lower bar — disclosed, not treated
  as newly introduced or as fully eliminated.

## 6. Whether implementation was justified — CASE A (with corrected numbers)

Justified as a real, safe, generalizable identity-acquisition improvement,
explicitly **not** because it achieves the originally-cited Vanni 60
frame 7/20 symptom (it doesn't — Section 9). Real 4-way comparison
(`tmp/phaseR3B3/contract-comparison.json`):

| Benchmark | Displacement-only | +Strong-pose (R3B-1) | +Torso-only (isolated) | Current (all 3) |
|---|---:|---:|---:|---:|
| Gav | 233.33ms | 233.33ms | 233.33ms | 233.33ms (`cumulative_displacement`) |
| Vanni 60 | 450.0ms | 450.0ms | 400.0ms | **400.0ms** (`torso_corroborated`) |
| Vanni 120 | 66.66ms | 66.66ms | 66.66ms | 66.66ms (`cumulative_displacement`) |
| Vanni 240 | 275.02ms | 12.5ms | 16.67ms | 12.5ms (`strong_pose`, still fastest) |

Zero regression on 3 of 4 benchmarks; a real 50ms (11%) improvement on the
4th.

## 7. Code changed by Claude

`src/lib/biomechanics/mediapipe/runtime/athlete_tracker.py` only:
- New constants: `TORSO_LANDMARK_NAMES`, `TORSO_MIN_SPAN_FRACTION`,
  `TORSO_MIN_CUMULATIVE_DISPLACEMENT`, `TORSO_QUALIFYING_WINDOW_MS`.
- New module functions `_torso_complete(c)`, `_torso_geometry_plausible(c)`.
- `PendingIdentity` gained `torso_qualifying_hit_times` bookkeeping
  (`__init__` + `register_hit`) and a new `ready_via_torso_corroboration()`
  method.
- `AthleteTracker` gained `self.last_promotion_reason` and an
  `identityPromotionReason` field on every `step()` return dict (developer/
  scientific provenance only — `"cumulative_displacement"`,
  `"strong_pose"`, `"torso_corroborated"`, or `None`; never a consumer-
  facing confidence percentage).
- Promotion check extended to a 3-way OR; `ready_to_promote()` and
  `ready_via_strong_pose()` are byte-identical to R3B-1 (tests 15/16).

No `box_tracker.py`, `steps.ts`, or `measurements.ts` changes.

## 8. Tests added

`scripts/phase-r3b3-torso-startup-identity-sanity.py` — **20/20 passing**.
`scripts/phase-r3b3-torso-evidence-analysis.py` and
`scripts/phase-r3b3-contract-comparison.py` (diagnostic, not regression
tests, reusable for a future phase).

## 9. Vanni 60 startup/contact result (primary acceptance case)

Identity lock improves 450ms → 400ms. **Frames 7 (116.67ms) and 20
(333.33ms) remain unsupported either way** — both are far earlier than even
the improved lock time. Frame 20 itself shows no real detection in this
phase's own diagnostic trace (Section 3's disclosed under-detection
caveat applies). The nearest real evidence-bearing frame, 21 (350ms, strong
real ankle/heel/foot-index visibility 0.77-0.84), is now only 50ms outside
the trust window (previously 100ms) — closer, but still not crossed.
Full detail: `tmp/phaseR3B3/vanni60-contact-result.json`.

## 10. Gav result

No change (233.33ms across all 4 configurations) — the existing
displacement path already wins. `tmp/phaseR3B3/gav-contact-result.json`.

## 11. Vanni 120 result

No change (66.66ms across all 4 configurations). `tmp/phaseR3B3/vanni120-result.json`.

## 12. Vanni 240 result

No change and no new noise (12.5ms, still via `strong_pose`, still the
fastest path). `tmp/phaseR3B3/vanni240-control.json`.

## 13. Day-100 false-positive result

Naive contract: fails (would promote). Shipped hybrid contract: **passes**
— never promotes across 30 hits. Teleport/scale rejections unchanged.
`tmp/phaseR3B3/day100-control.json`.

## 14. Acquisition latency before/after

See table in Section 6 and `tmp/phaseR3B3/startup-latency-before-after.json`.

## 15. Legitimate scientific output changes

None directly measured this phase — `steps.ts`/`box_tracker.py`/
`measurements.ts` were not modified or rerun; a full production worker
rerun (would write real analysis records) was deliberately not performed,
the same disclosed choice R3B-1 made. `tmp/phaseR3B3/scientific-before-after.json`.

## 16. Regressions

None found. All 13 prior Python regression suites re-run clean (athlete-
tracker-sanity, box-tracker-sanity + frozen-track + teleport, cross-athlete-
coast-risk-sanity, cross-fps-coast-scope-sanity, athlete-interior-feature-
selection-sanity, box-tracker-crop-provenance-sanity, skeleton-ownership-
sanity, vanni-240-source-adjudication-sanity, detector-event-plausibility-
sanity, phase-r3b1-startup-localization-sanity (20/20), phase-r3b2-full-
fidelity-audit-sanity (13/13)). `npm run typecheck` and `npm run lint` both
clean (expected — zero TypeScript files touched). `npm run build` was
**not** run — judged unnecessary (a Python-only change cannot affect the
Next.js build) and avoided disrupting the two dev servers already running
in this environment; disclosed rather than silently skipped.

## 17. Exact next recommendation

The identity-acquisition-latency lever is now largely exhausted for these 4
benchmarks (R3B-1/R3B-2/R3B-3 combined). The real remaining bottleneck for
Vanni 60's specific frame 7/20/21 symptom is evidence recall at the raw
detection layer itself (Section 3's discrepancy finding) — a future phase
should audit why a faithful `tiled_locate()` reimplementation under-detects
relative to real production (likely the missing `hint_x`-guided multi-
candidate search, `TRACKER_NUM_CANDIDATES=3`) using the REAL worker code
path directly, rather than further tuning identity-promotion thresholds.

## 18. Phase status: COMPLETE — narrow implementation shipped

## 19. Current remediation-roadmap status

R3A closed. R3B-1 (strong-pose path) shipped. R3B-2 (audit) complete.
R3B-3 (torso-corroborated path) shipped, safe, modest real benefit (Vanni
60 only). Recommended next step (Section 17) not started.

## 20. Legacy roadmap completion

Not tracked as a percentage this phase.

**STOP AFTER R3B-3.**
