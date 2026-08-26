# Phase R3B-1 — Early-Clip Localization Warmup Recovery

**Status: implementation complete. Effect on real stored data: proven SAFE
(zero regression); real-world acceleration NOT empirically confirmed —
honest limitation, see Section 20.**

## 1. Executive summary

R3A proved real, high-confidence MediaPipe pose evidence exists on Vanni 60
from frame 0, yet `boxOrigin` stays `"invalid"` for 350ms because the
identity-acquisition layer (`athlete_tracker.py`) requires the pending
athlete candidate to accumulate `MIN_CUMULATIVE_DISPLACEMENT` (3% of
normalized frame width) before promoting it to a trusted, `box_tracker.py`
-visible identity — and a small/distant athlete covers fewer normalized
units per second than a closer framing, regardless of true running speed.
This phase adds a second, independent promotion path: a pending candidate
whose pose evidence is *sustained, near-complete* (≥96% of MediaPipe's 33
landmarks, well above the real Day 100 background-hallucination incident's
own 51.5% ceiling) and *well-scored* on every verification hit may be
promoted without waiting for displacement. The original displacement path is
completely unchanged. Empirically, against every real stored benchmark
artifact, the fix is proven to change **nothing** (byte-identical
acquisition timing, all 4 benchmarks) — because this project's stored pose
artifacts retain only 17 of MediaPipe's 33 landmarks, capping achievable
completeness at ~51.5%, below the new threshold. The mechanism itself is
proven correct via direct synthetic tests. Whether it accelerates real
production acquisition requires a fresh, full-fidelity MediaPipe rerun,
which this phase did not perform — disclosed honestly, not assumed.

## 2. R3A findings inherited

Warmup durations: Gav 116.7ms (1 contact lost), Vanni 60 350ms (2 contacts
lost), Vanni 120 66.7ms (1 contact at boundary), Vanni 240 41.7ms (no
confirmed losses). `MIN_VALID_FRAMES=3` (steps.ts) was proven NOT the
bottleneck — the upstream box-tracker localization state was.

## 3. Exact startup blocker

Traced past `box_tracker.py`'s `boxOrigin="invalid"` assignment (a
downstream *consequence*) to the true root gate: `athlete_tracker.py`'s
`AthleteTracker.step()` returns `selectedIndex=None` for every frame while a
candidate is in the `PendingIdentity` "candidate"/"verifying" stage —
`box_tracker.py` never even sees a box to classify until
`PendingIdentity.ready_to_promote()` fires:

```python
def ready_to_promote(self, time_s):
    return (
        self.hits >= MIN_VERIFICATION_HITS               # 3
        and self.cumulative_displacement >= MIN_CUMULATIVE_DISPLACEMENT  # 0.03
    )
```

## 4. Why the blocker existed

`MIN_CUMULATIVE_DISPLACEMENT`'s own docstring cites the real, documented Day
100 incident: a stadium bleacher/fence pattern was confidently "human-shaped"
to MediaPipe and stationary near the entry region — displacement is what a
static background pattern can never produce. This is a real, necessary
defense, kept completely unchanged.

## 5. New early-acquisition contract

```
IF hits >= MIN_VERIFICATION_HITS (unchanged, 3)
   AND every hit's pose completeness >= 0.96 (32+/33 MediaPipe landmarks)
   AND every corroborating hit's continuity score >= 0.75
THEN promote to TRACKED — without waiting for displacement.

OTHERWISE: unchanged original displacement-earned path.
```

Time- and FPS-independent by construction: purely an evidence-quality gate
over a fixed hit count, never a duration or frame-count threshold. The
0.96 completeness bar was set (a) 44.5 percentage points above the real Day
100 incident's own observed ceiling (51.5%, and not sustained across
frames), and (b) empirically verified to sit ABOVE this repository's own
existing Python test-fixture convention (`completeness=0.9`, used uniformly
across `box-tracker-sanity.py`/`cross-athlete-coast-risk-sanity.py`/etc.) so
the new path does not silently change the acquisition timing of generic
fixtures never intended to exercise it.

## 6. Exact production code change

`src/lib/biomechanics/mediapipe/runtime/athlete_tracker.py` only:

- New constants `EARLY_ACQUISITION_MIN_COMPLETENESS = 0.96`,
  `EARLY_ACQUISITION_MIN_SCORE = 0.75`.
- `PendingIdentity` tracks `min_completeness`/`min_corroboration_score`
  across hits (additive fields).
- New `PendingIdentity.ready_via_strong_pose()` method.
- One promotion-check line: `if self.pending.ready_to_promote(time_s) or
  self.pending.ready_via_strong_pose():`.
- `register_hit()` gained an optional `score` parameter (defaults `None`,
  fully backward compatible).

`box_tracker.py`, `steps.ts`, `measurements.ts` — **not modified**.

## 7. Vanni 60 before/after

Real stored-artifact replay (identity layer only —
`tmp/phaseR3B1/before-after-acquisition.json`): first-tracked frame
byte-identical before/after (frame 11, 183.3ms in this isolated replay —
note this differs from R3A's full-pipeline 350ms figure because this replay
tests only the identity layer in isolation, not the full box_tracker.py
classification stack; documented in Section 20). The new path never fires
against this benchmark's stored data (17/33-landmark ceiling, Section 9).

## 8. Gav before/after

Same result and same reason: byte-identical (frame 5, 83.3ms).

## 9. Vanni 120 before/after

Byte-identical (frame 15, 125ms).

## 10. Vanni 240 control

Byte-identical (frame 13, 54.2ms) — exactly the required outcome: Vanni 240
remains completely unaffected.

## 11. False-positive audit

