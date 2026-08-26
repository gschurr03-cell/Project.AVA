#!/usr/bin/env python3
"""Regression tests for Phase 4.2D (2026-08-06) — segment-aware crop
planning (`_partition_crop_segments`, `_segment_local_track`,
`_segment_aware_moving_avg`, `plan_crops`) in mediapipe_pose_runner.py.

This fixture is entirely SYNTHETIC (no real athlete video data — Vanni 240
is a private benchmark clip and is never checked into the repo). It is
built to reproduce, in miniature, the exact SHAPE of the real Vanni 240
regression this phase fixed: a trusted approach segment, a long excluded
(frozen_suspect) span in the middle that must NOT be allowed to distort
either trusted segment's own local fit, an isolated single-frame spurious
detection inside that span, a genuine `reacquired` boundary starting the
second trusted segment, a short bridgeable gap inside that segment, and
leading/trailing clip-edge (pre-approach / post-finish) context with no
evidence at all. Real production numbers (Gav/Vanni120/Vanni240/Vanni60
reruns) are reported in docs/phase-4-2d-segment-aware-crop-planning.md;
this fixture proves the ALGORITHM's properties directly and
deterministically, independent of any live database or captured pose
artifact.

Required elements (8) built into the fixture below:
  1. A pre-gap trusted segment (frames 20-79) with a real local linear
     trend (cx increasing 5px/frame).
  2. A long excluded span (frames 80-259, boxes[i] is None outside the
     isolated detection) simulating the frozen_suspect frames Phase 4.2C
     already excludes upstream before plan_crops ever sees them.
  3. A post-gap trusted segment (frames 260-399) whose own local trend
     DISAGREES with segment 1's not just in magnitude but in SIGN (cx
     decreasing 4px/frame) — proves no single line could fit both.
  4. A `reacquired` origin marking the start of segment 3 (frame 260),
     alongside routine `detected` refreshes inside a continuous run
     (proves routine `detected` refreshes do not fragment a segment, only
     `reacquired` does).
  5. A short (bridgeable) internal gap inside segment 3 (frames 320-322).
  6. Leading clip-edge frames (0-19, before segment 1's first box) with no
     evidence at all.
  7. Trailing clip-edge / post-finish frames (400-459, after segment 3's
     last box) with no evidence at all.
  8. A single isolated, wildly-implausible spurious detection (frame 170,
     deep inside the excluded span, far enough from both trusted segments
     to form its own one-point segment) — used to prove an isolated bad
     detection cannot distort either real trusted segment's own fit.

    .venv/bin/python scripts/crop-segment-planning-sanity.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src/lib/biomechanics/mediapipe/runtime"))
import mediapipe_pose_runner as mpr  # noqa: E402

ok = True


def check(label, cond):
    global ok
    print(("PASS  " if cond else "FAIL  ") + label)
    if not cond:
        ok = False


W, H = 1920, 1080
FPS = 240.0

SEG1_LO, SEG1_HI = 20, 79
ISO_IDX = 170  # element 8: isolated spurious detection, deep in the excluded span
SEG2_LO, SEG2_HI = 260, 399
SEG2_GAP_LO, SEG2_GAP_HI = 320, 322  # element 5: short bridgeable internal gap
N = 460  # frames 400..459 are trailing/post-finish (element 7); 0..19 leading (element 6)

boxes = [None] * N
origins = [None] * N

for i in range(SEG1_LO, SEG1_HI + 1):
    t = i - SEG1_LO
    boxes[i] = (300.0 + 5.0 * t, 500.0, 80.0, 180.0)
    origins[i] = "detected" if i % 8 else "tracked"  # element 4: routine detected refreshes

boxes[ISO_IDX] = (5000.0, 300.0, 40.0, 40.0)  # implausible position, far off either trend
origins[ISO_IDX] = "detected"

for i in range(SEG2_LO, SEG2_HI + 1):
    if SEG2_GAP_LO <= i <= SEG2_GAP_HI:
        continue
    t = i - SEG2_LO
    boxes[i] = (1200.0 - 4.0 * t, 520.0, 120.0, 260.0)
    origins[i] = "reacquired" if i == SEG2_LO else ("detected" if i % 8 else "tracked")

max_bridge_gap_frames = max(1, round(mpr.MAX_BRIDGE_GAP_MS / 1000.0 * FPS))
segments = mpr._partition_crop_segments(boxes, origins, max_bridge_gap_frames)
raw, seg_id = mpr._segment_local_track(boxes, segments, N)
track = mpr._segment_aware_moving_avg(raw, seg_id, segments, mpr.ROI_SMOOTH_WINDOW)
crops, _ = mpr.plan_crops(boxes, W, H, FPS, direction_sign=1, confidences=None, origins=origins)

check("fixture sanity: N frames of crops returned", len(crops) == N)

# --- Property 1: partitioning finds all three real segments ---------------
check("1. exactly three segments found (approach, isolated spurious point, fly-zone)", len(segments) == 3)
check("1b. segment 1 spans exactly the approach run, unfragmented by internal `detected` refreshes", segments[0][0] == SEG1_LO and segments[0][-1] == SEG1_HI)
check("1c. segment 2 is exactly the isolated spurious detection, alone", segments[1] == [ISO_IDX])
check("1d. segment 3 starts at the reacquired frame and spans the fly-zone run", segments[2][0] == SEG2_LO and segments[2][-1] == SEG2_HI)

# --- Property 2: whole-clip global fit is mathematically worse than the ---
# two real segments' own local fits (Part 3's required mathematical proof).
valid_idx = [i for i, b in enumerate(boxes) if b is not None]
gslope, gint = mpr._lin_fit(valid_idx, [boxes[i][0] for i in valid_idx])
seg1_idx = list(range(SEG1_LO, SEG1_HI + 1))
seg2_idx = [i for i in range(SEG2_LO, SEG2_HI + 1) if boxes[i] is not None]
s1, i1 = mpr._lin_fit(seg1_idx, [boxes[i][0] for i in seg1_idx])
s2, i2 = mpr._lin_fit(seg2_idx, [boxes[i][0] for i in seg2_idx])
rss_global = sum((boxes[i][0] - (gslope * i + gint)) ** 2 for i in valid_idx)
rss_local = sum((boxes[i][0] - (s1 * i + i1)) ** 2 for i in seg1_idx) + sum((boxes[i][0] - (s2 * i + i2)) ** 2 for i in seg2_idx)
check("2. the two real segments' own local linear fits are exact (residual sum of squares == 0)", rss_local == 0.0)
check("2b. one whole-clip global fit has a large, non-zero residual against the same real data (mathematical proof it cannot represent both regimes)", rss_global > 1_000_000.0)
check("2c. the two segments' true local slopes disagree even in SIGN (approach vs fly-zone), the failure mode one straight line cannot represent at all", s1 > 0 and s2 < 0)

# --- Property 3: an isolated bad detection cannot distort either segment --
boxes_no_iso = list(boxes)
boxes_no_iso[ISO_IDX] = None
origins_no_iso = list(origins)
origins_no_iso[ISO_IDX] = None
crops_no_iso, _ = mpr.plan_crops(boxes_no_iso, W, H, FPS, direction_sign=1, confidences=None, origins=origins_no_iso)
check("3. segment 1's planned crops are byte-identical with or without the isolated spurious detection", crops[SEG1_LO:SEG1_HI + 1] == crops_no_iso[SEG1_LO:SEG1_HI + 1])
check("3b. segment 3's planned crops are byte-identical with or without the isolated spurious detection", crops[SEG2_LO:SEG2_HI + 1] == crops_no_iso[SEG2_LO:SEG2_HI + 1])

# --- Property 4: long internal gaps hold flat at the nearest segment's ----
# edge (a bounded step), never a fabricated ramp between unrelated regimes.
gap_before_iso = [raw[i][0] for i in range(SEG1_HI + 1, ISO_IDX)]
gap_after_iso = [raw[i][0] for i in range(ISO_IDX + 1, SEG2_LO)]
check("4. the gap between segment 1 and the isolated point is a bounded 2-value nearest-edge step, not a many-valued fabricated ramp", len(set(round(v, 3) for v in gap_before_iso)) == 2)
check("4b. the gap between the isolated point and segment 3 is a bounded 2-value nearest-edge step, not a many-valued fabricated ramp", len(set(round(v, 3) for v in gap_after_iso)) == 2)
check("4c. the held value before the isolated point is exactly segment 1's real last value (595.0), not a fabricated blend", gap_before_iso[0] == 595.0)
check("4d. the held value after the isolated point is exactly the isolated point's own real value (5000.0), not a fabricated blend", gap_after_iso[0] == 5000.0)

# --- Property 5: short internal gap inside segment 3 IS bridged locally ---
bridged = [raw[i][0] for i in range(SEG2_GAP_LO, SEG2_GAP_HI + 1)]
expected = [1200.0 - 4.0 * (i - SEG2_LO) for i in range(SEG2_GAP_LO, SEG2_GAP_HI + 1)]
check("5. the short internal segment-3 gap is bridged exactly along segment 3's own local trend", bridged == expected)

# --- Property 6: clip edges extrapolate (not a flat hold) -----------------
leading = [raw[i][0] for i in range(0, SEG1_LO)]
check("6. leading clip edge (before any evidence) extrapolates segment 1's own trend", len(set(round(v, 3) for v in leading)) > 1)
check("6b. leading edge extrapolation lands exactly on segment 1's own linear trend at frame 0", raw[0][0] == 300.0 - 5.0 * SEG1_LO)

trailing = [raw[i][0] for i in range(SEG2_HI + 1, N)]
check("7. trailing clip edge / post-finish (after all evidence) extrapolates segment 3's own trend", len(set(round(v, 3) for v in trailing)) > 1)
check("7b. trailing edge extrapolation lands exactly on segment 3's own linear trend at the last frame", raw[N - 1][0] == 1200.0 - 4.0 * (N - 1 - SEG2_LO))

# --- Property 8: post-finish trailing frames cannot influence pre-finish --
# beyond a small, bounded smoothing-window edge (temporal causality
# contract, Part 6/Part 9). The SEGMENTATION and TREND FIT (the actual
# mechanism behind the Vanni 240 regression this phase fixes — see
# Property 2/2b/2c's mathematical proof) have ZERO look-ahead dependency:
# deleting the tail cannot change which segments exist or their local
# fits, proven directly below. The final centered moving-average SMOOTHING
# step has a real, but tightly bounded, edge effect — at most
# `ROI_SMOOTH_WINDOW // 2` trailing frames' smoothed value can differ,
# never anything earlier, and never unboundedly. This bounded edge
# characteristic predates Phase 4.2D (the prior whole-clip design's own
# single moving average had the identical property at the clip's one
# global boundary) and is deliberately left as-is rather than "fixed" at
# the cost of the PROTECTED Gav benchmark's byte-identical baseline — see
# the real, reverted attempt documented in `_segment_aware_moving_avg`'s
# own docstring.
boxes_no_tail = boxes[: SEG2_HI + 1]
origins_no_tail = origins[: SEG2_HI + 1]
segments_no_tail = mpr._partition_crop_segments(boxes_no_tail, origins_no_tail, max_bridge_gap_frames)
check("8. deleting all post-finish trailing frames does not change the segmentation up to that point (zero trend/segment look-ahead)", segments_no_tail == segments)

crops_no_tail, _ = mpr.plan_crops(boxes_no_tail, W, H, FPS, direction_sign=1, confidences=None, origins=origins_no_tail)
half_window = mpr.ROI_SMOOTH_WINDOW // 2
diffs = [i for i in range(SEG2_HI + 1) if crops[i] != crops_no_tail[i]]
check(f"8b. deleting the post-finish tail changes at most the last {half_window} frame(s) — never anything earlier, never unboundedly", len(diffs) <= half_window and all(d > SEG2_HI - half_window for d in diffs))

# --- Determinism, backward compatibility, and containment -----------------
crops_again, _ = mpr.plan_crops(boxes, W, H, FPS, direction_sign=1, confidences=None, origins=origins)
check("9. plan_crops is deterministic (identical input -> byte-identical output)", crops == crops_again)

crops_no_origins, _ = mpr.plan_crops(boxes, W, H, FPS, direction_sign=1, confidences=None)
check("10. omitting `origins` still returns a full, valid crop list (gap-size-only fallback segmentation)", len(crops_no_origins) == N)
segments_fallback = mpr._partition_crop_segments(boxes, None, max_bridge_gap_frames)
check("10b. without origins, the isolated point and the long gaps around it still force 3 segments (gap-size alone is enough here)", len(segments_fallback) == 3)

contained = True
for i in list(range(SEG1_LO, SEG1_HI + 1)) + list(range(SEG2_LO, SEG2_HI + 1)):
    if boxes[i] is None:
        continue
    x0, y0, x1, y1 = crops[i]
    cx_b, cy_b, bw, bh = boxes[i]
    bx0, by0, bx1, by1 = cx_b - bw / 2, cy_b - bh / 2, cx_b + bw / 2, cy_b + bh / 2
    if not (x0 <= bx0 and y0 <= by0 and x1 >= bx1 and y1 >= by1):
        contained = False
        break
check("11. every real (non-excluded) box in both trusted segments stays contained within its planned crop", contained)

print()
if ok:
    print("ALL PASSED")
else:
    print("FAILURES PRESENT")
sys.exit(0 if ok else 1)
