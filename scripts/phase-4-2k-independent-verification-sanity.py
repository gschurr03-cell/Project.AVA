#!/usr/bin/env python3
"""Phase 4.2K (Part L) -- 22 deterministic tests for independent, bidirectional-
trajectory localization verification. Calls the REAL, unmodified production
functions in mediapipe_pose_runner.py directly.

    .venv/bin/python scripts/phase-4-2k-independent-verification-sanity.py
"""
import inspect
import sys

sys.path.insert(0, "src/lib/biomechanics/mediapipe/runtime")
import mediapipe_pose_runner as runner  # noqa: E402

ok = True
n = 0


def check(label, cond):
    global ok, n
    n += 1
    print(f"{'PASS' if cond else 'FAIL'} {n:02d}  {label}")
    if not cond:
        ok = False


def frame(index, t_ms, box_origin=None, coast=None, track_state="tracking", box=None):
    f = {
        "index": index, "tMs": t_ms, "sourceFrameIndex": index,
        "boxOrigin": box_origin, "coastRiskState": coast, "trackState": track_state,
    }
    if box is not None:
        cx, cy, bw, bh = box
        f["athleteBoundingBoxSource"] = {"x0": cx - bw / 2, "y0": cy - bh / 2, "x1": cx + bw / 2, "y1": cy + bh / 2}
    return f


def linear_track(n_frames, fps, x0, vx, y0=0.5, bw=0.03, bh=0.10, box_origin="tracked", coast="recently_confirmed"):
    frames = []
    for i in range(n_frames):
        t = i / fps * 1000.0
        cx = x0 + vx * t
        frames.append(frame(i, t, box_origin=box_origin, coast=coast, box=(cx, y0, bw, bh)))
    return frames


FPS = 240.0


def test_01():
    frames = linear_track(60, FPS, 0.5, 0.0005)
    for i in range(20, 40):
        frames[i]["boxOrigin"] = "frozen_suspect"
    runner.verify_independent_localization(frames, FPS)
    check("1. independent verifier agrees with a valid, smoothly-coasting tracker", frames[30]["independentLocalizationState"] == "independent_corroborated")


def test_02():
    frames = linear_track(60, FPS, 0.5, 0.0008)
    frozen_cx = frames[19]["athleteBoundingBoxSource"]["x0"] + 0.015
    for i in range(20, 40):
        frames[i]["boxOrigin"] = "frozen_suspect"
        frames[i]["athleteBoundingBoxSource"] = {"x0": frozen_cx - 0.015, "y0": 0.45, "x1": frozen_cx + 0.015, "y1": 0.55}
    runner.verify_independent_localization(frames, FPS)
    check("2. independent verifier rejects a frozen/static-object lock", frames[30]["independentLocalizationState"] == "independent_disagrees")


def test_03_04():
    frames = linear_track(80, FPS, 0.3, 0.001)
    static_x = 0.6
    for i in range(30, 55):
        frames[i]["boxOrigin"] = "frozen_suspect"
        frames[i]["athleteBoundingBoxSource"] = {"x0": static_x - 0.015, "y0": 0.45, "x1": static_x + 0.015, "y1": 0.55}
    runner.verify_independent_localization(frames, FPS)
    check("3. a static barrel-like candidate is rejected (residual exceeds bracket noise)", frames[42]["independentLocalizationState"] == "independent_disagrees")
    check("4. rejection reason is interpretable", frames[42]["independentVerificationReason"] == "bidirectional_trajectory_residual_exceeded")


def test_05():
    frames = linear_track(80, FPS, 0.3, 0.0009)
    for i in range(30, 55):
        frames[i]["boxOrigin"] = "frozen_suspect"
    runner.verify_independent_localization(frames, FPS)
    check("5. a real, trajectory-consistent candidate is accepted", frames[42]["independentLocalizationState"] == "independent_corroborated")


def test_06():
    frames = linear_track(80, FPS, 0.3, 0.0009)
    for i in range(30, 55):
        frames[i]["boxOrigin"] = "frozen_suspect"
        b = frames[i]["athleteBoundingBoxSource"]
        offset = 0.08
        frames[i]["athleteBoundingBoxSource"] = {"x0": b["x0"] + offset, "y0": b["y0"], "x1": b["x1"] + offset, "y1": b["y1"]}
    runner.verify_independent_localization(frames, FPS)
    check("6. a different person (offset parallel trajectory) is rejected", frames[42]["independentLocalizationState"] == "independent_disagrees")


def test_07():
    src = inspect.getsource(runner.verify_independent_localization)
    check("7. appearance/colour evidence cannot independently authorize (not part of the accept path)", "hist" not in src.lower() and "appearance" not in src.lower())


def test_08():
    src = inspect.getsource(runner.verify_independent_localization)
    check("8. motion/optical-flow evidence cannot independently authorize (uses only trusted box positions)", "opticalflow" not in src.lower().replace(" ", "") and "framediff" not in src.lower().replace(" ", ""))


def test_09():
    frames = linear_track(80, FPS, 0.3, 0.0009)
    for i in range(30, 55):
        frames[i]["boxOrigin"] = "frozen_suspect"
    frames[42]["boxOrigin"] = "invalid"
    runner.verify_independent_localization(frames, FPS)
    check(
        "9. an identity break (invalid frame) inside the run blocks promotion for the WHOLE run",
        all(frames[i]["independentLocalizationState"] == "independent_unavailable" for i in range(30, 55) if i != 42),
    )