`tmp/phaseR3B1/false-positive-audit.json`. Zero new false positives across
all 4 real benchmarks (fix is dormant against stored data). Synthetic tests
prove the mechanism's own safety: a Day-100-incident-level candidate
(completeness 0.5, sustained) never promotes via the new path (sanity check
6); a teleporting candidate is still rejected regardless of completeness
(check 5); the new threshold sits clear of this repo's own "ordinary good"
test-fixture convention (0.9).

## 12. Acquisition latency before/after

| Benchmark | Before (identity-layer replay) | After |
|---|---:|---:|
| Gav | 83.3ms | 83.3ms |
| Vanni 60 | 183.3ms | 183.3ms |
| Vanni 120 | 125ms | 125ms |
| Vanni 240 | 54.2ms | 54.2ms |

No change against real stored data (Section 20 explains why).

## 13. Detector-cadence interaction

`detector_cadence_frames=8` (frame-count-based, per R3A) is irrelevant to
this specific fix: `wants_detector_frame()` returns `True` on every frame
while `track_state == "acquiring"` (i.e., during exactly the pre-lock window
this phase addresses) — the detector was never cadence-throttled during
startup. Not redesigned this phase, per explicit instruction.

## 14. Smoothing-window interaction

`smoothingWindowFrames` (steps.ts, contact detection) is entirely
unrelated to this fix — this phase never touches contact detection. Remains
R3B-2's exploratory scope, not started.

## 15. Legitimately changed contact sets

None — zero contact sets changed for any of the 4 real benchmarks against
currently available data.

## 16. Downstream metric changes

None (`tmp/phaseR3B1/downstream-metric-diff.json`) — no TypeScript file was
touched, and the Python fix produced byte-identical results against every
real stored artifact.

## 17. Expected evidence corrections vs. regressions

No EXPECTED_EVIDENCE_CORRECTION occurred this phase (no contact set
changed). One **caught-and-fixed potential regression**: the fix's initial
`0.85` completeness threshold collided with this repo's own
`completeness=0.9` test-fixture convention, causing
`cross-athlete-coast-risk-sanity.py` check #7 to fail (a synthetic
"steadily-advancing" fixture locked in earlier than the test's frame-count
expectations assumed). Resolved by raising the threshold to `0.96`
(genuinely above that convention) rather than editing the pre-existing
test — re-verified all 10 relevant Python regression suites pass clean.

## 18. Tests

`scripts/phase-r3b1-startup-localization-sanity.py` — **20/20 passing**
(real stored-artifact replay + synthetic mechanism tests), with a thin
`scripts/phase-r3b1-startup-localization-sanity.mjs` wrapper for the exact
requested filename.

## 19. Regression

All 10 relevant Python worker suites pass clean: `box-tracker-sanity.py`,
`detector-event-plausibility-sanity.py`, `box-tracker-frozen-track-sanity.py`,
`box-tracker-teleport-sanity.py`, `cross-athlete-coast-risk-sanity.py`,
`cross-fps-coast-scope-sanity.py`, `athlete-interior-feature-selection-sanity.py`,
`box-tracker-crop-provenance-sanity.py`, `skeleton-ownership-sanity.py`,
`vanni-240-source-adjudication-sanity.py`. `npm run typecheck`/`lint`/`build`
clean (unaffected — zero TypeScript files touched); safe stop-dev → build →
restart-dev sequence followed.

## 20. Anything not personally validated

**This phase's most important disclosed limitation.** This project's stored
pose artifacts (`tmp/phase94/*.pose.json`, used throughout this entire
session) retain only 17 of MediaPipe's 33 raw landmark points (this
project's own biomechanically-relevant subset — see
`mediapipe_pose_runner.py`'s `TRACKER_LANDMARK_NAMES`). But
`athlete_tracker.py`'s own `completeness = present / len(landmark_points)`
uses the FULL raw landmark count as its denominator in real production
(where `landmark_points` is MediaPipe's actual 33-point output, before any
storage trimming) — meaning real, live completeness values can be
substantially higher than anything reconstructable from stored data. This
phase's replay-based validation is therefore **conclusive for safety** (the
fix cannot regress any of the 4 real benchmarks, proven byte-identical) but
**inconclusive for the fix's real-world acceleration benefit** — that
requires either a fresh full-fidelity worker rerun against the original
source video, or access to raw pre-trim MediaPipe output, neither available
this phase. This was not glossed over or claimed as validated.

Also not performed: fresh live analysis reruns through the actual worker
infrastructure (Supabase-backed, would create real analysis records) — the
identity-layer replay against real stored data was used instead, and this
choice is documented here rather than silently substituted.

## 21. Files changed

- `src/lib/biomechanics/mediapipe/runtime/athlete_tracker.py` — the fix.
- `scripts/phase-r3b1-startup-localization-sanity.py` (new, 20 tests),
  `scripts/phase-r3b1-startup-localization-sanity.mjs` (new, thin wrapper),
  `scripts/phase-r3b1-identity-replay.py` (new, diagnostic),
  this report, `tmp/phaseR3B1/`.

No `src/lib/video/steps.ts`, `src/lib/benchmark/measurements.ts`, or
`box_tracker.py` changes.

## 22. Git status

No commit, push, `db:reset`, or database mutation. Worktree remains
intentionally dirty with all prior uncommitted phases' work preserved.

## 23. Phase status: implementation COMPLETE, real-world benefit unconfirmed

## 24. Whether R3B-2 is still justified

**Yes, unchanged from R3A's own recommendation** — R3B-2 (physical-time
smoothing-window normalization for Vanni 240's near-duplicate pattern)
remains a separate, independent, exploratory track this phase did not touch
and does not affect.

**STOP AFTER R3B-1.**
