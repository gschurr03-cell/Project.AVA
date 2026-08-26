#!/usr/bin/env python3
"""Phase 1 (Stationary Sprint Analysis Roadmap v4.0) — deterministic checks for the
classify_fps()/src_fps fix in mediapipe_pose_runner.py.

Root cause proven this phase: a container's `avg_frame_rate` tag can be wrong for a
real VFR HEVC recording (vanni_fly_240: reported 223.926 while every decoded frame's
own timestamp proved ~239.98). The timing pipeline itself was never affected — it
already consumes real per-frame source timestamps directly — but the descriptive
`analysisFps`/`source_fps` label was wrong, and initially fixing only `classify_fps()`
opened a NEW artifact self-consistency gap (`fps` vs `sourceMetadata.fps`) caught by
a real worker rerun. These tests pin both the fix and its scoping.

    python3 scripts/native-fps-timestamp-sanity.py
"""
import sys
sys.path.insert(0, "src/lib/biomechanics/mediapipe/runtime")
import mediapipe_pose_runner as r  # noqa: E402

ok = True


def check(label, cond):
    global ok
    print(("PASS  " if cond else "FAIL  ") + label)
    if not cond:
        ok = False


# Real, live-verified evidence for all 4 registered stationary benchmarks
# (validation/stationary-validation-registry.json, Phase 0/1).
GAV_60 = {"averageFps": 59.15864276221215, "nominalFps": 60, "realFps": 59.999991549296965, "timestampFps": 59.998800023999564}
VANNI_60 = {"averageFps": 56.53006510915358, "nominalFps": 60, "realFps": 63.130875694535874, "timestampFps": 59.998800023999564}
VANNI_120 = {"averageFps": 108.30686946347986, "nominalFps": 120, "realFps": 133.88430858548006, "timestampFps": 120.00480019200718}
VANNI_240 = {"averageFps": 223.92638036809817, "nominalFps": 2400, "realFps": 257.0422535211268, "timestampFps": 239.98080153588808}


def resynced_src_fps(evidence, fallback):
    cls, _reason, fps = r.classify_fps(evidence, fallback)
    src_fps = fallback
    if cls == "native_source_class":
        src_fps = fps
    return cls, fps, src_fps


# 1. Real per-frame timestamp evidence overrides a disagreeing native-rate container average.
cls, fps, _ = resynced_src_fps(VANNI_240, VANNI_240["averageFps"])
check("vanni_240: native_source_class prefers timestampFps over a disagreeing averageFps", cls == "native_source_class" and abs(fps - 239.981) < 0.001)

# 2. Same for the 120fps clip (supporting architecture evidence — Phase 3's subject, not rerun this phase).
cls, fps, _ = resynced_src_fps(VANNI_120, VANNI_120["averageFps"])
check("vanni_120: native_source_class prefers timestampFps over a disagreeing averageFps", cls == "native_source_class" and abs(fps - 120.005) < 0.001)

# 3. No regression: validated_60_fps_class classification is untouched by the fix.
cls, fps, _ = resynced_src_fps(GAV_60, GAV_60["averageFps"])
check("gav_60: still validated_60_fps_class at exactly 60", cls == "validated_60_fps_class" and fps == 60)

cls, fps, _ = resynced_src_fps(VANNI_60, VANNI_60["averageFps"])
check("vanni_60: still validated_60_fps_class at exactly 60 (timestamp+metadata path unchanged)", cls == "validated_60_fps_class" and fps == 60)

# 4. No regression: src_fps re-sync is scoped to native_source_class only — a validated-60/
#    experimental-30 clip's src_fps (used as the real-timestamp monotonicity fallback) must
#    keep its own real average, not silently become exactly 60/30.
_, _, src_fps_gav = resynced_src_fps(GAV_60, GAV_60["averageFps"])
check("gav_60: src_fps stays the real container average (59.158...), not resynced to 60", abs(src_fps_gav - 59.15864276221215) < 1e-9)

_, _, src_fps_vanni60 = resynced_src_fps(VANNI_60, VANNI_60["averageFps"])
check("vanni_60: src_fps stays the real container average (56.530...), not resynced to 60", abs(src_fps_vanni60 - 56.53006510915358) < 1e-9)

# 5. The artifact self-consistency invariant analysis-worker.mjs#buildResultFoundation
#    enforces (`sequence.fps` must equal `sequence.sourceMetadata.fps` within 0.01 for a
#    native-rate clip) — this is exactly what broke on the first real Phase 1 rerun attempt
#    before the src_fps re-sync was added; pin it so it can never silently regress again.
for name, evidence in (("vanni_240", VANNI_240), ("vanni_120", VANNI_120)):
    cls, fps, src_fps = resynced_src_fps(evidence, evidence["averageFps"])
    check(f"{name}: fps == src_fps after resync (artifact self-consistency, matches buildResultFoundation)", abs(fps - src_fps) < 0.01)

# 6. No spurious override when timestamp evidence already agrees with the container average
#    (a clean native-rate clip with no VFR container-metadata quirk must keep its own rate
#    verbatim, not be perturbed by floating-point noise in the 1% comparison).
CLEAN_90 = {"averageFps": 90.0, "nominalFps": 90, "realFps": 90.0, "timestampFps": 90.01}
cls, fps, src_fps = resynced_src_fps(CLEAN_90, CLEAN_90["averageFps"])
check("clean 90fps clip (no conflict): fps stays 90.0, unperturbed", cls == "native_source_class" and fps == 90.0 and src_fps == 90.0)

# 7. Missing timestamp evidence never crashes and safely falls back to the container average
#    (a corrupted/short probe read, or a container with no decodable frames for the sample).
NO_TIMESTAMPS = {"averageFps": 223.9, "nominalFps": 2400, "realFps": 257.0, "timestampFps": None}
cls, fps, src_fps = resynced_src_fps(NO_TIMESTAMPS, NO_TIMESTAMPS["averageFps"])
check("no timestamp evidence available: falls back to averageFps without crashing", cls == "native_source_class" and fps == 223.9 and src_fps == 223.9)

# 8. Real production rerun evidence (Phase 1, 2026-08-04): the fix changed vanni_fly_240's
#    stored source_fps/analysis_fps from 223.926 to 239.981 but reproduced the EXACT same
#    zoneTimeS/step-length/velocity metrics as the original — pinned here as a literal
#    regression guard on the two DB-recorded fps columns for the live analysis row.
check(
    "vanni_240 real rerun evidence: 223.926 -> 239.981 is the exact, expected correction",
    abs(239.981 - resynced_src_fps(VANNI_240, VANNI_240["averageFps"])[1]) < 0.001,
)

print()
print("ALL PASSED" if ok else "FAILURES PRESENT")
sys.exit(0 if ok else 1)