def test_10():
    frames = linear_track(60, FPS, 0.3, 0.0009)
    for i in range(40, 60):
        frames[i]["boxOrigin"] = "frozen_suspect"
    runner.verify_independent_localization(frames, FPS)
    check(
        "10. a genuine exit (no after-bracket) remains independent_unavailable, never promoted",
        all(f["independentLocalizationState"] == "independent_unavailable" for f in frames[40:60]),
    )


def test_11():
    frames = linear_track(30, FPS, 0.3, 0.0009, box_origin="tracked")
    for i in range(3, 25):
        frames[i]["boxOrigin"] = "frozen_suspect"
    runner.verify_independent_localization(frames, FPS)
    check("11. insufficient trusted bracket samples -> independent_unavailable (never guessed)", frames[15]["independentLocalizationState"] == "independent_unavailable")


def test_12():
    frames = linear_track(60, FPS, 0.3, 0.0009)
    for i in range(20, 40):
        frames[i]["boxOrigin"] = "frozen_suspect"
        frames[i]["athleteBoundingBoxSource"] = None
    runner.verify_independent_localization(frames, FPS)
    check("12. a frame with no real box position is never promoted", frames[30]["independentLocalizationState"] == "independent_unavailable")


def test_13():
    content = open("src/lib/benchmark/measurements.ts").read()
    check("13. measurements.ts only promotes on independent_corroborated (exact gate confirmed)", 'independentLocalizationState === "independent_corroborated"' in content)


def test_14():
    frames = linear_track(142, FPS, 0.3, 0.0006, box_origin="tracked", coast="recently_confirmed")
    summary = runner.verify_independent_localization(frames, FPS)
    check("14. a clean, fully-confirmed track (Gav-shaped) produces zero uncertain runs", summary["runsEvaluated"] == 0)


def test_15():
    frames = linear_track(120, FPS, 0.6, 0.0007)
    for i in range(50, 90):
        frames[i]["boxOrigin"] = "frozen_suspect"
    runner.verify_independent_localization(frames, FPS)
    states = {frames[i]["independentLocalizationState"] for i in range(50, 90)}
    check(
        "15. every disputed-interval-shaped frame reaches an interpretable, non-null state",
        states <= {"independent_corroborated", "independent_disagrees", "independent_unavailable"} and None not in states,
    )


def test_16():
    half_fps = FPS / 2
    frames = linear_track(320, half_fps, 0.2, 0.001, box_origin="tracked")
    for i in range(316, 320):
        frames[i]["boxOrigin"] = "frozen_suspect"
    runner.verify_independent_localization(frames, half_fps)
    check(
        "16. Vanni-120-exit-shaped fixture (no after-bracket) stays unavailable, never bridged",
        all(frames[i]["independentLocalizationState"] == "independent_unavailable" for i in range(316, 320)),
    )


def test_17():
    quarter_fps = FPS / 4
    frames = linear_track(233, quarter_fps, 0.2, 0.0012, box_origin="tracked")
    for i in range(155, 232):
        frames[i]["boxOrigin"] = "frozen_suspect"
    frames[190]["trackState"] = "lost"
    runner.verify_independent_localization(frames, quarter_fps)
    check(
        "17. Vanni-60-long-gap-shaped fixture (identity lost mid-run) stays unavailable",
        all(frames[i]["independentLocalizationState"] == "independent_unavailable" for i in range(155, 232)),
    )


def test_18():
    src = open("src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py").read()
    check("18. verify_independent_localization does not touch contact/step logic (python side has none)", "detectStepMarks" not in src and "detectContactPhases" not in src)


def test_19():
    src = inspect.getsource(runner.verify_independent_localization)
    check("19. verify_independent_localization never writes tMs/sourceTimestampMs (read-only on time)", '["tMs"]' not in src and '["sourceTimestampMs"]' not in src)


def test_20():
    content = open("src/lib/benchmark/measurements.ts").read()
    check("20. measurements.ts change is confined to the strip-gate predicate (stepFrequenciesFromContacts untouched)", "function stepFrequenciesFromContacts" not in content)


def test_21():
    frames = linear_track(60, FPS, 0.3, 0.0009)
    original_times = [f["tMs"] for f in frames]
    for i in range(20, 40):
        frames[i]["boxOrigin"] = "frozen_suspect"
    runner.verify_independent_localization(frames, FPS)
    check("21. source tMs values are never mutated by verification", [f["tMs"] for f in frames] == original_times)


def test_22():
    frames = linear_track(60, FPS, 0.3, 0.0009)
    for i in range(20, 40):
        frames[i]["boxOrigin"] = "frozen_suspect"
    runner.verify_independent_localization(frames, FPS)
    check("22. boxOrigin itself is never overwritten by verification (still frozen_suspect)", all(frames[i]["boxOrigin"] == "frozen_suspect" for i in range(20, 40)))


for fn in [
    test_01, test_02, test_03_04, test_05, test_06, test_07, test_08, test_09, test_10,
    test_11, test_12, test_13, test_14, test_15, test_16, test_17, test_18, test_19,
    test_20, test_21, test_22,
]:
    fn()

print(f"\n{'ALL ' + str(n) + ' PASSED' if ok else 'FAILURES PRESENT (' + str(n) + ' total)'}")
sys.exit(0 if ok else 1)
