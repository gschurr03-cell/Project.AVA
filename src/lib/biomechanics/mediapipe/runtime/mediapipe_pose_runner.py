#!/usr/bin/env python3
"""MediaPipe Pose runner for Project AVA.

Reads a video (local path or URL) with OpenCV, runs the MediaPipe Pose
Landmarker on each frame, and emits a single JSON document to stdout matching
the `MediaPipePoseResult` schema the TypeScript service validates:

    {"fps", "width", "height", "frames": [
        {"index", "timestampMs", "landmarks": [...], "worldLandmarks": [...]?}
    ]}

Only JSON is written to stdout; all diagnostics go to stderr. Exits nonzero on
any failure. This script is invoked by PythonMediaPipePoseService; it is never
imported by the TypeScript build, so missing Python deps never break the build.

Uses the MediaPipe **Tasks** API (`mediapipe.tasks.python.vision.PoseLandmarker`)
rather than the legacy `mediapipe.solutions.pose`, which is absent from recent
Apple-Silicon wheels. The model bundle is downloaded and cached on first run.
"""

import argparse
import json
import math
import os
import statistics
import subprocess
import sys
import time
import urllib.request

POLICY_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "video", "fpsPolicy.json"))
with open(POLICY_PATH, "r", encoding="utf-8") as policy_file:
    FPS_POLICY = json.load(policy_file)

UNSUPPORTED_FPS_MESSAGE = FPS_POLICY["unsupportedMessage"]

# Classifications where `fps` (the analysis rate) always equals the real source
# rate — every decoded frame is analyzed and keeps its real source timestamp.
# No classification ever silently resamples: every accepted rate lands here.
NATIVE_RATE_FPS_CLASSES = (
    "validated_60_fps_class",
    "experimental_30_fps_class",
    "native_source_class",
    "validated_high_speed_native_class",
)


def ratio(value):
    if not value or value == "0/0":
        return None
    try:
        numerator, denominator = value.split("/", 1)
        result = float(numerator) / float(denominator)
        return result if result > 0 else None
    except (ValueError, ZeroDivisionError):
        return None


def probe_rotation_degrees(video):
    """Read the container's `rotate` stream tag via ffprobe. `cv2.VideoCapture`'s
    own `CAP_PROP_ORIENTATION_META` was found during this audit to be
    unreliable — it intermittently returned nothing even on a bare first read
    of the exact same file, with no code change in between. ffprobe (already
    used elsewhere in this file for FPS evidence, so always on PATH here)
    reads the container's metadata directly and consistently.

    NOTE: an earlier version of this query combined `stream_tags=rotate` with
    `stream_side_data=rotation` in one `-show_entries` value — that combined
    form is invalid for this ffprobe build ("No match for section
    'stream_side_data'") and made the WHOLE command fail non-zero, so this
    probe silently returned None on every real run despite the video's
    `rotate=180` tag being trivially visible in a plain `-show_streams` dump.
    Keep this query to `stream_tags=rotate` alone, confirmed working."""
    cmd = [
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream_tags=rotate",
        "-of", "json", video,
    ]
    try:
        data = json.loads(subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=30).stdout)
        stream = (data.get("streams") or [{}])[0]
        tag_rotate = (stream.get("tags") or {}).get("rotate")
        if tag_rotate is not None:
            return float(tag_rotate)
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError, ValueError, IndexError, KeyError):
        pass
    return None


def rotation_code_for_angle(meta, cv2):
    """Return the cv2.ROTATE_* code needed to correct decoded frames to their
    intended display orientation for a raw `CAP_PROP_ORIENTATION_META` value,
    or None if no correction is needed. Takes `cv2` as a parameter (matching
    this file's existing convention, e.g. `estimate_background_transform`) —
    `import cv2` is local to the main analysis function, so a module-level
    helper has no other access to it. A bare module-level reference here
    caused a real run to fail outright with `NameError: name 'cv2' is not
    defined` during this audit.

    `cv2.VideoCapture.read()` does NOT apply a container's rotation metadata
    (unlike ffmpeg/most video players) — every downstream stage (MediaPipe
    detection, box tracking, cropping, landmark output) would otherwise
    silently operate on a mis-oriented frame. This was found during the Day
    96 audit on a real 240fps clip: the video carried 180-degree rotation
    metadata that was never applied, so MediaPipe was being asked to detect
    an upside-down person in every frame — the real root cause of a near-
    total pose-detection failure despite the athlete being clearly visible
    to a human viewer.
    """
    if not meta:
        return None
    angle = round(float(meta)) % 360
    if angle == 90:
        return cv2.ROTATE_90_CLOCKWISE
    if angle == 180:
        return cv2.ROTATE_180
    if angle == 270:
        return cv2.ROTATE_90_COUNTERCLOCKWISE
    return None


def apply_rotation(frame, rotation_code, cv2):
    return frame if rotation_code is None else cv2.rotate(frame, rotation_code)


def probe_fps_evidence(video):
    """Read container rates and real frame timestamps without trusting one FPS field."""
    stream_cmd = [
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=avg_frame_rate,r_frame_rate,duration,nb_frames",
        "-of", "json", video,
    ]
    frame_cmd = [
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-read_intervals", "%+5",
        "-show_entries", "frame=best_effort_timestamp_time", "-of", "csv=p=0", video,
    ]
    try:
        stream_data = json.loads(subprocess.run(stream_cmd, check=True, capture_output=True, text=True, timeout=30).stdout)
        stream = (stream_data.get("streams") or [{}])[0]
        average = ratio(stream.get("avg_frame_rate"))
        nominal = ratio(stream.get("r_frame_rate"))
        duration = float(stream.get("duration") or 0) or None
        frame_count = int(stream.get("nb_frames") or 0) or None
        real = frame_count / duration if frame_count and duration else None
        timestamp_lines = subprocess.run(frame_cmd, check=True, capture_output=True, text=True, timeout=30).stdout.splitlines()
        timestamps = []
        for line in timestamp_lines:
            try:
                timestamps.append(float(line.strip().split(",")[0]))
            except (ValueError, IndexError):
                continue
        deltas = [b - a for a, b in zip(timestamps, timestamps[1:]) if b > a]
        timestamp_fps = 1.0 / statistics.median(deltas) if deltas else None
        vfr = bool(
            (average and nominal and abs(average - nominal) > 0.01)
            or (deltas and max(deltas) - min(deltas) > 0.002)
        )
        return {
            "averageFps": average,
            "nominalFps": nominal,
            "realFps": real,
            "timestampFps": timestamp_fps,
            "variableFrameRate": vfr,
            "durationSeconds": duration,
            "frameCount": frame_count,
        }
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError, ValueError):
        return {"averageFps": None, "nominalFps": None, "realFps": None,
                "timestampFps": None, "variableFrameRate": False,
                "durationSeconds": None, "frameCount": None}


def classify_fps(evidence, fallback_fps):
    detected = evidence.get("averageFps") or fallback_fps
    minimum = FPS_POLICY["minimumNominal60Fps"]
    maximum = FPS_POLICY["maximumNominal60Fps"]
    max_supported = FPS_POLICY.get("maxSupportedFps", 300.5)
    min_supported = FPS_POLICY.get("minSupportedFps", 23.9)
    if detected > max_supported:
        return "unsupported_source_fps", "source_above_maximum_supported_rate", None
    if detected < min_supported:
        return "unsupported_source_fps", "source_below_minimum_supported_rate", None
    if minimum <= detected <= maximum:
        return "validated_60_fps_class", "average_rate_in_validated_60_range", 60
    timestamp_fps = evidence.get("timestampFps")
    timestamps_support = timestamp_fps is not None and FPS_POLICY["timestampEvidenceMinimumFps"] <= timestamp_fps <= FPS_POLICY["timestampEvidenceMaximumFps"]
    metadata_supports = any(value is not None and value >= minimum for value in (evidence.get("nominalFps"), evidence.get("realFps")))
    if timestamps_support and metadata_supports:
        return "validated_60_fps_class", "timestamp_and_metadata_prove_nominal_60", 60
    exp_min = FPS_POLICY["minimumExperimental30Fps"]
    exp_max = FPS_POLICY["maximumExperimental30Fps"]
    if exp_min <= detected <= exp_max:
        return "experimental_30_fps_class", "average_rate_in_experimental_30_range", 30
    timestamps_support_30 = timestamp_fps is not None and FPS_POLICY["timestampExperimentalMinimumFps"] <= timestamp_fps <= FPS_POLICY["timestampExperimentalMaximumFps"]
    metadata_supports_30 = any(value is not None and exp_min <= value <= exp_max for value in (evidence.get("nominalFps"), evidence.get("realFps")))
    if timestamps_support_30 and metadata_supports_30:
        return "experimental_30_fps_class", "timestamp_and_metadata_prove_experimental_30", 30
    # General native fallback: 24-29, 30.5-59, or 60.5-300 — a real, supported
    # rate that isn't one of the two precise named windows (e.g. 45, 75, 90,
    # 144, 165). Never forced into 30 or 60; keeps its own exact analysisFps,
    # and is fully eligible for general video/pose analysis. Only precise
    # acceleration contact timing requires the validated-60+ threshold.
    #
    # Phase 1 audit (2026-08-04, vanni_fly_240): a container's `avg_frame_rate`
    # tag is aggregate metadata, not a measurement — for one real 240fps HEVC
    # clip it reported 223.926 while every decoded frame's own timestamp
    # (`timestampFps`, the median real inter-frame delta computed above from
    # actual decoded frames) proved ~239.98. Scoped to ONLY this native-rate
    # fallback (never touching the 60/30 band checks above, which already have
    # their own, separately-tested timestamp+metadata corroboration and must
    # not change behavior here) — when timestamp evidence is available, sane,
    # and disagrees from the container average by more than 1%, prefer it as
    # the descriptive analysisFps. This corrects metadata/display only: the
    # timing pipeline (crossingTime/torsoSeries in measurements.ts) already
    # consumes each frame's own real persisted timestamp directly and was
    # never affected by this label — see
    # docs/phase-1-vanni-240-zone-time-report.md Part 3 for the full trace.
    timestamp_fps = evidence.get("timestampFps")
    timestamp_is_sane = timestamp_fps is not None and min_supported <= timestamp_fps <= max_supported
    native_detected = detected
    if timestamp_is_sane and detected and abs(timestamp_fps - detected) / detected > 0.01:
        native_detected = timestamp_fps
    return "native_source_class", "native_source_rate", round(native_detected, 3)

INSTALL_HINT = (
    "MediaPipe runtime unavailable. Install Python dependencies: "
    "mediapipe opencv-python"
)

# Model variant is configurable (Day 65). The HEAVY model is the default: it
# tracks a small/distant runner (e.g. the far end of a 20 m fly) far better than
# `lite`, which simply fails to detect the athlete for the first ~third of the
# rep. Accuracy is preferred over speed here. Override with MEDIAPIPE_POSE_VARIANT
# = lite | full | heavy, or point MEDIAPIPE_POSE_MODEL at a specific .task file.
MODEL_VARIANT = os.environ.get("MEDIAPIPE_POSE_VARIANT", "heavy").strip().lower()
MODEL_URL_TEMPLATE = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_{variant}/float16/latest/pose_landmarker_{variant}.task"
)

# Detection/tracking confidence thresholds. Lower than MediaPipe's 0.5 default so
# the athlete is picked up while still small on screen (first ground contacts),
# then held through tracking. Overridable via env for tuning.
def _conf(env_key, default):
    """A confidence in [0, 1] from the environment (clamped)."""
    try:
        v = float(os.environ.get(env_key, default))
        return min(1.0, max(0.0, v))
    except (TypeError, ValueError):
        return default


def _num(env_key, default):
    """A non-negative float from the environment, NOT clamped to 1 (padding/zoom
    scale factors legitimately exceed 1). Falls back to the default when unset/bad."""
    try:
        v = float(os.environ.get(env_key, default))
        return v if v > 0 else default
    except (TypeError, ValueError):
        return default


MIN_DETECTION_CONFIDENCE = _conf("MEDIAPIPE_MIN_DETECTION_CONFIDENCE", 0.3)
MIN_PRESENCE_CONFIDENCE = _conf("MEDIAPIPE_MIN_PRESENCE_CONFIDENCE", 0.3)
MIN_TRACKING_CONFIDENCE = _conf("MEDIAPIPE_MIN_TRACKING_CONFIDENCE", 0.3)

# ROI mode (Day 72): a small/distant athlete is only ~10–15 px tall inside a 1080p
# frame that MediaPipe downscales to ~256 px internally, so the feet at the far end
# of the zone are undetectable. ROI mode runs a two-pass "detection zoom": pass 1
# locates the athlete each frame (full frame), pass 2 crops a padded, athlete-centred
# box and runs pose on THAT — so the athlete fills the model's input and the far-end
# feet become trackable. Landmarks are mapped back to full-frame coordinates, so this
# is purely a DETECTION zoom, independent of any display zoom. Opt-in (benchmark
# pose mode); the default full-frame pipeline is unchanged.
ROI_ENABLED = os.environ.get("MEDIAPIPE_ROI", "").strip().lower() in ("1", "true", "yes", "on")
# Crop side = ROI_PADDING × the athlete's bounding-box height (feet→head), so the
# whole body plus margin is inside the crop even as the runner's size changes. Kept
# tight (1.3 ≈ 30% margin) so the runner is large in the model's input by default.
ROI_PADDING = _num("MEDIAPIPE_ROI_PADDING", 1.3)
# Floor on the crop side as a fraction of frame height, so an over-tight extrapolated
# box at the far end still contains the athlete.
ROI_MIN_SIDE_FRAC = _num("MEDIAPIPE_ROI_MIN_SIDE_FRAC", 0.22)
# ROI ZOOM (Day 73b): a single knob to make the athlete LARGER in the crop. >1 tightens
# both the padding and the far-end floor, so the runner fills more of the model's 256px
# input and the earliest small-foot contacts become trackable. The padding is floored at
# 1.1 (a small margin so an imperfect/extrapolated box never clips the body).
ROI_ZOOM = _num("MEDIAPIPE_ROI_ZOOM", 1.0)
EFF_PADDING = max(1.1, ROI_PADDING / ROI_ZOOM)
EFF_MIN_SIDE_FRAC = ROI_MIN_SIDE_FRAC / ROI_ZOOM
# Optional centered moving-average window (frames) for the crop track. Default OFF
# (1): on this footage the raw detected-box + linear-extrapolation track catches the
# earliest far contacts best; smoothing shifts the far crop and drops them. Tunable
# for footage where a jittery box needs stabilising.
# Day 95 audit: previously defaulted to 1 (effectively OFF) — smoothing a crop
# track built from possibly-wrong-identity boxes could visibly amplify noise.
# Now that `boxes[]` is identity-verified by the athlete tracker before this
# ever runs (see plan_crops's docstring), a mild centered smoothing window is
# safe and reduces crop jitter (Part 2E) without touching landmark positions
# or timestamps — it only changes WHERE the crop looks, never WHEN.
ROI_SMOOTH_WINDOW = int(_num("MEDIAPIPE_ROI_SMOOTH_WINDOW", 3))
# Acceleration V2: the early set/start occupies the smallest part of many clips.
# Tighten only the INTERNAL analysis crop during that window. Landmarks are still
# remapped to original-frame coordinates below; replay never sees this crop.
ACCELERATION_MODE = os.environ.get("MEDIAPIPE_ACCELERATION", "").strip().lower() in ("1", "true", "yes", "on")
ACCEL_START_SECONDS = _num("MEDIAPIPE_ACCEL_START_SECONDS", 2.5)
ACCEL_START_ZOOM = _num("MEDIAPIPE_ACCEL_START_ZOOM", 1.3)
# Dynamic Analysis Viewport (Phase 3, Part X): Pass 1's plain full-frame
# detection can fail TOTALLY (0/N frames) when the athlete is very small/
# distant — a real camera-far-back acceleration setup, confirmed on real
# footage (Edwards Stadium validation clip: athlete ~15px tall in a 720p
# frame, full-frame detection found 0/128). MediaPipe's detector internally
# resizes the whole input to a small fixed resolution, so what matters is the
# athlete's FRACTION of frame width, not absolute resolution — a full-frame
# upscale does not help. When full-frame detection fails, fall back to a
# tiled coarse search (overlapping horizontal bands) ONLY for that frame, so
# normal-sized-athlete clips (the common case) pay zero extra cost.
ROI_TILE_FALLBACK = os.environ.get("MEDIAPIPE_ROI_TILE_FALLBACK", "1").strip().lower() in ("1", "true", "yes", "on")
ROI_TILE_WIDTH_FRAC = _num("MEDIAPIPE_ROI_TILE_WIDTH_FRAC", 0.25)
ROI_TILE_STEP_FRAC = _num("MEDIAPIPE_ROI_TILE_STEP_FRAC", 0.125)
ROI_TILE_UPSCALE = _num("MEDIAPIPE_ROI_TILE_UPSCALE", 3.0)

# --- Phase R3B-5: primary-pass plausibility floor + ranked tile selection ---
#
# R3B-4 (docs/phase-r3b4-early-raw-detection-recall-audit.md) found the tile
# fallback below is ALREADY reliable (34/34 real invocations succeeded on
# Vanni 60's critical frames) -- the real defect was upstream: the fallback
# only ever runs when the primary pass finds LITERALLY NOTHING
# (`not any(candidates)`), so a single low-quality/spurious primary
# detection (visually confirmed as an empty bleacher railing, no person
# present) silently prevented the working fallback from ever running, on
# 3 of 10 critical frames (0, 21, 30).
#
# PRIMARY_SUPPRESSION_MIN_HEIGHT_FRACTION is the minimum normalized
# candidate height (== Candidate.h, already scale-invariant: a fraction of
# frame height, not a pixel count -- generalizes across source resolutions)
# a primary-pass candidate must reach before its mere presence is trusted
# enough to skip the fallback search. R3B-5 re-derived this from FRESH real
# evidence (tmp/phaseR3B5/candidate-size-distribution.json), not R3B-4's own
# provisional "~0.05" estimate (explicitly not to be blindly reused):
# across all 4 benchmarks' real primary-pass candidates, the visually-
# confirmed spurious cluster (Vanni 60, frames 0/13/19/21/23/30/36/37) never
# exceeded 0.0369, while genuine athlete candidates ranged 0.0354-0.1746
# with a median of 0.117 -- i.e. the TRUE distribution's own minimum
# (0.0354, Vanni 120's smallest very-early hit) is almost exactly at the
# spurious maximum, not the clean 2x-separated gap R3B-4's narrower sample
# suggested. Because a candidate that fails this floor is NOT discarded
# (Part E of the R3B-5 task; see the call sites below -- it remains in the
# returned candidate list for identity logic to evaluate normally), the
# only cost of setting the floor ABOVE a genuine small candidate is one
# extra (harmless, already-proven-reliable) fallback search that frame --
# whereas setting it BELOW a spurious candidate reproduces the exact R3B-4
# bug. This asymmetry is why the floor is set with a safety margin ABOVE
# the observed spurious maximum rather than splitting the (near-zero) gap.
PRIMARY_SUPPRESSION_MIN_HEIGHT_FRACTION = _num("MEDIAPIPE_PRIMARY_SUPPRESSION_MIN_HEIGHT_FRACTION", 0.04)

# Tile-ranking tie-break margin (Part G): when two tiles' detected
# candidates have confidence within this margin of each other, prefer the
# one closer to `hint_x` rather than letting a trivial confidence
# difference (detector noise) override useful positional continuity. A
# confidence gap LARGER than this always wins outright, regardless of hint
# distance -- hint proximity is a tie-break, never an override (Part J).
TILE_RANK_CONFIDENCE_TIE_EPS = 0.02

CAMERA_MOTION_MODEL_VERSION = "ava-background-world-v2"
WORLD_COORDINATE_SCHEMA_VERSION = "ava-world-reference-v1"
DYNAMIC_CROP_VERSION = "ava-mediapipe-roi-v1"
ATHLETE_TRACKING_VERSION = "ava-single-pose-continuity-v1"
MIN_BACKGROUND_FEATURES = 12
MAX_TRACKING_GAP_FRAMES = 12


def fail(message, code=1):
    print(message, file=sys.stderr)
    sys.exit(code)


# Day 104 (Part 8): real, frame-throughput-based analysis progress. Emitted as
# a single, stably-prefixed JSON line to stderr — `PythonMediaPipePoseService.ts`
# parses these LIVE (as the subprocess's stderr stream arrives, not just after
# it exits) and the worker relays the latest snapshot through its EXISTING
# heartbeat cadence, so this adds no new timer/process/DB-write path. Never
# claims precision beyond what was actually measured: just frame counts, a
# wall-clock timestamp, and known static facts (source fps/resolution) — the
# ETA MATH itself lives client-side (`analysisProgress/model.ts`), computed
# from real measured throughput between consecutive snapshots.
AVA_PROGRESS_PREFIX = "AVA_PROGRESS "
_last_progress_emit_time = {"pass1": 0.0, "pass2": 0.0}
PROGRESS_EMIT_MIN_INTERVAL_S = 0.5
PROGRESS_EMIT_FRAME_STRIDE = 25


def emit_progress(stage, frames_completed, total_frames, source_fps, width, height, force=False):
    """Print a throttled progress line (time- AND frame-stride-gated, so a
    very slow per-frame stage still reports at least every ~0.5s, and a very
    fast one doesn't flood stderr every single frame)."""
    now = time.time()
    if not force:
        if frames_completed % PROGRESS_EMIT_FRAME_STRIDE != 0:
            return
        if now - _last_progress_emit_time.get(stage, 0.0) < PROGRESS_EMIT_MIN_INTERVAL_S:
            return
    _last_progress_emit_time[stage] = now
    print(
        AVA_PROGRESS_PREFIX + json.dumps({
            "stage": stage,
            "framesCompleted": frames_completed,
            "totalFrames": total_frames,
            "sourceFps": source_fps,
            "width": width,
            "height": height,
            "capturedAtMs": int(now * 1000),
        }),
        file=sys.stderr,
    )
    sys.stderr.flush()


def ensure_model():
    """Return a path to the pose model bundle, downloading + caching if needed."""
    override = os.environ.get("MEDIAPIPE_POSE_MODEL")
    if override:
        if not os.path.exists(override):
            fail("Pose model not found at MEDIAPIPE_POSE_MODEL=%s" % override)
        return override

    variant = MODEL_VARIANT if MODEL_VARIANT in ("lite", "full", "heavy") else "heavy"
    fname = "pose_landmarker_%s.task" % variant
    model_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
    os.makedirs(model_dir, exist_ok=True)
    model_path = os.path.join(model_dir, fname)
    if not os.path.exists(model_path):
        print("Downloading pose model '%s' (first run only)..." % variant, file=sys.stderr)
        tmp = model_path + ".download"
        try:
            urllib.request.urlretrieve(MODEL_URL_TEMPLATE.format(variant=variant), tmp)
            os.replace(tmp, model_path)
        except Exception as exc:
            if os.path.exists(tmp):
                os.remove(tmp)
            fail("Failed to download pose model '%s': %s" % (variant, exc))
    return model_path


def landmark_dict(lm, sx=1.0, sy=1.0, ox=0.0, oy=0.0):
    """Landmark → schema dict. When ROI-cropped, map the crop-normalized (x, y) back
    to FULL-FRAME normalized coordinates via `x_full = (ox + lm.x*sx*cw)/W` etc.,
    passed pre-computed as scale (sx, sy) + offset (ox, oy) in full-frame units.
    Omit visibility/presence when absent — emitting null would fail the TS schema."""
    out = {"x": ox + lm.x * sx, "y": oy + lm.y * sy, "z": lm.z}
    visibility = getattr(lm, "visibility", None)
    presence = getattr(lm, "presence", None)
    if visibility is not None:
        out["visibility"] = visibility
    if presence is not None:
        out["presence"] = presence
    return out


def make_options(model_path, mp_python, mp_vision, num_poses=1):
    return mp_vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=model_path),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_poses=num_poses,
        min_pose_detection_confidence=MIN_DETECTION_CONFIDENCE,
        min_pose_presence_confidence=MIN_PRESENCE_CONFIDENCE,
        min_tracking_confidence=MIN_TRACKING_CONFIDENCE,
    )


# MediaPipe Pose landmark index -> canonical name, for the subset the athlete
# tracker's crop-containment diagnostics need (head/pelvis/feet).
TRACKER_LANDMARK_NAMES = {
    0: "nose",
    11: "left_shoulder", 12: "right_shoulder",
    23: "left_hip", 24: "right_hip",
    25: "left_knee", 26: "right_knee",
    27: "left_ankle", 28: "right_ankle",
    29: "left_heel", 30: "right_heel",
    31: "left_foot_index", 32: "right_foot_index",
}
# How many simultaneous pose candidates to request per frame during
# athlete-identity acquisition/tracking (Day 95 audit) — enough to usually
# capture the real athlete even when another person/object is also detected,
# without unbounded cost. Overridable for testing.
TRACKER_NUM_CANDIDATES = int(_num("MEDIAPIPE_TRACKER_CANDIDATES", 3))
# Day 96 audit (Part 3): how often the expensive identity-verified multi-pose
# detector runs during LOCALIZATION (pass 1). Between detector frames, the
# box is carried forward by cheap optical-flow tracking (box_tracker.py).
# Every 8 source frames at 240fps is ~33ms of real time between fixes — well
# within a sprinting athlete's frame-to-frame displacement budget for optical
# flow to bridge — while cutting detector invocations to ~1/8th of Day 95's
# full-cadence cost. The detector always refreshes immediately on tracking-
# quality loss regardless of this cadence (see AthleteBoxTracker.wants_detector_frame).
DETECTOR_CADENCE_FRAMES = int(_num("MEDIAPIPE_DETECTOR_CADENCE_FRAMES", 8))


def bbox_from_result(result, width, height):
    """Pixel bounding box (cx, cy, width, height) of the detected pose, or None."""
    if not result.pose_landmarks:
        return None
    xs = [lm.x * width for lm in result.pose_landmarks[0]]
    ys = [lm.y * height for lm in result.pose_landmarks[0]]
    if not xs:
        return None
    return ((min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0,
            max(xs) - min(xs), max(ys) - min(ys))


def _tile_starts(width, tile_width):
    """Overlapping tile x-offsets covering the full frame width."""
    step = max(1, int(round(tile_width * ROI_TILE_STEP_FRAC / ROI_TILE_WIDTH_FRAC)))
    starts = list(range(0, max(1, width - tile_width) + step, step))
    starts = sorted(set(min(s, max(0, width - tile_width)) for s in starts))
    return starts


def _primary_pass_has_plausible_candidate(candidates):
    """Phase R3B-5 (Part C/E) — a primary-pass detection may suppress the
    (already-reliable, per R3B-4) tile fallback ONLY if at least one
    candidate clears PRIMARY_SUPPRESSION_MIN_HEIGHT_FRACTION. `Candidate.h`
    is already a normalized fraction of frame height (Part D — scale-
    invariant across source resolutions, no pixel math needed). Candidates
    that fail this floor are NOT removed from `candidates` — the caller
    still passes them through to identity logic unchanged (Part E); this
    function only decides whether the fallback search ALSO runs."""
    return any(c is not None and c.h >= PRIMARY_SUPPRESSION_MIN_HEIGHT_FRACTION for c in candidates)


class _RemappedLandmark:
    """A tile-space landmark remapped into FULL-FRAME normalized [0,1]
    coordinates, so it can flow through the same `candidate_from_landmarks`
    path as an ordinary full-frame detection (Day 95 audit)."""
    __slots__ = ("x", "y", "z", "visibility", "presence")

    def __init__(self, x, y, z, visibility, presence):
        self.x, self.y, self.z = x, y, z
        self.visibility, self.presence = visibility, presence


def tiled_locate(frame_bgr, width, height, landmarker, mp, mp_image_cls, cv2, hint_x=None):
    """Coarse fallback search for a small/distant athlete (Dynamic Analysis
    Viewport, Part X): splits the frame into overlapping vertical bands, runs
    detection on each upscaled band, and returns (box, confidence,
    landmarks_list) for the BEST-SUPPORTED tile — landmarks_list holds
    EVERY pose detected in the winning tile (not just the first), remapped
    to full-frame-normalized coordinates so the athlete tracker can apply
    the same identity checks to a tile-fallback candidate as a normal one.
    Returns (None, 0.0, []) if nothing is found in any tile.

    Phase R3B-5 (Part F/G/H, docs/phase-r3b5-primary-plausibility-and-ranked-tile-selection.md):
    previously returned the FIRST tile with any detection, in `hint_x`-
    proximity order. R3B-4 visually confirmed this let a low-confidence
    background hallucination (a bleacher railing) win over a real, clearly-
    visible athlete detection sitting in a further tile the search never
    reached. Now ALL tiles are scanned (the tile count is small and fixed —
    typically 7 for a 1920px-wide frame — so this is a bounded, not
    unbounded, cost, and only runs on frames where the primary pass already
    failed/was implausible) and the candidates are RANKED: highest detector
    confidence wins outright; only within TILE_RANK_CONFIDENCE_TIE_EPS of
    each other does proximity to `hint_x` break the tie — hint_x remains a
    tie-break/search-priority signal (also still used to ORDER the scan
    itself, unchanged, so the common case where the first tile tried is
    already the best one costs nothing extra), never something that can
    override a clearly stronger detection (Part J)."""
    tile_width = max(32, int(round(width * ROI_TILE_WIDTH_FRAC)))
    starts = _tile_starts(width, tile_width)
    if hint_x is not None:
        starts = sorted(starts, key=lambda s: abs((s + tile_width / 2.0) - hint_x))
    best_confidence, best_box, best_landmarks, best_hint_dist = None, None, None, None
    for tx in starts:
        tile = frame_bgr[0:height, tx:tx + tile_width]
        if tile.shape[0] < 4 or tile.shape[1] < 4:
            continue
        big = cv2.resize(
            tile,
            (int(tile.shape[1] * ROI_TILE_UPSCALE), int(tile.shape[0] * ROI_TILE_UPSCALE)),
            interpolation=cv2.INTER_CUBIC,
        )
        rgb = cv2.cvtColor(big, cv2.COLOR_BGR2RGB)
        mp_image = mp_image_cls(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = landmarker.detect(mp_image)
        if not result.pose_landmarks:
            continue
        landmarks_list = [
            [
                _RemappedLandmark(
                    (tx + p.x * tile_width) / float(width), p.y, p.z,
                    getattr(p, "visibility", None), getattr(p, "presence", None),
                )
                for p in lm
            ]
            for lm in result.pose_landmarks
        ]
        lm = result.pose_landmarks[0]
        xs = [tx + (p.x * tile_width) for p in lm]
        ys = [p.y * height for p in lm]
        values = [max(0.0, min(1.0, float(getattr(p, "visibility", 0.0)))) for p in lm]
        confidence = sum(values) / len(values) if values else 0.0
        box = ((min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0, max(xs) - min(xs), max(ys) - min(ys))
        hint_dist = abs((tx + tile_width / 2.0) - hint_x) if hint_x is not None else 0.0
        is_better = (
            best_confidence is None
            or confidence > best_confidence + TILE_RANK_CONFIDENCE_TIE_EPS
            or (abs(confidence - best_confidence) <= TILE_RANK_CONFIDENCE_TIE_EPS and hint_dist < best_hint_dist)
        )
        if is_better:
            best_confidence, best_box, best_landmarks, best_hint_dist = confidence, box, landmarks_list, hint_dist
    if best_box is None:
        return None, 0.0, []
    return best_box, best_confidence, best_landmarks


def _lin_fit(indices, values):
    """Least-squares (slope, intercept) of values vs indices; degenerate → (0, mean)."""
    n = len(indices)
    if n == 0:
        return 0.0, 0.0
    if n == 1:
        return 0.0, values[0]
    sx = sum(indices); sy = sum(values)
    sxx = sum(i * i for i in indices); sxy = sum(i * v for i, v in zip(indices, values))
    denom = n * sxx - sx * sx
    if abs(denom) < 1e-9:
        return 0.0, sy / n
    b = (n * sxy - sx * sy) / denom
    return b, (sy - b * sx) / n


def _moving_avg(track, window):
    """Centered moving average of a list of (cx, cy, width, height) tuples."""
    if window <= 1 or len(track) < 2:
        return list(track)
    half = window // 2
    n = len(track)
    out = []
    for i in range(n):
        lo, hi = max(0, i - half), min(n, i + half + 1)
        seg = track[lo:hi]
        k = len(seg)
        out.append(tuple(sum(t[j] for t in seg) / k for j in range(4)))
    return out


# Phase 4.2D (2026-08-06): segment-aware crop planning. Real evidence (a
# production rerun of `vanni_fly_240` during Phase 4.2C) proved the PRIOR
# design — one global least-squares line fit through every non-excluded box
# in the WHOLE clip, then one whole-clip centered moving average — breaks
# down once a large, uneven fraction of the clip is legitimately excluded
# (Phase 4.2's own `frozen_suspect` exclusion, ~48% of `vanni_fly_240`'s
# frames). A single straight-line "constant velocity" model cannot
# simultaneously fit a pre-zone approach, a fly-zone cruise, and a
# post-finish exit/deceleration — regions with genuinely different motion —
# and forcing one line through all of them measurably distorted the crop in
# regions that had perfectly good, LOCAL evidence of their own. See
# docs/phase-4-2d-segment-aware-crop-planning.md for the full proof.
#
# Fix: partition the clip into independent, contiguous TRUSTED SEGMENTS
# (real evidence, i.e. `boxes[i] is not None` — unchanged from Phase 4.2C:
# `frozen_suspect`/`invalid`/never-detected frames are still excluded
# upstream), fit and smooth EACH segment using only its own data. A short
# gap between two segments is bridged (linear interpolation between the two
# nearest real points, i.e. bounded local evidence — not a whole-clip
# trend); a long gap, or a fresh identity-verified reacquisition after any
# gap, starts a genuinely new segment. Frames outside every segment's own
# span (a long unsupported gap, or before/after all evidence) hold the
# nearest segment's edge value flat rather than extrapolating a fabricated
# trajectory across it.
MAX_BRIDGE_GAP_MS = 200.0  # matches this project's existing FREEZE_MIN_SUSPECT_MS/
                           # POSE_MISS_SUSPECT_MS precedent (Phase 4.2B/4.2C) — not a new magnitude


def _partition_crop_segments(boxes, origins, max_bridge_gap_frames):
    """Phase 4.2D: split the valid (non-None) indices of `boxes` into
    contiguous segments. Two consecutive valid indices stay in the SAME
    segment only if the gap between them is short enough to bridge AND the
    later one is not a genuine identity-verified REACQUISITION (Part 5,
    item 6: "reinitialize crop planning after verified reacquisition" — a
    `reacquired` origin — box_tracker.py's own signal that this track had
    genuinely been lost and is only now recovering — always starts a new
    segment, even a bridgeable one, so the local trend/smoothing model
    resets on real, fresh post-loss evidence rather than quietly carrying
    the pre-loss trend across it).
    Real bug found and fixed via this phase's own production rerun of the
    PROTECTED Gav benchmark: an earlier version of this condition also
    triggered on plain `detected` origin frames — box_tracker.py's own
    ROUTINE, HEALTHY periodic detector cadence refresh (every
    `detector_cadence_frames`, by design, on a perfectly continuous,
    never-lost track) — not a "reacquisition" in any meaningful sense at
    all. That bug needlessly fragmented Gav's clean, continuous track into
    many small segments purely because it refreshes its identity-verified
    box periodically (completely normal, expected behavior), measurably
    (if modestly) shifting Gav's crop geometry and downstream metrics with
    no real justification. Fixed: only `reacquired` — which box_tracker.py
    itself only ever assigns when the track was actually
    lost/reacquiring/acquiring beforehand — resets a segment; a routine
    `detected` refresh on an already-healthy track does not."""
    valid_idx = [i for i, b in enumerate(boxes) if b is not None]
    if not valid_idx:
        return []
    segments = [[valid_idx[0]]]
    for prev, cur in zip(valid_idx, valid_idx[1:]):
        gap = cur - prev
        is_genuine_reacquisition = origins is not None and origins[cur] == "reacquired"
        if gap > max_bridge_gap_frames or is_genuine_reacquisition:
            segments.append([cur])
        else:
            segments[-1].append(cur)
    return segments


def _segment_local_track(boxes, segments, n):
    """Phase 4.2D: build the raw per-frame (cx,cy,w,h) track using ONLY
    each segment's own local linear fit — never a whole-clip fit, never
    reaching into a different segment. Two distinct "outside a segment"
    cases are handled differently, on purpose:

    - BEFORE THE FIRST / AFTER THE LAST segment (the clip's own leading/
      trailing edge, e.g. "the far end before MediaPipe could see the
      small athlete" — `plan_crops()`'s own original, load-bearing design
      intent, stated in its docstring since Day 96): EXTRAPOLATED from
      that boundary segment's own local trend, exactly as the original
      whole-clip design did (just using a LOCAL fit instead of a global
      one now). Real bug found and fixed via this phase's own production
      rerun of the PROTECTED Gav benchmark: an earlier version of this
      function held the leading/trailing edge FLAT instead of
      extrapolating, which measurably (if modestly) shifted Gav's crop
      geometry and downstream metrics for no reason connected to this
      phase's actual mandate (fixing how gaps BETWEEN segments are
      handled, not how the clip's own edges are handled) — a real,
      unintended behavior change, not a deliberate improvement.
    - BETWEEN two different segments (a genuine internal gap too long to
      bridge, or a real reacquisition boundary): held FLAT at the nearest
      segment's nearest edge — bounded, not a fabricated trajectory
      (Part 5, item 5: "do not bridge long unsupported gaps"; Part 8:
      "for long gaps... do not invent a trajectory"). This is the actual,
      intentional fix this phase's mandate is about.
    """
    raw = [None] * n
    seg_id = [None] * n  # which segment (by index into `segments`) owns frame i, for segment-aware smoothing
    seg_fits = []  # (cx_s, cx_i, cy_s, cy_i, w_s, w_i, h_s, h_i) per segment, reused for edge extrapolation
    for s, seg in enumerate(segments):
        seg_boxes = [boxes[i] for i in seg]
        if len(seg_boxes) >= 2:
            cx_s, cx_i = _lin_fit(seg, [b[0] for b in seg_boxes])
            cy_s, cy_i = _lin_fit(seg, [b[1] for b in seg_boxes])
            w_s, w_i = _lin_fit(seg, [b[2] for b in seg_boxes])
            h_s, h_i = _lin_fit(seg, [b[3] for b in seg_boxes])
        else:
            b0 = seg_boxes[0]
            cx_s = cy_s = w_s = h_s = 0.0
            cx_i, cy_i, w_i, h_i = b0
        seg_fits.append((cx_s, cx_i, cy_s, cy_i, w_s, w_i, h_s, h_i))
        lo, hi = seg[0], seg[-1]
        for i in range(lo, hi + 1):
            seg_id[i] = s
            raw[i] = boxes[i] if boxes[i] is not None else (
                cx_s * i + cx_i, cy_s * i + cy_i, w_s * i + w_i, h_s * i + h_i
            )

    def _extrapolate(seg_index, i):
        cx_s, cx_i, cy_s, cy_i, w_s, w_i, h_s, h_i = seg_fits[seg_index]
        return (cx_s * i + cx_i, cy_s * i + cy_i, w_s * i + w_i, h_s * i + h_i)

    # Leading edge: extrapolate from the FIRST segment's own local trend —
    # preserves the original "see the far end coming" design intent.
    if raw[0] is None:
        first_lo = segments[0][0]
        for i in range(0, first_lo):
            raw[i] = _extrapolate(0, i)
            seg_id[i] = 0
    # Internal gaps between two segments: held flat at the nearest edge —
    # the actual fix (do not fabricate a trajectory across a real,
    # unsupported gap or reacquisition boundary).
    for s in range(len(segments) - 1):
        hi_prev = segments[s][-1]
        lo_next = segments[s + 1][0]
        for i in range(hi_prev + 1, lo_next):
            # Nearest-edge hold: closer to the end of the previous segment
            # or the start of the next one, whichever is nearer in time.
            if (i - hi_prev) <= (lo_next - i):
                raw[i] = raw[hi_prev]
                seg_id[i] = seg_id[hi_prev]
            else:
                raw[i] = raw[lo_next]
                seg_id[i] = seg_id[lo_next]
    # Trailing edge: extrapolate from the LAST segment's own local trend —
    # same original design intent as the leading edge.
    last_s = len(segments) - 1
    last_hi = segments[last_s][-1]
    if last_hi < n - 1:
        for i in range(last_hi + 1, n):
            raw[i] = _extrapolate(last_s, i)
            seg_id[i] = last_s
    return raw, seg_id


def _segment_aware_moving_avg(track, seg_id, segments, window):
    """Phase 4.2D: same centered moving average as `_moving_avg`, but the
    window never reaches across a segment boundary — answers Part 2's
    explicit audit question ("whether crop smoothing mixes pre-gap and
    post-gap trajectories") with a real, enforced no.

    `segments` is accepted (not just `seg_id`) for signature parity with
    `plan_crops`'s call site; a real attempt this phase to ALSO restrict
    the window at the clip's own leading/trailing extrapolated edge (in
    response to this phase's own deterministic fixture,
    scripts/crop-segment-planning-sanity.py, finding a tiny, sub-1%
    boundary-blending shift there) was tried and reverted: it measurably
    (if modestly) moved the PROTECTED Gav benchmark's crop geometry and
    downstream metrics away from its established, hand-verified baseline.
    Investigation showed this exact boundary-blending characteristic — the
    last real frame's moving-average window includes one adjacent
    extrapolated edge sample — predates Phase 4.2D entirely: the PRIOR
    whole-clip design's own single moving average had the identical
    property at the clip's one global boundary, just never previously
    measured. It is not the mechanism behind the Vanni 240 regression this
    phase targets (that was the whole-clip TREND FIT reacting to excluded
    segments, not moving-average smoothing at the clip's edges — see
    `_segment_local_track`'s own docstring and Property 2/3 of the
    fixture, which prove the trend/segmentation itself has zero
    look-ahead dependency). Per this phase's explicit hard constraint
    ("Gav does not regress"), this pre-existing, bounded (at most
    `window // 2` trailing/leading frames, never propagating further) edge
    characteristic is left as-is and documented, not "fixed" at the cost
    of an unexplained Gav shift. See
    docs/phase-4-2d-segment-aware-crop-planning.md's temporal-causality
    section for the full account."""
    if window <= 1 or len(track) < 2:
        return list(track)
    half = window // 2
    n = len(track)
    out = []
    for i in range(n):
        lo, hi = max(0, i - half), min(n, i + half + 1)
        seg = [track[j] for j in range(lo, hi) if seg_id[j] == seg_id[i]]
        if not seg:
            seg = [track[i]]
        k = len(seg)
        out.append(tuple(sum(t[j] for t in seg) / k for j in range(4)))
    return out


# Phase 5.0B (Parts F/G/H) — adaptive crop-geometry constants. The athlete
# box (box_tracker.py's `scientificAthleteBox`) and the pose crop
# (plan_crops's own output) are NOT the same thing — the box's job is
# identity/localization; the crop's job is giving MediaPipe the best
# possible full-body image. These constants make the crop respond to REAL,
# already-computed Pass-1 evidence instead of using fixed geometric
# fractions alone. Every constant's physical meaning/units/dependence is
# documented per this phase's own Part A audit requirement.
#
#   CROP_RISK_WIDEN_GAIN / CROP_RISK_WIDEN_MAX_FRAC — unitless. Input is
#     `trajectoryResidualFrameWidths` (box_tracker.py, already computed for
#     every tracked frame — Phase 4.2H), itself already frame-width-
#     normalized, so this gain is NOT fps-dependent, athlete-size-dependent,
#     or resolution-dependent — a real localization-uncertainty signal
#     widens the crop; a confidently-tracked frame does not. Bounded: widen
#     can never exceed +25% of crop side regardless of risk magnitude ("do
#     not assume more padding is always better" — this only widens when
#     there is real evidence of risk, and only up to a hard ceiling).
#   CROP_PREDICTION_HORIZON_MS — milliseconds, NOT a frame count (Part G's
#     explicit requirement). Physically justified: matches the order of
#     magnitude of this pipeline's own DETECTOR_CADENCE_FRAMES/fps interval
#     at 240fps (8/240*1000 ≈ 33.3ms) — the same real cadence this codebase
#     already treats as its "how far ahead is bounded-safe to reason"
#     scale elsewhere (Phase 4.2J's own ADJUDICATION_LOOKAHEAD_MS). Applied
#     identically at 60/120/240fps — FPS-independence comes from expressing
#     the horizon in real time, not frames.
#   CROP_MAX_LEAD_FRAC — unitless bound: the velocity-projected forward
#     lead can never exceed 18% of the crop's own half-side, regardless of
#     how fast the athlete is moving — prevents runaway prediction and
#     never claims to BE localization (Part G: "the crop may be predictive
#     while the underlying localization provenance remains explicit").
#   CROP_VERTICAL_FOOT_BIAS_FRAC — unitless, fixed, athlete-independent,
#     FPS-independent: a real, measured, cross-benchmark finding (Phase
#     5.0B's own Part D audit, docs/phase-5-0b-adaptive-crop-geometry.md
#     Section 7) that foot-to-bottom crop margin is structurally TIGHTER
#     than head-to-top margin in EVERY one of the four real benchmarks
#     audited (Gav 30.2px vs 43.5px; Vanni 240 7.7px vs 62.4px; Vanni 120
#     38.9px vs 49.9px; Vanni 60 20.6px vs 57.9px, minimums) — consistent
#     with MediaPipe's own 33-point topology being upper-body-dense (face,
#     shoulders, arms), which pulls the raw landmark-cluster vertical
#     center above the true anatomical midline. This is a property of the
#     POSE MODEL'S topology, not of any specific athlete or frame rate, so
#     a small, fixed, disclosed downward bias is a structural correction,
#     not a per-clip tuning knob.
# Real, disclosed finding from this phase's own production validation
# (docs/phase-5-0b-adaptive-crop-geometry.md Section 6.3): `trajectoryResidualFrameWidths`
# — the ONLY real, already-computed evidence available to `plan_crops()` at
# the time it runs (Pass 2 pose evidence does not exist yet) — cannot
# separate Gav's own ordinary limb motion from Vanni 240's real 470-527
# problem window: Gav's own real ceiling (0.0803fw) actually EXCEEDS Vanni
# 240's own real problem-window range (0.027-0.056fw). This is the exact
# same wall Phase 4.2H already proved for box_tracker.py's coast-risk gate
# using this identical signal — now independently reconfirmed for the crop
# layer. No threshold protects Gav AND meaningfully helps Vanni 240 using
# this signal alone. Per this project's own established precedent (ship the
# capability, default it inert until proven safe — e.g. `ROI_ENABLED`,
# `ACCELERATION_MODE` elsewhere in this file), `CROP_RISK_WIDEN_GAIN`
# defaults to 0.0 (fully inert — a real production rerun of the PROTECTED
# Gav benchmark confirmed a nonzero default measurably moved
# `strideFrequencyHz` off its established 4.4 baseline, an unacceptable
# regression) — the mechanism remains fully implemented, tested (Section 15,
# Test 9/9b/9c), and documented for a future phase with a genuinely new
# evidence source (matching Phase 4.2H's own Section 27 recommendation),
# not deleted.
CROP_RISK_WIDEN_GAIN = _num("MEDIAPIPE_CROP_RISK_WIDEN_GAIN", 0.0)
CROP_RISK_WIDEN_MAX_FRAC = _num("MEDIAPIPE_CROP_RISK_WIDEN_MAX_FRAC", 0.25)
CROP_PREDICTION_HORIZON_MS = _num("MEDIAPIPE_CROP_PREDICTION_HORIZON_MS", 35.0)
CROP_MAX_LEAD_FRAC = _num("MEDIAPIPE_CROP_MAX_LEAD_FRAC", 0.18)
CROP_VERTICAL_FOOT_BIAS_FRAC = _num("MEDIAPIPE_CROP_VERTICAL_FOOT_BIAS_FRAC", 0.06)


def plan_crops(boxes, width, height, fps, direction_sign=0, confidences=None, origins=None, risk_fw=None):
    """Per-frame square crop (x0,y0,x1,y1) around the athlete — Phase 4.2D
    SEGMENT-AWARE planning pass (see the module-level comment above
    `MAX_BRIDGE_GAP_MS` for the real evidence this replaced the prior
    whole-clip design): detected frames use their bounding box; short
    internal gaps within a trusted segment EXTRAPOLATE from that segment's
    own local linear trend only; long gaps or fresh reacquisitions start a
    new segment instead of forcing one line through unrelated motion
    regimes. The resulting track is smoothed (segment-bounded) so the crop
    glides, keeping the athlete reliably inside a tight, high-zoom crop
    (ROI_ZOOM).

    `boxes` is expected to already be IDENTITY-VERIFIED (Day 95 audit) and
    already EXCLUDED of any confirmed-wrong span (Phase 4.2C: `frozen_
    suspect` frames are synced to `None` before this is called) — i.e. the
    caller has already rejected any candidate that failed continuity or
    freeze checks, so each segment's local trend fits real athlete motion,
    not noise/other people/a proven-wrong lock.

    `direction_sign` (+1 left-to-right, -1 right-to-left, 0 unknown) is used
    for a bounded, VELOCITY-AND-TIME-SCALED forward lead (Phase 5.0B, Part
    G — replaces the prior fixed-fraction lead: a fast athlete gets a real,
    physically bounded lead; a slow/stationary one gets almost none, rather
    than every clip receiving the same fixed geometric offset regardless of
    actual motion). `confidences` (same length as `boxes`, 0..1) widens the
    crop during low-confidence periods. `risk_fw` (Phase 5.0B, optional,
    same length as `boxes`) is box_tracker.py's own already-computed
    `trajectoryResidualFrameWidths` per frame — a SEPARATE, additive
    widening signal from real positional-disagreement evidence, independent
    of raw detector confidence. `origins` (Phase 4.2D, optional, same
    length as `boxes`) is the per-frame `boxOrigin` string — used only to
    detect a fresh identity-verified reacquisition boundary (see
    `_partition_crop_segments`); safe to omit (falls back to gap-size-only
    segmentation).
    """
    n = len(boxes)
    det = [(i, b) for i, b in enumerate(boxes) if b is not None]
    if not det:
        return [(0, 0, width, height)] * n, [{"predictedCenterOffsetPx": None, "cropScaleFactor": None, "cropAdjustmentReason": None}] * n
    min_side = EFF_MIN_SIDE_FRAC * height
    max_bridge_gap_frames = max(1, round(MAX_BRIDGE_GAP_MS / 1000.0 * max(fps, 1e-6)))
    segments = _partition_crop_segments(boxes, origins, max_bridge_gap_frames)
    raw, seg_id = _segment_local_track(boxes, segments, n)
    track = _segment_aware_moving_avg(raw, seg_id, segments, ROI_SMOOTH_WINDOW)
    crops = []
    # Phase 5.0B (Part J) — auxiliary per-frame diagnostics, same indexing
    # as `crops`: how far the bounded velocity-lead actually shifted the
    # crop center this frame (px, signed same direction as `direction_sign`),
    # and the net risk/confidence-driven size multiplier actually applied
    # (final side ÷ the base padded-box side, BEFORE any widening) — real,
    # persisted evidence of what this frame's crop actually did, not an
    # estimate.
    diagnostics = []
    # Day 96 audit (Part 5): bound frame-to-frame crop CENTER and SIZE change
    # so the crop can never jump or zoom abruptly, even if the underlying
    # (already-smoothed) track has a sharp step — e.g. right at a detector
    # refresh after a run of predicted frames. Expressed relative to the
    # PREVIOUS frame's own side length, so it scales with zoom level rather
    # than being a fixed pixel budget.
    MAX_CENTER_STEP_FRAC = 0.35   # center may move at most 35% of crop side per frame
    MAX_SIDE_CHANGE_FRAC = 0.12   # crop side may grow/shrink at most 12% per frame
    dt_ms = 1000.0 / max(fps, 1e-6)  # nominal inter-frame time; same fps basis this whole module already treats as authoritative for spacing
    prev_final = None  # (cx_shifted, cy, side)
    for i, (cx, cy, bw, h) in enumerate(track):
        side = max(min_side, EFF_PADDING * max(h, 1.0))
        base_side = side  # before any widening/bounding — for cropScaleFactor provenance (Part J)
        if ACCELERATION_MODE and i / fps <= ACCEL_START_SECONDS:
            # Never crop inside the detected body box: hands and feet remain visible.
            side = max(1.08 * max(h, 1.0), side / ACCEL_START_ZOOM)
        # Low-confidence widening (Part 2E): a frame the tracker isn't sure
        # about gets MORE margin, not the same tight crop — a wrong-by-a-
        # little prediction is far more likely to still contain the athlete
        # in a wider box than a tight one.
        conf = confidences[i] if confidences is not None and i < len(confidences) else 1.0
        side *= (1.0 + max(0.0, 0.5 - conf) * 0.6)
        # Phase 5.0B (Part F): a SEPARATE, additive widening from real
        # positional-disagreement evidence (box_tracker.py's own
        # trajectoryResidualFrameWidths — already frame-width-normalized,
        # so this is not fps/athlete-size/resolution dependent). Only fires
        # on real, disclosed evidence of localization risk; bounded so it
        # can never runaway ("do not assume more padding is always
        # better" — this widens ONLY when there is real evidence, up to a
        # hard ceiling).
        #
        # Real bug found and fixed via this phase's own production rerun
        # (docs/phase-5-0b-adaptive-crop-geometry.md Section 6.1): gating
        # this ONLY on `risk_fw[i]` is not enough — `trajectoryResidualFrameWidths`
        # grows continuously even on a PERFECTLY STATIC box (the "expected"
        # position keeps advancing from established velocity while the real
        # box does not move — the exact, documented signature Phase 4.2H's
        # own coast-risk model already uses elsewhere), so it would make a
        # genuinely frozen/background-locked box's crop creep every frame
        # even though nothing about the localization itself changed —
        # accidentally weakening box_tracker.py's own frozen-track detector,
        # which partly relies on the crop staying bit-for-bit identical
        # across a real freeze (`repeatedIdenticalCropCount`). Fix: only
        # apply risk-widening on a frame with REAL, FRESH per-frame box
        # evidence this exact frame (`boxes[i] is not None`, i.e. an actual
        # detected/tracked sample, not a held/extrapolated gap frame) AND
        # that evidence genuinely differs from the immediately preceding
        # real sample — a repeated, bit-identical real box (the true freeze
        # signature) is correctly excluded from widening, while a held/
        # extrapolated gap frame (which was never real evidence to react to
        # in the first place) is excluded too, without touching the
        # separate, pre-existing MAX_CENTER_STEP_FRAC/MAX_SIDE_CHANGE_FRAC
        # bounded-catch-up convergence below, which must keep running every
        # frame regardless (Test 12/17 of this phase's own fixture suite).
        # Real evidence found via this phase's own second production rerun
        # (docs/phase-5-0b-adaptive-crop-geometry.md Section 6.2): exact
        # (`==`) equality between consecutive REAL box_tracker.py outputs
        # essentially never holds, even during a genuine background lock —
        # optical flow is recomputed every frame against slightly different
        # pixel noise, so a functionally-static box still reports tiny,
        # sub-pixel position deltas frame to frame. A bounded EPSILON
        # (0.0005 frame-widths ≈ 1px at 1920px width — small enough that no
        # real athlete motion at any of this project's real fps classes
        # could produce a smaller true displacement in one frame) replaces
        # exact equality so this gate correctly recognizes "functionally
        # frozen" the same way box_tracker.py's own freeze detector does.
        CROP_FRESH_EVIDENCE_EPS_FW = 0.0005
        eps_px = CROP_FRESH_EVIDENCE_EPS_FW * width

        def _box_near(a, b):
            return a is not None and b is not None and abs(a[0] - b[0]) < eps_px and abs(a[1] - b[1]) < eps_px and abs(a[3] - b[3]) < eps_px

        has_fresh_evidence = (
            boxes is not None and i < len(boxes) and boxes[i] is not None
            and not (i > 0 and _box_near(boxes[i], boxes[i - 1]))
        )
        risk = risk_fw[i] if (has_fresh_evidence and risk_fw is not None and i < len(risk_fw) and risk_fw[i] is not None) else 0.0
        side *= (1.0 + min(CROP_RISK_WIDEN_MAX_FRAC, max(0.0, risk) * CROP_RISK_WIDEN_GAIN))
        cx_shifted = cx
        lead_px = 0.0
        if direction_sign:
            # Phase 5.0B (Part G): a bounded, VELOCITY-AND-TIME-SCALED
            # forward lead — replaces the prior fixed 0.12*side fraction,
            # which applied the same geometric offset to every clip
            # regardless of how fast (or whether) the athlete was actually
            # moving. Velocity is derived from this SAME segment-aware,
            # already-smoothed track (real evidence, not a new signal);
            # the lead is real elapsed time (CROP_PREDICTION_HORIZON_MS)
            # times that velocity, clamped to a bounded fraction of the
            # crop's own half-side so it can never runaway or itself claim
            # to BE localization — it only shifts where the CROP looks,
            # never `scientificAthleteBox`'s own provenance.
            velocity_px_per_ms = 0.0
            # Real bug found and fixed via this phase's own production
            # rerun (docs/phase-5-0b-adaptive-crop-geometry.md Section 6.2):
            # a naive `track[i]-track[i-1]` velocity is spurious exactly at
            # a fresh segment boundary — the previous sample can belong to a
            # DIFFERENT segment (held flat across a real, unsupported gap,
            # or a genuine reacquisition jump to a distant position), so the
            # "velocity" there is an artifact of segmentation, not real
            # athlete motion. Only compute velocity within the SAME segment
            # (`seg_id[i] == seg_id[i-1]`) — a fresh segment start correctly
            # gets zero lead until it has at least one real, same-segment
            # neighbor, matching this file's own established "reacquisition
            # resets everything" convention used elsewhere.
            if i > 0 and seg_id[i] is not None and seg_id[i - 1] == seg_id[i]:
                velocity_px_per_ms = (track[i][0] - track[i - 1][0]) / dt_ms
            lead_px = velocity_px_per_ms * direction_sign * CROP_PREDICTION_HORIZON_MS
            max_lead_px = (side / 2.0) * CROP_MAX_LEAD_FRAC
            lead_px = max(-max_lead_px, min(max_lead_px, lead_px))
            # A real, physically-justified lead only ever pushes FORWARD in
            # the configured travel direction — a real velocity opposite to
            # the configured direction (e.g. a brief backward correction)
            # must never pull the crop backward past center; floor at 0.
            if direction_sign * lead_px < 0:
                lead_px = 0.0
            cx_shifted = cx + lead_px
        # Phase 5.0B (Part H): a bounded, evidence-derived downward shift of
        # the crop's vertical anchor — see CROP_VERTICAL_FOOT_BIAS_FRAC's own
        # docstring above for the real, cross-benchmark margin-asymmetry
        # evidence this is based on.
        #
        # Real regression found and fixed via this phase's own production
        # rerun of the PROTECTED Gav benchmark (docs/phase-5-0b-adaptive-
        # crop-geometry.md Section 6.3): an initial, UNCONDITIONAL version
        # of this shift (applied every frame, regardless of any per-frame
        # evidence) changed Gav's own MediaPipe pose output on all 142
        # frames (a different crop framing shifts exact sub-pixel landmark
        # positions even on an otherwise-successful detection), moving
        # `strideFrequencyHz` from the established 4.4 baseline to 4.24 — a
        # real, measured violation of Gav's exact-match invariant, this
        # project's single most load-bearing non-regression contract. Fix:
        # gate the shift on the SAME real, fresh-evidence condition Section
        # F's risk-widening already uses — it now only engages when there is
        # already real evidence of localization risk this exact frame, the
        # same real circumstance (Vanni 240's 470-527 window) this phase's
        # own audit evidence is drawn from. On a cleanly-tracked benchmark
        # like Gav, where that evidence essentially never fires, the crop's
        # vertical anchor is now correctly unaffected.
        if CROP_RISK_WIDEN_GAIN > 0.0 and has_fresh_evidence and risk > 0.0:
            cy = cy + CROP_VERTICAL_FOOT_BIAS_FRAC * (side / 2.0)
        if prev_final is not None:
            pcx, pcy, pside = prev_final
            max_step = pside * MAX_CENTER_STEP_FRAC
            dx, dy = cx_shifted - pcx, cy - pcy
            dist = math.hypot(dx, dy)
            if dist > max_step and dist > 1e-6:
                scale = max_step / dist
                cx_shifted = pcx + dx * scale
                cy = pcy + dy * scale
            max_side = pside * (1.0 + MAX_SIDE_CHANGE_FRAC)
            min_side_step = pside * (1.0 - MAX_SIDE_CHANGE_FRAC)
            side = min(max_side, max(min_side_step, side))
        prev_final = (cx_shifted, cy, side)
        half = side / 2.0
        x0, y0, x1, y1 = cx_shifted - half, cy - half, cx_shifted + half, cy + half
        # Shift (don't shrink) back inside the frame to keep the crop square.
        if x0 < 0: x1 -= x0; x0 = 0
        if y0 < 0: y1 -= y0; y0 = 0
        if x1 > width: x0 -= (x1 - width); x1 = width
        if y1 > height: y0 -= (y1 - height); y1 = height
        x0, y0 = int(max(0, round(x0))), int(max(0, round(y0)))
        x1, y1 = int(min(width, round(x1))), int(min(height, round(y1)))
        crops.append((x0, y0, x1, y1) if (x1 - x0 >= 8 and y1 - y0 >= 8) else (0, 0, width, height))
        adjustment_reason = None
        if CROP_RISK_WIDEN_GAIN > 0.0 and has_fresh_evidence and risk > 0.0:
            adjustment_reason = "risk_widen"
        elif conf < 0.5:
            adjustment_reason = "low_confidence_widen"
        diagnostics.append({
            "predictedCenterOffsetPx": lead_px if direction_sign else None,
            "cropScaleFactor": (side / base_side) if base_side > 0 else None,
            "cropAdjustmentReason": adjustment_reason,
        })
    return crops, diagnostics


# Phase 4.2C (Part 3): crop validation outcomes. A crop is judged BEFORE it
# is trusted for scientific pose evidence — never after, and never by the
# frame's own pose result (that would be circular: the selected box would
# define the expected crop, and the crop's own success would validate the
# box that produced it). Every input here is PRIOR, already-decided
# localization state (`box_track_records[i]`, computed entirely during pass
# 1) plus pass-2's own crop-planning bookkeeping — never the pose result
# for the SAME frame being classified.
CROP_VALIDATION_OUTCOMES = (
    "crop_verified", "crop_provisional",
    "crop_rejected_frozen_localization", "crop_rejected_stale_box",
    "crop_rejected_frame_mismatch", "crop_rejected_invalid_geometry",
    "crop_rejected_unverified_identity", "crop_rejected_prediction_too_old",
    "crop_rejected_fallback_jump",
)


def classify_crop_validation(rec, box_frame_index, source_index, crop_fallback_reason, box, width, height, is_fallback_jump, bt):
    """Phase 4.2C (Part 3). `rec` is `box_track_records[source_index]` (may
    be None if pass 1 never ran for this frame at all — legacy fallback
    path). `box_frame_index` is the frame index the scientific box actually
    belongs to (always `source_index` in this single-pass, sequential
    architecture — checked explicitly below as a real invariant, not
    assumed). `box` is `boxes[source_index]` — `None` when
    `plan_crops()` had to extrapolate (either genuinely never detected, or
    a `frozen_suspect` span excluded by the pre-`plan_crops()` sync)."""
    if rec is None:
        return "crop_rejected_invalid_geometry"
    if box_frame_index is not None and box_frame_index != source_index:
        # Never actually reachable in this pipeline's single-threaded,
        # sequential pass-2 decode loop — checked as a real invariant
        # (Part 1's explicit requirement), not assumed true by construction.
        return "crop_rejected_frame_mismatch"
    if box is not None:
        bcx, bcy, bw, bh = box
        if bw <= 0 or bh <= 0 or bw > width * 1.5 or bh > height * 1.5:
            return "crop_rejected_invalid_geometry"
        if bcx < -bw or bcx > width + bw or bcy < -bh or bcy > height + bh:
            return "crop_rejected_invalid_geometry"
    if is_fallback_jump:
        return "crop_rejected_fallback_jump"
    if rec.boxOrigin == "frozen_suspect":
        return "crop_rejected_frozen_localization"
    if rec.boxOrigin == "invalid":
        return "crop_rejected_stale_box"
    if rec.boxOrigin == "predicted":
        # `box_tracker.py` itself never emits "predicted" once
        # `frames_since_verified > MAX_PREDICTED_FRAMES_BEFORE_REACQUIRING" —
        # this branch is a real, defensive double-check of that existing
        # bound (Part 3: "box is not predicted-only beyond its bounded
        # allowance"), not dead code: if that upstream invariant were ever
        # violated, this still catches it rather than silently trusting an
        # over-age prediction.
        limit = bt.MAX_PREDICTED_FRAMES_BEFORE_REACQUIRING if bt is not None else 6
        if (rec.framesSinceVerifiedDetection or 0) > limit:
            return "crop_rejected_prediction_too_old"
        return "crop_provisional"
    if rec.boxOrigin in ("detected", "reacquired"):
        return "crop_verified"
    if rec.boxOrigin == "tracked":
        # A live (not-yet-resolved) freeze suspicion is real, not-yet-
        # confirmed doubt — provisional, not an outright rejection (Part 6:
        # a suspect localization may still be visible in developer
        # diagnostics; scientific gating happens on the FINAL, possibly
        # retroactively-corrected `boxOrigin`, which by the time pass 2
        # reads it already reflects any `_resolve_freeze_run` outcome).
        if rec.freezeSuspect:
            return "crop_provisional"
        return "crop_verified"
    return "crop_rejected_unverified_identity"


def _box_iou(a, b):
    """IoU of two normalized {x,y,width,height} boxes (full-source-frame
    space). 0.0 when disjoint, never negative."""
    ax0, ay0, ax1, ay1 = a["x"], a["y"], a["x"] + a["width"], a["y"] + a["height"]
    bx0, by0, bx1, by1 = b["x"], b["y"], b["x"] + b["width"], b["y"] + b["height"]
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    iw, ih = max(0.0, ix1 - ix0), max(0.0, iy1 - iy0)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    union = a["width"] * a["height"] + b["width"] * b["height"] - inter
    return inter / union if union > 0 else 0.0


# Phase 4.2C (Part 5): bounded pose-as-localization-feedback thresholds.
# Real-time based (ms), not frame counts, so behavior is equivalent across
# FPS classes. `POSE_MISS_SUSPECT_MS` mirrors box_tracker.py's own
# `FREEZE_MIN_SUSPECT_MS` philosophy (a brief miss is normal noise; a
# sustained one on an UNCHANGING crop is real negative evidence) — sized
# larger (200ms vs. 100ms) because a single pose miss is weaker evidence on
# its own than the two independent, continuously-computed box_tracker
# signals (feature spread + trajectory residual): pose either successfully
# finds a person in the crop or it doesn't, a coarser, binary signal that
# deserves more corroborating time before acting on it alone.
POSE_MISS_SUSPECT_MS = 200.0
# `POSE_MISS_SUSPECT_IDENTICAL_CROP_MS` — real bug found via this phase's
# own real production rerun of `vanni_fly_240` (240fps): an EARLIER version
# of this contract gated on a raw CONSECUTIVE-FRAME count of identical crop
# rects (3 frames) instead of real elapsed time. `plan_crops()` rounds its
# output to whole pixels — at 240fps, genuine sub-pixel frame-to-frame
# athlete motion routinely rounds to the SAME integer pixel rect for
# several consecutive frames even while tracking is completely healthy, so
# a bare frame-count threshold triggers many times more often at high FPS
# than at low FPS for the exact same real elapsed time — the opposite of
# "time-normalized." That bug alone flagged 534/1020 (52%) of
# `vanni_fly_240`'s frames as `frozen_suspect`, most of them nowhere near
# any real freeze. Fixed: gated on how long (real ms) the crop rect has
# stayed identical, matching `POSE_MISS_SUSPECT_MS`'s own magnitude and
# philosophy — verified fps-equivalent (Part 13 tests 21).
POSE_MISS_SUSPECT_IDENTICAL_CROP_MS = 200.0
POSE_IOU_DISAGREEMENT_FLOOR = 0.15  # below this, pose and localization are not looking at the same region


def apply_pose_localization_feedback(frames, src_fps):
    """Phase 4.2C (Part 5) — bounded, post-hoc pose-vs-localization
    feedback. Pose results only exist after pass 2 completes (this
    pipeline's two-pass architecture — see docs/phase-4-2b-frozen-track-
    production-wiring.md Section 17, item 5 — means pose evidence cannot
    inform pass 1's REAL-TIME localization decisions at all; this is a
    disclosed, real architectural limit, not fixed this phase). What IS
    real and implemented: pose evidence retroactively CORROBORATES or
    DISPUTES pass 1's already-made decisions, exactly mirroring how
    `_resolve_freeze_run` already retroactively corrects `box_tracker.py`'s
    own decisions from a LATER detector event — this is the same pattern,
    a second, independent source of retroactive correction.

    Pose is never the SOLE authority (per this phase's explicit
    requirement): it can only downgrade an already-`tracked` frame to
    `frozen_suspect` (case D below) — it can never promote a frame's
    eligibility, and it never touches a frame the box tracker already
    marked `detected`/`reacquired` (identity-verified evidence outranks a
    post-hoc pose comparison)."""
    identical_crop_count = 0
    prev_crop_key = None
    identical_crop_start_ms = None
    miss_run_start_ms = None
    for f in frames:
        pose_found = bool(f.get("landmarks"))
        crop = f.get("cropRect")
        crop_key = (round(crop["x0"], 4), round(crop["y0"], 4), round(crop["x1"], 4), round(crop["y1"], 4)) if crop else None
        t_ms_for_crop = f.get("sourceTimestampMs")
        if t_ms_for_crop is None:
            t_ms_for_crop = f.get("timestampMs", 0.0)
        if crop_key is not None and crop_key == prev_crop_key:
            identical_crop_count += 1
        else:
            identical_crop_count = 0
            identical_crop_start_ms = t_ms_for_crop
        prev_crop_key = crop_key
        f["repeatedIdenticalCropCount"] = identical_crop_count
        # Time-normalized companion to the frame-count diagnostic above —
        # THIS is what the case-D decision below actually gates on.
        identical_crop_duration_ms = (
            t_ms_for_crop - identical_crop_start_ms if identical_crop_start_ms is not None else 0.0
        )

        t_ms = f.get("sourceTimestampMs")
        if t_ms is None:
            t_ms = f.get("timestampMs", 0.0)
        if pose_found:
            miss_run_start_ms = None
            miss_duration_ms = 0.0
        else:
            if miss_run_start_ms is None:
                miss_run_start_ms = t_ms
            miss_duration_ms = t_ms - miss_run_start_ms
        f["poseMissDurationMs"] = miss_duration_ms

        scientific_box = f.get("scientificAthleteBox")
        iou, residual_px, corroborates = None, None, None
        if pose_found and scientific_box is not None:
            xs = [p["x"] for p in f["landmarks"]]
            ys = [p["y"] for p in f["landmarks"]]
            pose_box = {"x": min(xs), "y": min(ys), "width": max(0.0, max(xs) - min(xs)), "height": max(0.0, max(ys) - min(ys))}
            iou = _box_iou(pose_box, scientific_box)
            pcx, pcy = pose_box["x"] + pose_box["width"] / 2.0, pose_box["y"] + pose_box["height"] / 2.0
            scx, scy = scientific_box["x"] + scientific_box["width"] / 2.0, scientific_box["y"] + scientific_box["height"] / 2.0
            source_width = f.get("sourceWidth") or 1
            residual_px = math.hypot(pcx - scx, pcy - scy) * source_width
            corroborates = iou >= POSE_IOU_DISAGREEMENT_FLOOR
        f["poseBoundsIoU"] = iou
        f["poseLocalizationResidualPx"] = residual_px
        f["poseCorroboratesLocalization"] = corroborates

        action, reason = "none", None
        origin = f.get("localizationOrigin")
        if origin == "frozen_suspect":
            # Case G: pose existing during an already-confirmed freeze does
            # NOT restore scientific eligibility — no action, ever.
            action, reason = "none", "already_frozen_suspect_not_restored"
        elif not pose_found:
            if miss_duration_ms < POSE_MISS_SUSPECT_MS:
                # Cases B/C: one miss, or a short streak — no action.
                action, reason = "none", "short_pose_miss_tolerated"
            elif identical_crop_duration_ms >= POSE_MISS_SUSPECT_IDENTICAL_CROP_MS and origin == "tracked":
                # Case D: repeated no-person result on a crop that has not
                # meaningfully moved for several consecutive frames, on a
                # box the tracker itself has NOT already identity-verified
                # this frame — real, bounded, corroborating evidence of a
                # stale/frozen localization. Downgrades exactly like
                # `_resolve_freeze_run` (boxOrigin -> frozen_suspect only;
                # never rewrites the box itself, never fabricates a
                # position, never touches a detected/reacquired frame).
                action, reason = "suspicion_flagged", "repeated_pose_miss_on_frozen_crop"
                f["boxOrigin"] = "frozen_suspect"
                f["localizationOrigin"] = "frozen_suspect"
                f["frozenDecision"] = "pose_corroborated_freeze"
                f["cropValidation"] = "crop_rejected_frozen_localization"
                f["cropRejected"] = True
                f["cropRejectedReason"] = "crop_rejected_frozen_localization"
            else:
                action, reason = "none", "pose_miss_without_corroborating_stale_crop_evidence"
        elif corroborates is False and origin in ("tracked", "detected", "reacquired"):
            # Cases E/F: pose found, but disagrees strongly with the
            # scientific box. Diagnostic-only (Part 5: pose must not become
            # the sole authority) — flagged, not auto-downgraded, since a
            # single frame's pose-vs-box disagreement is weaker evidence
            # than the two independent box_tracker signals that DO trigger
            # a real correction.
            action, reason = "disagreement_flagged", "pose_bounds_disagree_with_scientific_box"
        f["localizationFeedbackAction"] = action
        f["localizationFeedbackReason"] = reason


# --- Phase 4.2J: bounded, retroactive, short-interval localization -----
# adjudication using pose-bounds evidence -------------------------------
#
# Phase 4.2I's own audit found `poseBoundsIoU` correlates with `vanni_fly_240`'s
# real, short, in-zone localization degradation — but also found it is
# genuinely imperfect for the protected Gav benchmark (45 real low-IoU
# frames). A real, frame-by-frame source-evidence audit this phase (see
# docs/phase-4-2j-retroactive-short-interval-adjudication.md Sections 3-6)
# found the two benchmarks' low-IoU cases have a DIFFERENT real shape:
#
#   - `vanni_fly_240` frames 487-526: the tracker's own `scientificAthleteBox`
#     genuinely LAGS behind the athlete's real position (confirmed via real
#     pose keypoints, which independently match the true, original Phase
#     1/2 hand-verified torso trajectory) — a real, systematic ~0.06-0.07
#     frame-width offset that grows across the interval, and the pipeline's
#     own next real identity-verified detector confirmation does not occur
#     for another ~340ms (81 frames) — genuinely nothing else in this
#     pipeline recovers this evidence before the interval already ended.
#   - Gav frames 44-51: a real, similarly-shaped short freeze (the tracker
#     box is bit-for-bit frozen while pose shows real continued motion) —
#     but Gav's own next real identity-verified detector confirmation
#     arrives only ~133ms (8 frames) later, naturally resolving it via the
#     EXISTING pipeline with no intervention needed.
#
# `poseBoundsIoU`/`poseLocalizationResidualPx` ALONE cannot distinguish
# these two real cases (both dip to IoU≈0.000 with a comparably real,
# non-trivial residual) — the real, evidenced discriminator is WHETHER THE
# EXISTING PIPELINE ALREADY RECOVERS on its own shortly afterward. This is
# why adjudication is retroactive/offline (AVA analyzes uploaded video, so
# the full timeline — including whether a natural recovery follows — is
# already known) and bounded by a real look-ahead window sized from this
# exact real evidence (the true 133ms/340ms margin), not a blind guess.
ADJUDICATION_IOU_MAX = 0.10  # candidate gate: pose and box must genuinely, severely disagree
ADJUDICATION_RESIDUAL_MIN_FW = 0.04  # candidate gate: rules out pure BOX_PADDING size-mismatch noise (Gav's own ordinary low-IoU frames average ~0.02-0.03fw residual)
# The real, decisive discriminator: does the EXISTING pipeline's own next
# identity-verified confirmation arrive soon enough that no correction is
# needed at all? Sized from real evidence: Gav's own genuine short freeze
# self-resolves in ~133ms; vanni_fly_240's real, unrecovered case does not
# resolve for ~340ms. 200ms sits strictly between the two real, measured
# values.
ADJUDICATION_LOOKAHEAD_MS = 200.0
ADJUDICATION_MAX_INTERVAL_MS = 500.0  # Part E's own "interval duration is bounded" requirement
# A sanity bound on how far ANY single correction may move the box —
# comfortably above the real ~0.07fw gap this phase's own evidence found,
# so a genuine correction is never rejected, but large enough to catch a
# genuinely implausible ("impossible jump") proposed correction.
ADJUDICATION_MAX_CORRECTION_FW = 0.15
ADJUDICATION_KEYPOINT_VISIBILITY_FLOOR = 0.4
ADJUDICATION_MIN_KEYPOINTS = 4


def _pose_derived_box(landmarks, width, height):
    """A real, pose-evidence-derived box — the min/max extent of every
    confident (visibility >= floor) landmark this frame, padded with the
    SAME `BOX_PADDING`/`MIN_BOX_SIDE_PX` convention box_tracker.py's own
    detector-candidate boxes use, for a like-for-like comparison. `None`
    when there aren't enough confident keypoints (never fabricates a box
    from insufficient evidence)."""
    pts = [(lm["x"], lm["y"]) for lm in landmarks if (lm.get("visibility", 1.0) >= ADJUDICATION_KEYPOINT_VISIBILITY_FLOOR)]
    if len(pts) < ADJUDICATION_MIN_KEYPOINTS:
        return None
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    cx = (min(xs) + max(xs)) / 2.0 * width
    cy = (min(ys) + max(ys)) / 2.0 * height
    raw_w = max(1e-6, (max(xs) - min(xs))) * width
    raw_h = max(1e-6, (max(ys) - min(ys))) * height
    box_w = max(raw_w * 1.3, 60)  # matches box_tracker.py's BOX_PADDING / MIN_BOX_SIDE_PX
    box_h = max(raw_h * 1.3, 60)
    return (cx, cy, box_w, box_h)


def adjudicate_short_disagreement_intervals(frames, src_fps, width, height):
    """Phase 4.2J (Parts C-H) — the real adjudication pass. Runs AFTER
    `apply_pose_localization_feedback` (so any frame it already downgraded
    to `frozen_suspect` is correctly excluded here too — this function
    never touches a `frozen_suspect`/`invalid`/`detected`/`reacquired`
    frame, only `tracked` frames, mirroring that function's own "identity-
    verified evidence outranks a post-hoc comparison" contract).

    For every candidate interval (contiguous `tracked` frames with severe,
    real pose/box disagreement — see ADJUDICATION_IOU_MAX/_RESIDUAL_MIN_FW),
    decides, using MULTIPLE independent real evidence sources (never
    `poseBoundsIoU` alone, per this phase's own explicit requirement):

      - interval_tracker_corroborated: the pipeline's own next real
        identity-verified confirmation arrives within ADJUDICATION_LOOKAHEAD_MS
        — the existing pipeline already self-heals; no correction applied.
      - interval_correctable_from_verified_anchors: the full retroactive
        correction contract (bounded duration, real before/after anchors,
        a plausible pose-derived correction, no impossible jump) is
        satisfied — the box is corrected FROM REAL POSE EVIDENCE for this
        exact interval, original values fully preserved (Part F).
      - interval_rejected_tracker_drift: real, severe disagreement exists,
        the pipeline's own cadence does not recover it — but the contract
        itself is not satisfied (no valid anchors, too long, an
        implausible jump, or insufficient keypoints) — left uncorrected,
        honestly flagged as a real, disclosed, unresolved suspicion.
    """
    n = len(frames)
    src_fps = src_fps or 1.0

    def t_ms(idx):
        f = frames[idx]
        v = f.get("sourceTimestampMs")
        return v if v is not None else f.get("tMs", idx / src_fps * 1000.0)

    # 1. Find candidate frames.
    candidate = [False] * n
    for i, f in enumerate(frames):
        if f.get("localizationOrigin") != "tracked":
            continue
        iou = f.get("poseBoundsIoU")
        res_px = f.get("poseLocalizationResidualPx")
        if iou is None or res_px is None:
            continue
        res_fw = res_px / width if width else 0.0
        if iou < ADJUDICATION_IOU_MAX and res_fw >= ADJUDICATION_RESIDUAL_MIN_FW:
            candidate[i] = True

    # 2. Group into contiguous intervals.
    intervals = []
    i = 0
    while i < n:
        if candidate[i]:
            j = i
            while j + 1 < n and candidate[j + 1]:
                j += 1
            intervals.append((i, j))
            i = j + 1
        else:
            i += 1

    adjudicated_count = 0
    corroborated_count = 0
    rejected_count = 0
    for start, end in intervals:
        duration_ms = (t_ms(end) - t_ms(start)) + (1000.0 / src_fps)
        reason = None
        decision = None

        # Real evidence: does the pipeline's own next identity-verified
        # confirmation arrive soon enough that this needs no help at all?
        next_confirmed = None
        for k in range(end + 1, min(n, end + 1 + int(ADJUDICATION_LOOKAHEAD_MS / 1000.0 * src_fps) + 5)):
            if frames[k].get("localizationOrigin") in ("detected", "reacquired"):
                next_confirmed = k
                break
        if next_confirmed is not None and (t_ms(next_confirmed) - t_ms(end)) <= ADJUDICATION_LOOKAHEAD_MS:
            decision = "interval_tracker_corroborated"
            reason = "natural_reconfirmation_within_lookahead"
        elif duration_ms > ADJUDICATION_MAX_INTERVAL_MS:
            decision = "interval_rejected_tracker_drift"
            reason = "interval_exceeds_max_bounded_duration"
        else:
            # Real before/after anchors: the frame immediately outside the
            # interval on each side must itself be a trustworthy reference
            # (not itself a disagreement candidate, and not a fabricated/
            # predicted frame).
            before_idx = start - 1
            after_idx = end + 1
            before_ok = before_idx >= 0 and not candidate[before_idx] and frames[before_idx].get("localizationOrigin") in ("tracked", "detected", "reacquired")
            after_ok = after_idx < n and not candidate[after_idx] and frames[after_idx].get("localizationOrigin") in ("tracked", "detected", "reacquired")
            if not (before_ok and after_ok):
                decision = "interval_rejected_tracker_drift"
                reason = "no_valid_before_after_anchor"
            else:
                # Compute a real, pose-derived corrected box for every
                # frame in the interval, and check the FULL contract.
                corrected = {}
                ok = True
                prev_center = None
                prev_t = None
                for idx in range(start, end + 1):
                    lm = frames[idx].get("landmarks")
                    if not lm:
                        ok, reason = False, "insufficient_pose_evidence_in_interval"
                        break
                    box = _pose_derived_box(lm, width, height)
                    if box is None:
                        ok, reason = False, "insufficient_pose_evidence_in_interval"
                        break
                    # No impossible jump: frame-to-frame displacement of the
                    # PROPOSED correction must itself stay physically
                    # plausible (bounded relative to the interval's own
                    # real elapsed time) — never a fabricated teleport.
                    if prev_center is not None:
                        dt = t_ms(idx) - prev_t
                        if dt > 0:
                            step_fw = math.hypot(box[0] - prev_center[0], box[1] - prev_center[1]) / width
                            # A generous but real physical bound: no single
                            # frame-to-frame step may exceed the same
                            # ADJUDICATION_MAX_CORRECTION_FW bound used for
                            # the overall correction distance.
                            if step_fw > ADJUDICATION_MAX_CORRECTION_FW:
                                ok, reason = False, "implausible_jump_in_corrected_path"
                                break
                    prev_center = (box[0], box[1])
                    prev_t = t_ms(idx)
                    corrected[idx] = box
                if ok:
                    orig_box = frames[start].get("scientificAthleteBox")
                    if orig_box is not None:
                        ocx = orig_box["x"] + orig_box["width"] / 2.0
                        ocy = orig_box["y"] + orig_box["height"] / 2.0
                        ccx, ccy = corrected[start][0] / width, corrected[start][1] / height
                        correction_dist_fw = math.hypot(ccx - ocx, ccy - ocy)
                        if correction_dist_fw > ADJUDICATION_MAX_CORRECTION_FW:
                            ok, reason = False, "correction_exceeds_max_distance"
                if ok:
                    decision = "interval_correctable_from_verified_anchors"
                    reason = "pose_derived_bounds_within_bounded_anchors"
                else:
                    decision = "interval_rejected_tracker_drift"

        # Apply provenance (Part F) — original values are NEVER overwritten,
        # only ever additively recorded alongside.
        pose_evidence_frames = [k for k in range(start, end + 1) if frames[k].get("landmarks")]
        for idx in range(start, end + 1):
            f = frames[idx]
            f["originalLocalizationState"] = f.get("localizationOrigin")
            f["originalBox"] = f.get("scientificAthleteBox")
            f["adjudicationStartFrame"] = start
            f["adjudicationEndFrame"] = end
            f["beforeAnchorFrame"] = start - 1
            f["afterAnchorFrame"] = end + 1
            f["poseEvidenceFrames"] = pose_evidence_frames
            f["detectorEvidenceFrames"] = [next_confirmed] if next_confirmed is not None else []
            f["adjudicationReason"] = reason
            f["scientificEligibilityBefore"] = f.get("localizationOrigin") in ("tracked", "detected", "reacquired")
            if decision == "interval_correctable_from_verified_anchors":
                box = corrected[idx]
                new_box = {"x": box[0] / width - box[2] / width / 2.0, "y": box[1] / height - box[3] / height / 2.0,
                           "width": box[2] / width, "height": box[3] / height}
                orig_box = f.get("scientificAthleteBox")
                dist_px = None
                dist_fw = None
                if orig_box is not None:
                    ocx = (orig_box["x"] + orig_box["width"] / 2.0) * width
                    ocy = (orig_box["y"] + orig_box["height"] / 2.0) * height
                    dist_px = math.hypot(box[0] - ocx, box[1] - ocy)
                    dist_fw = dist_px / width
                f["adjudicatedLocalizationState"] = "tracked"
                f["adjudicatedBox"] = new_box
                f["adjudicationSource"] = "pose_derived_bounds"
                f["interpolationUsed"] = False
                f["correctionDistancePx"] = dist_px
                f["correctionDistanceFrameWidths"] = dist_fw
                f["scientificAthleteBox"] = new_box
                f["cropPlannerInputBox"] = new_box
                f["scientificEligibilityAfter"] = True
            else:
                f["adjudicatedLocalizationState"] = f.get("localizationOrigin")
                f["adjudicatedBox"] = f.get("scientificAthleteBox")
                f["adjudicationSource"] = None
                f["interpolationUsed"] = False
                f["correctionDistancePx"] = None
                f["correctionDistanceFrameWidths"] = None
                f["scientificEligibilityAfter"] = f.get("localizationOrigin") in ("tracked", "detected", "reacquired")
            f["adjudicationDecision"] = decision

        if decision == "interval_correctable_from_verified_anchors":
            adjudicated_count += 1
        elif decision == "interval_tracker_corroborated":
            corroborated_count += 1
        else:
            rejected_count += 1

    if intervals:
        print(
            "phase-4-2j adjudication: %d candidate interval(s) — %d corrected, %d naturally self-resolved, %d rejected/unresolved"
            % (len(intervals), adjudicated_count, corroborated_count, rejected_count),
            file=sys.stderr,
        )
    return {"candidateIntervals": len(intervals), "corrected": adjudicated_count, "selfResolved": corroborated_count, "rejected": rejected_count}


# Phase 5.0B (Part E) — the full-body containment contract. A scientific
# pose crop should preserve head, torso, pelvis, both knees, both ankles,
# both heels, both foot indices; hands are retained where practical but
# feet have higher sprint-analysis priority (per this phase's own explicit
# scientific principle). States are interpretable, not a hidden score —
# every one traces to a specific, disclosed margin computation, using only
# THIS frame's own already-computed crop rect and pose result (never a
# downstream metric).
CROP_CONTAINMENT_STATES = (
    "crop_full_body_verified", "crop_full_body_provisional", "crop_foot_at_risk",
    "crop_head_at_risk", "crop_extremity_clipped", "crop_stale", "crop_prediction_only", "crop_invalid",
)
CROP_FOOT_JOINTS = ("left_ankle", "right_ankle", "left_heel", "right_heel", "left_toe", "right_toe")
CROP_CONTAINMENT_REQUIRED_JOINTS = ("nose", "left_hip", "right_hip", "left_knee", "right_knee") + CROP_FOOT_JOINTS
# MediaPipe landmark index -> canonical joint name, restricted to the joints
# this contract cares about (same canonical names pose.ts's CANONICAL_JOINTS
# uses downstream) — `landmarks` in the pass-2 loop is the raw, positional,
# MediaPipe-indexed list (`landmark_dict()` output), not yet the named
# `keypoints` record (that adaptation happens later, in MediaPipePoseBackend.ts).
CROP_CONTAINMENT_LANDMARK_INDEX = {
    0: "nose", 23: "left_hip", 24: "right_hip", 25: "left_knee", 26: "right_knee",
    27: "left_ankle", 28: "right_ankle", 29: "left_heel", 30: "right_heel", 31: "left_toe", 32: "right_toe",
}
# Normalized (by min(crop width, crop height)) margin below which a joint is
# "at risk" of clipping on the NEXT frame even though not clipped yet —
# real, disclosed, and identical to the bucket floor Part B's own audit
# used (0-2%/2-5%/5-10%/>10%) so containment-state and audit-evidence share
# one vocabulary.
CROP_MARGIN_RISK_FRAC = 0.05


def classify_crop_containment(landmarks_by_name, crop_rect_norm, width, height, box_origin, crop_used_stale_box, crop_used_prediction):
    """Phase 5.0B (Part E/J). Uses ONLY this frame's own real, already-
    computed evidence: `crop_rect_norm` (the crop MediaPipe was ACTUALLY
    given, normalized source-space x0/y0/x1/y1) and `landmarks_by_name`
    (the real pose landmarks MediaPipe actually returned, remapped to
    source-space — never a downstream metric, never a different frame's
    evidence). Returns (state, diagnostics dict) — diagnostics carries the
    normalized margins persisted separately (Part J)."""
    empty_diag = {
        "cropUtilization": None, "footBoundaryRisk": None, "headBoundaryRisk": None,
        "minJointMarginNormalized": None, "forwardMarginNormalized": None,
        "rearMarginNormalized": None, "bottomMarginNormalized": None,
    }
    if box_origin == "invalid" or crop_rect_norm is None:
        return "crop_invalid", empty_diag
    if crop_used_stale_box:
        return "crop_stale", empty_diag
    if crop_used_prediction:
        return "crop_prediction_only", empty_diag
    if not landmarks_by_name:
        return "crop_invalid", empty_diag

    cw = (crop_rect_norm["x1"] - crop_rect_norm["x0"]) * width
    ch = (crop_rect_norm["y1"] - crop_rect_norm["y0"]) * height
    if cw <= 0 or ch <= 0:
        return "crop_invalid", empty_diag
    min_side_px = min(cw, ch)

    def margins(name):
        lm = landmarks_by_name.get(name)
        if not lm:
            return None
        vis = lm.get("visibility")
        if vis is not None and vis < 0.4:
            return None
        jx, jy = lm["x"] * width, lm["y"] * height
        return {
            "l": jx - crop_rect_norm["x0"] * width, "r": crop_rect_norm["x1"] * width - jx,
            "t": jy - crop_rect_norm["y0"] * height, "b": crop_rect_norm["y1"] * height - jy,
        }

    per_joint = {name: margins(name) for name in CROP_CONTAINMENT_REQUIRED_JOINTS}
    present = {name: m for name, m in per_joint.items() if m is not None}
    if not present:
        return "crop_invalid", empty_diag

    all_mins = [min(m.values()) for m in present.values()]
    min_margin_px = min(all_mins)
    clipped = min_margin_px < 0
    foot_present = [name for name in CROP_FOOT_JOINTS if per_joint.get(name) is not None]
    foot_mins = [min(per_joint[j].values()) for j in foot_present]
    head_margin = per_joint.get("nose")
    completeness = len(present) / len(CROP_CONTAINMENT_REQUIRED_JOINTS)

    foot_at_risk = bool(foot_mins) and (min(foot_mins) / min_side_px) < CROP_MARGIN_RISK_FRAC
    head_at_risk = head_margin is not None and (min(head_margin.values()) / min_side_px) < CROP_MARGIN_RISK_FRAC

    # Athlete body-extent proxy for utilization/directional margins — the
    # real pose-derived extent of the joints we already have, not a
    # separate detector call.
    xs = [landmarks_by_name[n]["x"] * width for n in present]
    ys = [landmarks_by_name[n]["y"] * height for n in present]
    athlete_w = max(xs) - min(xs) if len(xs) > 1 else 0.0
    athlete_h = max(ys) - min(ys) if len(ys) > 1 else 0.0
    diag = {
        "cropUtilization": (athlete_w * athlete_h) / (cw * ch) if cw * ch > 0 else None,
        "footBoundaryRisk": foot_at_risk,
        "headBoundaryRisk": head_at_risk,
        "minJointMarginNormalized": min_margin_px / min_side_px,
        "forwardMarginNormalized": (crop_rect_norm["x1"] * width - max(xs)) / cw if xs else None,
        "rearMarginNormalized": (min(xs) - crop_rect_norm["x0"] * width) / cw if xs else None,
        "bottomMarginNormalized": (crop_rect_norm["y1"] * height - max(ys)) / ch if ys else None,
    }

    if clipped or len(foot_present) < 4:
        return "crop_extremity_clipped", diag
    if foot_at_risk:
        return "crop_foot_at_risk", diag
    if head_at_risk:
        return "crop_head_at_risk", diag
    if completeness >= 0.9 and len(foot_present) == 6:
        return "crop_full_body_verified", diag
    return "crop_full_body_provisional", diag


# =============================================================================
# Phase 5.0C — Contact-critical foot landmark recovery. A BOUNDED, RETROACTIVE
# post-pass (same established architectural pattern as
# `apply_pose_localization_feedback`/`adjudicate_short_disagreement_intervals`
# — runs AFTER pass 2 fully completes, once every frame's primary pose and
# crop-containment provenance already exist). It NEVER touches Pass 1
# localization, NEVER touches an already-scientifically-eligible frame's
# torso/pelvis evidence, and runs AT MOST once per frame (Part F).
#
# Real evidence this design is built on (docs/phase-5-0c-contact-critical-foot-recovery.md):
#   - Part A's own audit: the one known Vanni 240 spurious contact (source
#     frame 964) sits in a region where the localization box's own right
#     edge is at x=1.023 (off the source image) and `coastRiskState` is
#     elevated for ~80 consecutive frames — this is why eligibility
#     requires BOTH the existing boxOrigin gate AND a real, elevated-
#     coast-risk exclusion (SECONDARY_RECOVERY_EXCLUDED_COAST_STATES) —
#     narrower than the primary pass's own existing eligibility gate,
#     deliberately, so this new mechanism can never treat that exact class
#     of frame as recoverable.
#   - Part E's own real diagnostic (scripts/phase-5-0c-secondary-crop-diagnostic.py):
#     an asymmetric, BOTTOM-BIASED crop (taller, not wider; a modest,
#     bounded vertical anchor shift toward the feet; zero width change)
#     recovered real foot evidence with HIGHER mean confidence than a
#     uniform +15% enlargement on frame 353 (0.971 vs 0.465) while
#     retaining full torso evidence on every real candidate frame tested —
#     the minimum, most targeted real geometry, not "20% bigger."
SECONDARY_RECOVERY_ENABLED = os.environ.get("MEDIAPIPE_SECONDARY_RECOVERY", "1").strip().lower() in ("1", "true", "yes", "on")
CONTACT_CRITICAL_JOINTS = ("left_ankle", "right_ankle", "left_heel", "right_heel", "left_toe", "right_toe")
# Same real coast-risk vocabulary box_tracker.py's own `_coast_risk_state()`
# already emits (Phase 4.2G/H) — states that mean "this frame's own
# localization, while not formally stripped, is not corroborated enough to
# treat as a safe anchor for a NEW recovery attempt."
SECONDARY_RECOVERY_UNSAFE_COAST_STATES = (
    "lost", "reacquiring", "refresh_required", "exited_frame",
    "elevated_trajectory_risk", "elevated_feature_risk",
)
SECONDARY_TORSO_REQUIRED_JOINTS = ("left_hip", "right_hip")
SECONDARY_TORSO_VISIBILITY_FLOOR = 0.4
# Bounded secondary-crop geometry (Part E) — a real, evidence-derived,
# asymmetric bottom bias; NEVER a uniform "N% bigger" scale.
SECONDARY_CROP_BOTTOM_HEIGHT_FRAC = _num("MEDIAPIPE_SECONDARY_CROP_BOTTOM_HEIGHT_FRAC", 0.20)  # +20% height only
SECONDARY_CROP_VERTICAL_SHIFT_FRAC = _num("MEDIAPIPE_SECONDARY_CROP_VERTICAL_SHIFT_FRAC", 0.10)  # anchor shift toward feet
# Anatomical/temporal bounds (Parts G/H) — real, physically-derived, never
# athlete- or fps-specific pixel constants.
SECONDARY_MAX_BONE_RATIO = 2.2   # matches Phase 5.0A's own bone-length-plausibility proxy band
SECONDARY_MIN_BONE_RATIO = 0.4
SECONDARY_MAX_FOOT_VELOCITY_FW_PER_S = 12.0  # frame-widths/second — a generous, real, physically-plausible ceiling for elite sprint foot-swing speed, applied via REAL elapsed source time (Part H), never a fixed-frame threshold


def _named_landmarks_from_positional(landmarks_list):
    """Positional (MediaPipe-indexed) landmarks -> a name-keyed dict, using
    the same CROP_CONTAINMENT_LANDMARK_INDEX mapping already established in
    Phase 5.0B (nose/hips/knees/ankles/heels/toes) plus shoulders, needed
    here for torso-coherence checks."""
    idx_map = dict(CROP_CONTAINMENT_LANDMARK_INDEX)
    idx_map[11] = "left_shoulder"
    idx_map[12] = "right_shoulder"
    if not landmarks_list:
        return {}
    return {name: landmarks_list[i] for i, name in idx_map.items() if i < len(landmarks_list)}


def classify_secondary_pose_eligibility(frame_obj, rec, width, height):
    """Phase 5.0C (Part D). Returns (eligible: bool, reason: str,
    missing_critical: list[str]). Uses ONLY this frame's own already-
    computed, real provenance — never a metric, never a different frame's
    evidence. Every condition below is independently checkable and
    disclosed via `secondaryPoseEligibilityReason` when it fails."""
    missing_critical = []
    landmarks_by_name = _named_landmarks_from_positional(frame_obj.get("landmarks"))

    # 1/9/10. Source localization must be scientifically eligible by the
    # EXISTING, established contract (measurements.ts's own gate) AND not
    # in a real, elevated-coast-risk / exit / long-gap state — the exact,
    # real distinction Part A's own audit proved necessary (frame 964 is
    # `tracked`, i.e. eligible by the OLD gate alone, but its own
    # `coastRiskState` is real, elevated, unverified evidence of a
    # background lock).
    box_origin = frame_obj.get("boxOrigin")
    if box_origin in ("predicted", "invalid", "frozen_suspect"):
        return False, "localization_not_scientifically_eligible", missing_critical
    if box_origin is None:
        return False, "localization_not_scientifically_eligible", missing_critical
    coast_state = frame_obj.get("coastRiskState")
    if coast_state in SECONDARY_RECOVERY_UNSAFE_COAST_STATES:
        return False, "coast_risk_elevated_unverified", missing_critical
    if frame_obj.get("localizationTerminationReason") in ("genuine_frame_exit", "background_lock_suspected"):
        return False, "frame_exit_or_background_lock", missing_critical

    # 2. Source frame/timestamp provenance exact.
    if frame_obj.get("cropSourceFrameIndex") is not None and frame_obj.get("poseSourceFrameIndex") is not None:
        if frame_obj["cropSourceFrameIndex"] != frame_obj["poseSourceFrameIndex"]:
            return False, "frame_provenance_mismatch", missing_critical

    # 3. Primary torso/pelvis pose must already be coherent — the secondary
    # pass recovers FEET, it never substitutes for a missing torso.
    for joint in SECONDARY_TORSO_REQUIRED_JOINTS:
        lm = landmarks_by_name.get(joint)
        if not lm or (lm.get("visibility") is not None and lm["visibility"] < SECONDARY_TORSO_VISIBILITY_FLOOR):
            return False, "primary_torso_incoherent", missing_critical

    # 4. Missing evidence must be real, contact-critical lower-limb evidence.
    for joint in CONTACT_CRITICAL_JOINTS:
        lm = landmarks_by_name.get(joint)
        present_ok = bool(lm) and (lm.get("visibility") is None or lm.get("visibility", 0.0) >= 0.4)
        if not present_ok:
            missing_critical.append(joint)
    if not missing_critical:
        return False, "no_contact_critical_deficit", missing_critical

    # 5. Missing foot must be plausibly inside the source image — the
    # localization box itself must not be off-frame (Part A's own exact
    # finding for frame 964: box right edge at x=1.023).
    box = frame_obj.get("scientificAthleteBox")
    if not box:
        return False, "no_verified_localization_box", missing_critical
    if box["x"] < -0.02 or box["y"] < -0.02 or box["x"] + box["width"] > 1.02 or box["y"] + box["height"] > 1.02:
        return False, "localization_box_outside_source_image", missing_critical

    # 6. Primary crop must actually show boundary pressure or a lower-limb
    # deficit (not an arbitrary, unexplained absence).
    containment = frame_obj.get("cropContainmentState")
    if containment not in ("crop_foot_at_risk", "crop_extremity_clipped"):
        return False, "no_crop_boundary_pressure_evidence", missing_critical

    # 8. Same athlete identity must remain verified.
    identity_score = frame_obj.get("identityContinuityScore")
    if identity_score is not None and identity_score < 0.5:
        return False, "identity_continuity_uncertain", missing_critical

    # 12. Recovery not already attempted (dedup — trivial within one pass,
    # explicit for provenance/idempotency).
    if frame_obj.get("secondaryPoseAttempted"):
        return False, "recovery_already_attempted", missing_critical

    return True, "eligible_foot_boundary_deficit", missing_critical


def build_secondary_crop(box, width, height):
    """Phase 5.0C (Part E). A real, bounded, ASYMMETRIC crop built from the
    SAME verified localization anchor `plan_crops()` itself would use —
    never a stale/suspect box (the caller already proved `box` is fresh via
    `classify_secondary_pose_eligibility`). Height grows by a bounded
    fraction (bottom-biased only); width is UNCHANGED — this is deliberately
    not "N% bigger" in every direction (see the real diagnostic evidence in
    this phase's own report, Section 7)."""
    bcx = (box["x"] + box["width"] / 2.0) * width
    bcy = (box["y"] + box["height"] / 2.0) * height
    bw = box["width"] * width
    bh = box["height"] * height
    base_side = max(bw, bh) * EFF_PADDING
    side_w = base_side
    side_h = base_side * (1.0 + SECONDARY_CROP_BOTTOM_HEIGHT_FRAC)
    shifted_cy = bcy + base_side * SECONDARY_CROP_VERTICAL_SHIFT_FRAC
    x0, y0 = bcx - side_w / 2.0, shifted_cy - side_h / 2.0
    x1, y1 = bcx + side_w / 2.0, shifted_cy + side_h / 2.0
    if x0 < 0: x1 -= x0; x0 = 0
    if y0 < 0: y1 -= y0; y0 = 0
    if x1 > width: x0 -= (x1 - width); x1 = width
    if y1 > height: y0 -= (y1 - height); y1 = height
    x0, y0 = int(max(0, round(x0))), int(max(0, round(y0)))
    x1, y1 = int(min(width, round(x1))), int(min(height, round(y1)))
    if x1 - x0 < 8 or y1 - y0 < 8:
        return None
    return (x0, y0, x1, y1)


def _bone_length_px(landmarks_by_name, a, b, width, height):
    la, lb = landmarks_by_name.get(a), landmarks_by_name.get(b)
    if not la or not lb:
        return None
    return math.hypot((la["x"] - lb["x"]) * width, (la["y"] - lb["y"]) * height)


def check_temporal_continuity(joint, candidate_xy_norm, frame_index, frames, width, height, src_fps):
    """Phase 5.0C (Part H). Checks a candidate recovered landmark against
    the nearest previous AND next VALID same-foot samples (real, already-
    persisted evidence — never a fixed-frame threshold; velocity is
    computed from real source timestamps). Returns (ok: bool, reason)."""
    cx_px, cy_px = candidate_xy_norm[0] * width, candidate_xy_norm[1] * height
    this_t = frames[frame_index].get("tMs", frame_index / max(src_fps, 1e-6) * 1000.0)

    def _nearest_valid(step):
        j = frame_index + step
        while 0 <= j < len(frames):
            kp = _named_landmarks_from_positional(frames[j].get("landmarks"))
            lm = kp.get(joint)
            if lm and (lm.get("visibility") is None or lm.get("visibility", 0.0) >= 0.4):
                return j, lm
            j += step
            if abs(j - frame_index) > 30:  # a real, bounded look-around — never an unbounded search
                return None, None
        return None, None

    for step in (-1, 1):
        j, lm = _nearest_valid(step)
        if j is None:
            continue
        other_t = frames[j].get("tMs", j / max(src_fps, 1e-6) * 1000.0)
        dt_s = abs(this_t - other_t) / 1000.0
        if dt_s <= 0:
            continue
        dx = (candidate_xy_norm[0] - lm["x"]) * width
        dy = (candidate_xy_norm[1] - lm["y"]) * height
        dist_fw = math.hypot(dx, dy) / width
        speed_fw_per_s = dist_fw / dt_s
        if speed_fw_per_s > SECONDARY_MAX_FOOT_VELOCITY_FW_PER_S:
            return False, "temporal_velocity_implausible"
    return True, "temporal_continuity_ok"


def recover_contact_critical_landmarks(frames, local_input, width, height, src_fps, model_path, cv2, mp, mp_python, mp_vision, rotation_code=None):
    """Phase 5.0C (Parts D-H) — the bounded secondary-recovery post-pass.
    Runs once, after Pass 2 and all existing retroactive corrections
    (Phase 4.2C/4.2J) have already finalized every frame's real provenance.
    For each ELIGIBLE frame (Part D), constructs exactly ONE bounded
    secondary crop (Part E), runs MediaPipe exactly once more (Part F —
    IMAGE mode, a single call, no retry loop), and merges only the specific
    recovered lower-limb landmarks that pass the full scientific merge
    contract (Part G) and temporal/anatomical checks (Part H). Never
    touches torso/pelvis/arm landmarks, never touches localization, never
    touches source timestamps. Returns a summary dict."""
    if not SECONDARY_RECOVERY_ENABLED:
        return {"eligibleFrames": 0, "secondaryInvocations": 0, "landmarksRecovered": 0, "landmarksRejected": 0, "enabled": False}

    eligible_indices = []
    for i, f in enumerate(frames):
        eligible, reason, missing = classify_secondary_pose_eligibility(f, None, width, height)
        f["secondaryPoseEligible"] = eligible
        f["secondaryPoseEligibilityReason"] = reason
        f["missingCriticalLandmarks"] = missing if missing else None
        f["primaryCropBoundaryRisk"] = f.get("cropContainmentState") in ("crop_foot_at_risk", "crop_extremity_clipped")
        f["secondaryPoseAttempted"] = False
        if eligible:
            eligible_indices.append(i)

    if not eligible_indices:
        return {"eligibleFrames": 0, "secondaryInvocations": 0, "landmarksRecovered": 0, "landmarksRejected": 0, "enabled": True}

    cap = cv2.VideoCapture(local_input)
    if not cap.isOpened():
        print("phase-5-0c: could not reopen video for secondary recovery pass; skipping", file=sys.stderr)
        return {"eligibleFrames": len(eligible_indices), "secondaryInvocations": 0, "landmarksRecovered": 0, "landmarksRejected": 0, "enabled": True}

    landmarker = mp_vision.PoseLandmarker.create_from_options(
        mp_vision.PoseLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=model_path),
            running_mode=mp_vision.RunningMode.IMAGE,
            min_pose_detection_confidence=MIN_DETECTION_CONFIDENCE,
            min_pose_presence_confidence=MIN_PRESENCE_CONFIDENCE,
            min_tracking_confidence=MIN_TRACKING_CONFIDENCE,
        )
    )

    invocations = 0
    recovered = 0
    rejected = 0
    _t0 = time.time()
    try:
        for i in eligible_indices:
            f = frames[i]
            f["secondaryPoseAttempted"] = True
            box = f.get("scientificAthleteBox")
            crop = build_secondary_crop(box, width, height)
            if crop is None:
                f["secondaryPoseRecoveryOutcome"] = "no_valid_secondary_crop"
                continue
            x0, y0, x1, y1 = crop
            cap.set(cv2.CAP_PROP_POS_FRAMES, f["sourceFrameIndex"])
            ok, frame_bgr = cap.read()
            if not ok:
                f["secondaryPoseRecoveryOutcome"] = "source_frame_read_failed"
                continue
            if rotation_code is not None:
                frame_bgr = apply_rotation(frame_bgr, rotation_code, cv2)
            sub = frame_bgr[y0:y1, x0:x1]
            rgb = cv2.cvtColor(sub, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = landmarker.detect(mp_image)
            invocations += 1
            f["secondaryCropRect"] = {
                "x0": x0 / float(width), "y0": y0 / float(height), "x1": x1 / float(width), "y1": y1 / float(height),
            }
            if not result.pose_landmarks:
                f["secondaryPoseRecoveryOutcome"] = "secondary_pose_not_detected"
                continue

            cw, ch = (x1 - x0), (y1 - y0)
            sx, sy = cw / float(width), ch / float(height)
            ox, oy = x0 / float(width), y0 / float(height)
            secondary_landmarks_positional = [landmark_dict(lm, sx, sy, ox, oy) for lm in result.pose_landmarks[0]]
            secondary_by_name = _named_landmarks_from_positional(secondary_landmarks_positional)
            primary_by_name = _named_landmarks_from_positional(f.get("landmarks"))

            # Part G — secondary torso alignment must agree sufficiently
            # with primary torso before ANY landmark from this secondary
            # result is trusted (a real, per-frame corroboration check —
            # never a blind swap).
            torso_agree = True
            for joint in ("left_hip", "right_hip"):
                p, s = primary_by_name.get(joint), secondary_by_name.get(joint)
                if p and s:
                    dpx = math.hypot((p["x"] - s["x"]) * width, (p["y"] - s["y"]) * height)
                    if dpx / width > 0.06:  # a real, bounded frame-width disagreement ceiling
                        torso_agree = False
            if not torso_agree:
                f["secondaryPoseRecoveryOutcome"] = "secondary_torso_disagreement"
                continue

            recovered_this_frame = []
            merge_log = []
            for joint in (f.get("missingCriticalLandmarks") or []):
                secondary_lm = secondary_by_name.get(joint)
                primary_lm = primary_by_name.get(joint)
                entry = {
                    "landmarkSource": "primary", "primaryValue": primary_lm, "recoveredValue": None,
                    "recoveryCrop": f["secondaryCropRect"], "recoveryReason": None, "mergeAccepted": False,
                    "mergeRejectedReason": None,
                }
                if not secondary_lm or (secondary_lm.get("visibility") is not None and secondary_lm["visibility"] < 0.4):
                    entry["mergeRejectedReason"] = "secondary_landmark_absent_or_low_confidence"
                    merge_log.append((joint, entry))
                    rejected += 1
                    continue
                # Left/right identity stability — never accept a joint whose
                # OWN name-side landmark contradicts the opposite side's
                # already-established primary geometry (a real, direct
                # symmetry check, not an assumption).
                side, part = joint.split("_", 1)
                other_side = "right" if side == "left" else "left"
                other_primary = primary_by_name.get(f"{other_side}_{part}")
                if other_primary:
                    same_side_dist = None
                    hip = primary_by_name.get(f"{side}_hip") or primary_by_name.get("left_hip") or primary_by_name.get("right_hip")
                    if hip:
                        d_candidate = math.hypot((secondary_lm["x"] - hip["x"]) * width, (secondary_lm["y"] - hip["y"]) * height)
                        d_other = math.hypot((other_primary["x"] - hip["x"]) * width, (other_primary["y"] - hip["y"]) * height)
                        # A recovered LEFT landmark that sits dramatically
                        # closer to the RIGHT primary landmark than any
                        # plausible same-body distance is a real identity
                        # swap risk — reject.
                        cross_dist = math.hypot((secondary_lm["x"] - other_primary["x"]) * width, (secondary_lm["y"] - other_primary["y"]) * height)
                        if cross_dist / width < 0.01:
                            entry["mergeRejectedReason"] = "left_right_identity_ambiguous"
                            merge_log.append((joint, entry))
                            rejected += 1
                            continue
                # Anatomical plausibility — shin/foot segment length vs the
                # SAME frame's own primary knee (or, absent that, ankle),
                # using Phase 5.0A's own established plausibility band.
                knee_joint = f"{side}_knee"
                knee = primary_by_name.get(knee_joint)
                anatomically_ok = True
                if knee and part == "ankle":
                    seg = math.hypot((secondary_lm["x"] - knee["x"]) * width, (secondary_lm["y"] - knee["y"]) * height)
                    # Compare against this SAME clip's already-observed
                    # knee->ankle range via the primary ankle when present
                    # elsewhere is out of scope for a single-frame check;
                    # bound instead by a real, generous multiple of the
                    # frame's own torso scale (hip-shoulder distance) — a
                    # per-frame, self-referential, athlete-independent bound.
                    hip = primary_by_name.get(f"{side}_hip")
                    shoulder = primary_by_name.get(f"{side}_shoulder")
                    if hip and shoulder:
                        torso_scale = math.hypot((hip["x"] - shoulder["x"]) * width, (hip["y"] - shoulder["y"]) * height)
                        if torso_scale > 0 and (seg / torso_scale > SECONDARY_MAX_BONE_RATIO or seg / torso_scale < 0.05):
                            anatomically_ok = False
                if not anatomically_ok:
                    entry["mergeRejectedReason"] = "anatomically_implausible"
                    merge_log.append((joint, entry))
                    rejected += 1
                    continue
                # Temporal continuity (Part H).
                temporal_ok, temporal_reason = check_temporal_continuity(
                    joint, (secondary_lm["x"], secondary_lm["y"]), i, frames, width, height, src_fps,
                )
                if not temporal_ok:
                    entry["mergeRejectedReason"] = temporal_reason
                    merge_log.append((joint, entry))
                    rejected += 1
                    continue
                # All checks passed — accept.
                entry["landmarkSource"] = "secondary_recovery"
                entry["recoveredValue"] = secondary_lm
                entry["recoveryReason"] = "contact_critical_deficit_recovered"
                entry["mergeAccepted"] = True
                merge_log.append((joint, entry))
                recovered_this_frame.append((joint, secondary_lm))
                recovered += 1

            if recovered_this_frame:
                # Apply ONLY the accepted joints onto the REAL positional
                # landmarks array AND the frame's own MP-index slots, so
                # both the raw `landmarks` array and any downstream
                # positional consumer see the recovered evidence — never
                # touching any other index.
                idx_map = dict(CROP_CONTAINMENT_LANDMARK_INDEX)
                name_to_idx = {v: k for k, v in idx_map.items()}
                for joint, lm in recovered_this_frame:
                    mp_idx = name_to_idx.get(joint)
                    if mp_idx is not None and f.get("landmarks") and mp_idx < len(f["landmarks"]):
                        f["landmarks"][mp_idx] = lm
                f["secondaryPoseRecoveryOutcome"] = "recovered"
            else:
                f["secondaryPoseRecoveryOutcome"] = "no_landmarks_merged"
            f["landmarkMergeLog"] = [{"joint": j, **e} for j, e in merge_log] if merge_log else None
    finally:
        landmarker.close()
        cap.release()

    elapsed_s = time.time() - _t0
    print(
        "phase-5-0c secondary recovery: %d eligible, %d secondary invocations, %d landmarks recovered, "
        "%d rejected, %.2fs elapsed"
        % (len(eligible_indices), invocations, recovered, rejected, elapsed_s),
        file=sys.stderr,
    )
    return {
        "eligibleFrames": len(eligible_indices), "secondaryInvocations": invocations,
        "landmarksRecovered": recovered, "landmarksRejected": rejected, "elapsedSeconds": elapsed_s, "enabled": True,
    }


# ============================================================================
# Phase 4.2K — independent, bidirectional-trajectory localization
# verification (Part D-L).
#
# Real, direct diagnostics this phase (scripts/phase-4-2k-independent-
# detection-diagnostic.py) found: (1) plain full-frame MediaPipe detection at
# native resolution NEVER finds this athlete anywhere in the clip (they are
# too small on-screen for the detector's practical range) -- production's own
# existing tile-upscale fallback (`tiled_locate`, already shipped, zero new
# dependencies) DOES find candidates on ~93% of the disputed-interval frames,
# but roughly 40% of those hits are a recurring STATIC competing candidate
# (background structure), not the athlete -- confirming raw image-based
# full-frame/tile detection is too noisy to self-authorize a localization
# decision here (Parts D/E). (2) A lightweight HSV torso-histogram appearance
# check and an uncompensated frame-differencing motion check were BOTH
# real, tested, and NON-discriminative on this footage (the static
# competing candidate's colour histogram correlated even MORE strongly with
# the athlete's own reference patch than the tracker's real box did; motion
# at the tracker box was barely distinguishable from motion in empty
# background) -- both disclosed as real negative findings (Parts F/G), not
# used as authority. (3) A genuinely independent, zero-new-dependency signal
# DOES work well here: reconstructing the athlete's own trajectory from
# ALREADY-TRUSTED box positions strictly BEFORE and strictly AFTER an
# uncertain run (never using anything from inside the run itself) and
# checking whether box_tracker's own real, coasted position agrees with
# BOTH independent extrapolations -- bidirectional offline trajectory
# evidence (Part H), the one evidence family this project's own AVAILABLE
# advantage (full, offline, random-access video) makes uniquely cheap and
# reliable. This is the selected architecture (Part I) -- it reuses
# `box_tracker.py`'s own already-proven, twice-independently-validated
# `COAST_TRAJECTORY_ALT_FW` constant (0.09 frame-widths, Phase 4.2H) as its
# agreement tolerance rather than inventing a new threshold.
INDEPENDENT_VERIFICATION_ENABLED = os.environ.get("MEDIAPIPE_INDEPENDENT_VERIFICATION", "1").strip().lower() in ("1", "true", "yes", "on")
# The same real coast-risk states Phase 5.0C's own secondary-recovery gate
# already treats as "not yet corroborated enough to build on" -- reused here
# to decide which frames NEED independent verification in the first place.
INDEPENDENT_UNCERTAIN_COAST_STATES = ("elevated_trajectory_risk", "refresh_required")
# A structural (not scientific-threshold) minimum: fewer points cannot define
# a stable least-squares line. Not a tuned acceptance knob.
INDEPENDENT_MIN_BRACKET_SAMPLES = 5
# A bounded lookback/lookaround window, the same order of magnitude as the
# project's own already-established coast-timing constants (e.g.
# `COAST_MIN_MS_SINCE_VERIFIED = 300.0`, box_tracker.py) -- bounds how far
# outside the uncertain run this function will look for trusted context,
# never an unbounded search.
INDEPENDENT_MAX_BRACKET_LOOKAROUND_MS = 500.0


def _independent_box_center(frame_obj):
    """(cx, cy, width) in normalized units from this frame's own real,
    already-computed `athleteBoundingBoxSource` -- the SAME raw box position
    box_tracker.py produced, regardless of whether it is currently
    scientifically eligible. Returns None if absent."""
    b = frame_obj.get("athleteBoundingBoxSource")
    if not b or any(b.get(k) is None for k in ("x0", "y0", "x1", "y1")):
        return None
    cx = (b["x0"] + b["x1"]) / 2.0
    cy = (b["y0"] + b["y1"]) / 2.0
    bw = b["x1"] - b["x0"]
    if bw <= 0:
        return None
    return cx, cy, bw


def _independent_is_uncertain(frame_obj):
    """A frame whose localization needs independent verification: either
    formally stripped (`frozen_suspect`) or carrying a real, disclosed
    elevated coast-risk signal while still nominally `tracked`."""
    if frame_obj.get("boxOrigin") == "frozen_suspect":
        return True
    return frame_obj.get("coastRiskState") in INDEPENDENT_UNCERTAIN_COAST_STATES


def _independent_is_trusted(frame_obj):
    """A frame whose OWN box position is itself safe to use as bidirectional
    bracket evidence for a NEIGHBOURING uncertain run -- scientifically
    eligible AND not itself already at elevated coast-risk."""
    if frame_obj.get("boxOrigin") not in ("detected", "reacquired", "tracked"):
        return False
    coast = frame_obj.get("coastRiskState")
    if coast is not None and coast not in ("recently_confirmed", "normal_coast"):
        return False
    return _independent_box_center(frame_obj) is not None


def _independent_linear_fit(points):
    """Least-squares (slope, intercept) of value vs time (ms); degenerate
    (< 2 distinct times) -> (0.0, mean(values))."""
    n = len(points)
    if n == 0:
        return 0.0, 0.0
    if n == 1:
        return 0.0, points[0][1]
    st = sum(t for t, _ in points)
    sv = sum(v for _, v in points)
    stt = sum(t * t for t, _ in points)
    stv = sum(t * v for t, v in points)
    denom = n * stt - st * st
    if abs(denom) < 1e-9:
        return 0.0, sv / n
    slope = (n * stv - st * sv) / denom
    intercept = (sv - slope * st) / n
    return slope, intercept


def _independent_fit_residual_sigma(points, slope, intercept):
    """Real, self-referential noise floor: how much this specific trusted
    window's OWN points scatter around their OWN linear fit. Used instead of
    a borrowed/invented absolute tolerance -- Phase 4.2K's own diagnostic
    (see the report, Section 6b) found `box_tracker.py`'s own
    `COAST_TRAJECTORY_ALT_FW` (0.09fw, frame-widths normalized by the
    ATHLETE'S OWN box width) does not transfer to this metric: Vanni 240's
    athlete occupies only ~2.5-3.8% of frame width, so "frame-widths" here is
    an extremely harsh unit that constant was never calibrated against.
    Rather than invent a new fixed threshold (explicitly disallowed), the
    tolerance is derived from THIS track's own real position noise, the same
    self-referential-bound pattern already established elsewhere in this
    project (`stepIntegrity.ts`'s neighbor-median ceiling,
    `SECONDARY_MAX_BONE_RATIO`'s per-frame torso-scale band)."""
    if len(points) < 2:
        return 0.0
    residuals = [v - (slope * t + intercept) for t, v in points]
    mean_r = sum(residuals) / len(residuals)
    var = sum((r - mean_r) ** 2 for r in residuals) / len(residuals)
    return var ** 0.5


# Generic, domain-independent statistical convention (not a tuned scientific
# threshold): a 3-sigma band around a fit is the standard, textbook
# definition of "not an outlier." Applied to THIS track's own, real,
# self-measured noise (see `_independent_fit_residual_sigma`), never to a
# borrowed absolute constant.
INDEPENDENT_SIGMA_MULTIPLE = 3.0
# A tiny floor (normalized units) so a suspiciously perfect/short fit never
# produces a zero-width (impossible-to-pass) tolerance band.
INDEPENDENT_SIGMA_FLOOR = 1e-3


def verify_independent_localization(frames, src_fps):
    """Phase 4.2K (Parts H/K/L) -- bounded, retroactive, offline bidirectional
    trajectory verification. For every maximal run of `_independent_is_uncertain`
    frames, gathers real, already-trusted box positions strictly BEFORE and
    strictly AFTER the run (bounded lookaround, real elapsed time), fits an
    independent linear trajectory from each side, and checks whether the
    run's OWN real box position agrees with BOTH extrapolations within a
    tolerance derived from THAT SAME bracket's own real position noise
    (`_independent_fit_residual_sigma`, 3-sigma) -- never a borrowed or
    invented absolute threshold.

    Never invents a position, never overrides `boxOrigin` itself, and never
    promotes a frame whose bracket is unavailable (a true exit/long gap
    naturally has no trusted "after" bracket and stays `independent_unavailable`).
    Persists `independentLocalizationState` (`independent_corroborated` |
    `independent_disagrees` | `independent_unavailable`),
    `independentTrajectoryResidualBeforeSigma`, `independentTrajectoryResidualAfterSigma`,
    `independentVerificationReason` on every frame this pass evaluates."""
    if not INDEPENDENT_VERIFICATION_ENABLED:
        return {"enabled": False}

    n = len(frames)
    corroborated = 0
    disagreed = 0
    unavailable = 0
    runs_evaluated = 0

    i = 0
    while i < n:
        if not _independent_is_uncertain(frames[i]):
            i += 1
            continue
        run_start = i
        while i < n and _independent_is_uncertain(frames[i]):
            i += 1
        run_end = i  # exclusive

        runs_evaluated += 1
        run_time_start = frames[run_start].get("tMs", run_start / max(src_fps, 1e-6) * 1000.0)
        run_time_end = frames[run_end - 1].get("tMs", (run_end - 1) / max(src_fps, 1e-6) * 1000.0)

        # Identity continuity: a genuine `invalid`/`lost`/`terminated` frame
        # INSIDE the run is real evidence of a true break (exit/occlusion),
        # not a coasting-but-uncertain episode -- never bridge it.
        identity_broken = any(
            frames[j].get("boxOrigin") == "invalid" or frames[j].get("trackState") in ("lost", "terminated")
            for j in range(run_start, run_end)
        )

        before_pts_x, before_pts_y, before_widths = [], [], []
        j = run_start - 1
        while j >= 0:
            t = frames[j].get("tMs", j / max(src_fps, 1e-6) * 1000.0)
            if run_time_start - t > INDEPENDENT_MAX_BRACKET_LOOKAROUND_MS:
                break
            if _independent_is_trusted(frames[j]):
                cx, cy, bw = _independent_box_center(frames[j])
                before_pts_x.append((t, cx)); before_pts_y.append((t, cy)); before_widths.append(bw)
            elif _independent_is_uncertain(frames[j]):
                break  # ran into a PRIOR uncertain run -- don't cross it for bracket evidence
            j -= 1

        after_pts_x, after_pts_y, after_widths = [], [], []
        j = run_end
        while j < n:
            t = frames[j].get("tMs", j / max(src_fps, 1e-6) * 1000.0)
            if t - run_time_end > INDEPENDENT_MAX_BRACKET_LOOKAROUND_MS:
                break
            if _independent_is_trusted(frames[j]):
                cx, cy, bw = _independent_box_center(frames[j])
                after_pts_x.append((t, cx)); after_pts_y.append((t, cy)); after_widths.append(bw)
            elif _independent_is_uncertain(frames[j]):
                break
            j += 1

        has_before = len(before_pts_x) >= INDEPENDENT_MIN_BRACKET_SAMPLES
        has_after = len(after_pts_x) >= INDEPENDENT_MIN_BRACKET_SAMPLES

        if identity_broken or not (has_before and has_after):
            reason = (
                "identity_discontinuity_in_run" if identity_broken
                else "insufficient_trusted_bracket"
            )
            for k in range(run_start, run_end):
                frames[k]["independentLocalizationState"] = "independent_unavailable"
                frames[k]["independentTrajectoryResidualBeforeSigma"] = None
                frames[k]["independentTrajectoryResidualAfterSigma"] = None
                frames[k]["independentVerificationReason"] = reason
                unavailable += 1
            continue

        slope_bx, intercept_bx = _independent_linear_fit(before_pts_x)
        slope_by, intercept_by = _independent_linear_fit(before_pts_y)
        slope_ax, intercept_ax = _independent_linear_fit(after_pts_x)
        slope_ay, intercept_ay = _independent_linear_fit(after_pts_y)

        # Self-referential tolerance (see `_independent_fit_residual_sigma`):
        # how noisy THIS track's own trusted position data really is, on
        # each side, combined into one 2D radius via the standard
        # independent-variance sum (Pythagorean combination of x/y sigma).
        sigma_before = math.hypot(
            _independent_fit_residual_sigma(before_pts_x, slope_bx, intercept_bx),
            _independent_fit_residual_sigma(before_pts_y, slope_by, intercept_by),
        )
        sigma_after = math.hypot(
            _independent_fit_residual_sigma(after_pts_x, slope_ax, intercept_ax),
            _independent_fit_residual_sigma(after_pts_y, slope_ay, intercept_ay),
        )
        tol_before = max(sigma_before, INDEPENDENT_SIGMA_FLOOR) * INDEPENDENT_SIGMA_MULTIPLE
        tol_after = max(sigma_after, INDEPENDENT_SIGMA_FLOOR) * INDEPENDENT_SIGMA_MULTIPLE

        # Direction plausibility (Part L condition 4): the two INDEPENDENT
        # extrapolations must not imply opposite net travel directions --
        # a genuine athlete trajectory does not reverse across a single
        # short coasting episode.
        direction_ok = True
        if abs(slope_bx) > 1e-9 and abs(slope_ax) > 1e-9 and (slope_bx > 0) != (slope_ax > 0):
            direction_ok = False

        for k in range(run_start, run_end):
            center = _independent_box_center(frames[k])
            if center is None or not direction_ok:
                frames[k]["independentLocalizationState"] = "independent_unavailable"
                frames[k]["independentTrajectoryResidualBeforeSigma"] = None
                frames[k]["independentTrajectoryResidualAfterSigma"] = None
                frames[k]["independentVerificationReason"] = (
                    "direction_implausible" if not direction_ok else "no_box_position"
                )
                unavailable += 1
                continue
            cx, cy, _bw = center
            t = frames[k].get("tMs", k / max(src_fps, 1e-6) * 1000.0)
            pred_bx = slope_bx * t + intercept_bx
            pred_by = slope_by * t + intercept_by
            pred_ax = slope_ax * t + intercept_ax
            pred_ay = slope_ay * t + intercept_ay
            resid_before = math.hypot(cx - pred_bx, cy - pred_by)
            resid_after = math.hypot(cx - pred_ax, cy - pred_ay)
            resid_before_sigma = resid_before / max(sigma_before, INDEPENDENT_SIGMA_FLOOR)
            resid_after_sigma = resid_after / max(sigma_after, INDEPENDENT_SIGMA_FLOOR)
            frames[k]["independentTrajectoryResidualBeforeSigma"] = round(resid_before_sigma, 3)
            frames[k]["independentTrajectoryResidualAfterSigma"] = round(resid_after_sigma, 3)
            if resid_before <= tol_before and resid_after <= tol_after:
                frames[k]["independentLocalizationState"] = "independent_corroborated"
                frames[k]["independentVerificationReason"] = "bidirectional_trajectory_agreement"
                corroborated += 1
            else:
                frames[k]["independentLocalizationState"] = "independent_disagrees"
                frames[k]["independentVerificationReason"] = "bidirectional_trajectory_residual_exceeded"
                disagreed += 1

    print(
        "phase-4-2k independent verification: %d run(s), %d frame(s) corroborated, "
        "%d disagreed, %d unavailable"
        % (runs_evaluated, corroborated, disagreed, unavailable),
        file=sys.stderr,
    )
    return {
        "enabled": True, "runsEvaluated": runs_evaluated,
        "corroborated": corroborated, "disagreed": disagreed, "unavailable": unavailable,
    }


def build_tracking_debug_artifact(tracking_diagnostics, crops, width, height, fps):
    """Assemble the Part 5 tracking-diagnostics debug artifact from the
    per-frame records `tracking_diagnostics` (built during pass 1 candidate
    selection) plus the FINAL planned crops (available only after pass 1
    completes). Computes head/pelvis/feet crop-containment per frame and the
    required summary statistics. Returns None if tracking diagnostics are
    unavailable (legacy/no-tracker path)."""
    if not tracking_diagnostics:
        return None
    frames_out = []
    longest_run = 0
    current_run = 0
    feet_outside = 0
    head_outside = 0
    pelvis_outside = 0
    valid_count = 0
    for d in tracking_diagnostics:
        i = d["frame"]
        crop = crops[i] if i < len(crops) else (0, 0, width, height)
        x0, y0, x1, y1 = crop
        lm = d.get("landmarksSource") or {}

        def _in_crop(name):
            p = lm.get(name)
            if not p:
                return None
            px, py = p[0] * width, p[1] * height
            return x0 <= px <= x1 and y0 <= py <= y1

        head_in = _in_crop("nose")
        pelvis_in = None
        lh, rh = lm.get("left_hip"), lm.get("right_hip")
        if lh and rh:
            pcx, pcy = (lh[0] + rh[0]) / 2.0 * width, (lh[1] + rh[1]) / 2.0 * height
            pelvis_in = x0 <= pcx <= x1 and y0 <= pcy <= y1
        feet_names = ("left_ankle", "right_ankle", "left_heel", "right_heel", "left_foot_index", "right_foot_index")
        feet_present = [n for n in feet_names if lm.get(n)]
        feet_in = None
        if feet_present:
            feet_in = all(_in_crop(n) for n in feet_present)

        if d["verified"]:
            valid_count += 1
            current_run += 1
            longest_run = max(longest_run, current_run)
        else:
            current_run = 0
        if head_in is False:
            head_outside += 1
        if pelvis_in is False:
            pelvis_outside += 1
        if feet_in is False:
            feet_outside += 1

        frames_out.append({
            "frame": i,
            "identityState": d["identityState"],
            "verified": d["verified"],
            "identitySwitch": d["identitySwitch"],
            "configuredDirection": d["configuredDirection"],
            "candidateCount": d["candidateCount"],
            "rejectedCandidates": d["rejectedCandidates"],
            "selectedScore": d["selectedScore"],
            "cropRect": {"x0": x0 / width, "y0": y0 / height, "x1": x1 / width, "y1": y1 / height},
            "headInCrop": head_in,
            "pelvisInCrop": pelvis_in,
            "feetInCrop": feet_in,
            # Day 104 (Part 3): where THIS frame's box came from — forward
            # detection/tracking, backward-recovered detection, or a
            # predicted-only/invalid frame with no real localization evidence.
            "boxProvenance": d.get("boxProvenance"),
        })

    # "Recovered" identity states differ by which tracker produced the frame:
    # the Day 95 AthleteTracker fallback recovers to "tracked"; the Day 96
    # AthleteBoxTracker recovers to "tracking" or "verified". Both count.
    RECOVERED_IDENTITY_STATES = ("tracked", "tracking", "verified")
    total = len(tracking_diagnostics)
    identity_switch_count = sum(1 for d in tracking_diagnostics if d["identitySwitch"])
    reacquisition_transitions = sum(
        1 for a, b in zip(tracking_diagnostics, tracking_diagnostics[1:])
        if a["identityState"] == "reacquiring" and b["identityState"] in RECOVERED_IDENTITY_STATES
    )
    direction_rejections = sum(
        1 for d in tracking_diagnostics
        for rc in d["rejectedCandidates"]
        if rc.get("reason") == "opposes_configured_direction"
    )
    return {
        "schemaVersion": "ava-tracking-debug-v1",
        "frames": frames_out,
        "summary": {
            "totalFrames": total,
            "poseValidFrames": valid_count,
            "poseValidPct": (valid_count / total * 100.0) if total else 0.0,
            "longestContinuousTrackFrames": longest_run,
            "identitySwitches": identity_switch_count,
            "reacquisitions": reacquisition_transitions,
            "directionRejectedCandidates": direction_rejections,
            "framesFeetOutsideCrop": feet_outside,
            "framesHeadOutsideCrop": head_outside,
            "framesPelvisOutsideCrop": pelvis_outside,
            "backwardRecoveredFrames": sum(1 for f in frames_out if f["boxProvenance"] == "backward_detection"),
        },
    }


def _mask_out_athlete(shape, box):
    """Feature mask that excludes the athlete and a conservative surrounding margin."""
    mask = 255 * __import__("numpy").ones(shape[:2], dtype="uint8")
    if box is None:
        return mask
    cx, cy, bw, bh = box
    margin_x, margin_y = max(20.0, bw * 0.8), max(20.0, bh * 0.35)
    x0 = int(max(0, cx - bw / 2 - margin_x)); x1 = int(min(shape[1], cx + bw / 2 + margin_x))
    y0 = int(max(0, cy - bh / 2 - margin_y)); y1 = int(min(shape[0], cy + bh / 2 + margin_y))
    mask[y0:y1, x0:x1] = 0
    return mask


def estimate_background_transform(prev_gray, gray, prev_box, cv2, frame_index):
    """Robust partial-affine background motion, estimated with RANSAC.

    MVP limitation: this recovers translation + rotation + uniform scale only
    (`cv2.estimateAffinePartial2D`), never a full projective/perspective warp.
    It is a deliberate, evidence-backed choice, not an unexamined simplification:
    on the one real panning fixture measured in this repo (`real-side-pan-fly-001`,
    see docs/local-physical-gate-lock.md "Model comparison"), a direct full
    homography was LESS accurate than partial affine (8.36px vs 7.40px mean
    midpoint error, 9.59px vs 9.10px mean endpoint error, 1.36 vs 1.22 max angle
    over 10 independent annotations) — composing a projective model amplified
    small perspective-coefficient noise into larger drift rather than reducing
    error. Homography was explicitly not adopted for that reason.
    Known reliable envelope: horizontal/lateral pan with modest scale and
    rotation change (sideline coverage of a straight sprint). NOT validated for:
    strong forward/back (dolly) camera motion, large true perspective shifts,
    curved/arcing camera movement, or large optical zoom changes — an affine fit
    over any of those will systematically under- or mis-represent the true
    motion. If real footage of those types needs support, re-run the same
    measured comparison (or the repo's hybrid global/local lock, which measured
    2.41px on this fixture) before reconsidering a projective model.
    """
    empty = {"frame": frame_index, "translationX": 0.0, "translationY": 0.0,
             "rotationDeg": 0.0, "scale": 1.0, "confidence": 0.0,
             "supportingFeatureCount": 0, "inlierRatio": 0.0, "residualPx": None,
             "transformType": "partial_affine"}
    if prev_gray is None:
        return empty
    mask = _mask_out_athlete(prev_gray.shape, prev_box)
    points = cv2.goodFeaturesToTrack(prev_gray, maxCorners=300, qualityLevel=0.01,
                                     minDistance=8, blockSize=7, mask=mask)
    if points is None or len(points) < MIN_BACKGROUND_FEATURES:
        return empty
    nxt, status, _ = cv2.calcOpticalFlowPyrLK(prev_gray, gray, points, None,
                                              winSize=(21, 21), maxLevel=3)
    if nxt is None or status is None:
        return empty
    good_prev = points[status.reshape(-1) == 1].reshape(-1, 2)
    good_next = nxt[status.reshape(-1) == 1].reshape(-1, 2)
    support = len(good_prev)
    if support < MIN_BACKGROUND_FEATURES:
        empty["supportingFeatureCount"] = support
        return empty

    # Similarity motion is the stable default for a handheld pan. Composing a
    # projective model on every frame can amplify tiny perspective coefficients
    # into large long-clip drift even when each individual residual is small.
    affine, affine_inliers = cv2.estimateAffinePartial2D(
        good_prev, good_next, method=cv2.RANSAC, ransacReprojThreshold=2.5,
        maxIters=2000, confidence=0.99
    )
    affine_result = None
    affine_ratio = 0.0
    affine_residual = None
    if affine is not None and affine_inliers is not None:
        affine_selected = affine_inliers.reshape(-1).astype(bool)
        affine_inlier_count = int(affine_selected.sum())
        affine_ratio = affine_inlier_count / float(max(1, support))
        a, b, tx = affine[0]; c, d, ty = affine[1]
        scale = float((a * a + c * c) ** 0.5)
        rotation = float(__import__("math").degrees(__import__("math").atan2(c, a)))
        predicted = cv2.transform(good_prev.reshape(-1, 1, 2), affine).reshape(-1, 2)
        residuals = __import__("numpy").linalg.norm(predicted - good_next, axis=1)
        affine_residual = (
            float(__import__("numpy").median(residuals[affine_selected]))
            if affine_inlier_count else None
        )
        support_score = min(1.0, support / 80.0)
        residual_score = (
            0.0 if affine_residual is None
            else max(0.0, 1.0 - affine_residual / 5.0)
        )
        affine_result = {
            "frame": frame_index, "translationX": float(tx / gray.shape[1]),
            "translationY": float(ty / gray.shape[0]), "rotationDeg": rotation,
            "scale": max(0.01, scale),
            "confidence": max(0.0, min(1.0, affine_ratio * support_score * residual_score)),
            "supportingFeatureCount": support, "inlierRatio": affine_ratio,
            "residualPx": affine_residual, "transformType": "partial_affine",
        }

    if affine_result is not None:
        return affine_result
    empty["supportingFeatureCount"] = support
    return empty


def smooth_camera_transforms(transforms, cp, alpha=0.35):
    """EMA-smooth translation/rotation/scale across consecutive TRUSTWORTHY
    frames (Part 3, Day 94 audit: the gate-lock pipeline rejects/holds through
    bad frames but never smoothed the accepted ones, so wind/tripod-bounce
    jitter that stays within the acceptance thresholds passed straight through
    to gate propagation frame by frame). Only the motion PARAMETERS are
    smoothed — never a gate's propagated pixel position independently — so the
    two gates, which are both driven by this same smoothed transform chain,
    can never drift apart from each other as a side effect of filtering.

    A frame is "trustworthy" using the exact same thresholds `camera_path.py`
    already uses to accept a step (`cp.MIN_STEP_CONFIDENCE` etc.) — no new
    threshold is invented. An untrustworthy frame is passed through UNCHANGED
    (never smoothed, never used as a smoothing anchor for its neighbors), so a
    single bad frame can't leak noise into frames around it. `confidence`,
    `inlierRatio`, `residualPx`, and `supportingFeatureCount` are left
    untouched — they remain the true per-frame diagnostic, not smoothed values
    pretending to be measurements.
    """
    if cp is None:
        return transforms
    smoothed = []
    prev = None
    for t in transforms:
        trustworthy = (
            t.get("confidence", 0.0) >= cp.MIN_STEP_CONFIDENCE
            and t.get("supportingFeatureCount", 0) >= cp.MIN_STEP_FEATURES
            and (t.get("residualPx") is None or t["residualPx"] <= cp.MAX_STEP_RESIDUAL_PX)
        )
        out = dict(t)
        if trustworthy and prev is not None:
            out["translationX"] = alpha * t["translationX"] + (1 - alpha) * prev["translationX"]
            out["translationY"] = alpha * t["translationY"] + (1 - alpha) * prev["translationY"]
            out["rotationDeg"] = alpha * t["rotationDeg"] + (1 - alpha) * prev["rotationDeg"]
            out["scale"] = alpha * t["scale"] + (1 - alpha) * prev["scale"]
        smoothed.append(out)
        if trustworthy:
            prev = out
    return smoothed


def frame_ranges(indices):
    """Convert sorted frame indices to compact inclusive ranges."""
    if not indices:
        return []
    ranges = []
    start = prev = indices[0]
    for value in indices[1:]:
        if value != prev + 1:
            ranges.append({"startFrame": start, "endFrame": prev})
            start = value
        prev = value
    ranges.append({"startFrame": start, "endFrame": prev})
    return ranges


def normalized_box(box, width, height):
    if box is None:
        return None
    cx, cy, bw, bh = box
    return {"x": (cx - bw / 2) / width, "y": (cy - bh / 2) / height,
            "width": bw / width, "height": bh / height}


def normalized_crop(crop, width, height):
    x0, y0, x1, y1 = crop
    return {"x": x0 / width, "y": y0 / height,
            "width": (x1 - x0) / width, "height": (y1 - y0) / height}


def monotonic_media_timestamp(raw_timestamp_ms, frame_index, source_fps, previous_timestamp_ms):
    """MediaPipe VIDEO mode requires strictly increasing timestamps.

    Some valid MOV files repeat or briefly regress CAP_PROP_POS_MSEC. Preserve the
    container timestamp when possible, but advance by at least one source-frame
    interval so decoding remains deterministic and never fails at startup.
    """
    nominal = (frame_index / source_fps) * 1000.0
    candidate = raw_timestamp_ms if raw_timestamp_ms > 0 else nominal
    if previous_timestamp_ms is not None and candidate <= previous_timestamp_ms:
        candidate = max(nominal, previous_timestamp_ms + 1000.0 / source_fps)
    return candidate


def resolve_local_input(input_arg):
    """Day 95 audit: download an HTTP(S) input to a local temp file ONCE and
    read from disk for every subsequent pass, instead of letting OpenCV/FFmpeg
    stream over the network for the whole job. Root cause this fixes: with the
    athlete tracker's heavier per-frame cost (multi-candidate detection), pass
    1's real-time-network HTTP video read started silently truncating well
    before the true end of the clip on the real 240fps Vanni session
    (`cap.read()` began returning False at frame ~463-511 of 2348, no
    exception raised) — while pass 2 (opened later, same URL) always
    completed the full clip. A local file read has none of that fragility.
    Returns (local_path, cleanup_fn); cleanup_fn is a no-op for an
    already-local path. Never silently swallows a download failure — a failed
    download fails the job with a clear message, same as an unreadable video
    always has.
    """
    if not (input_arg.startswith("http://") or input_arg.startswith("https://")):
        return input_arg, lambda: None
    import tempfile
    fd, tmp_path = tempfile.mkstemp(suffix=".mov", prefix="ava-source-")
    os.close(fd)
    try:
        with urllib.request.urlopen(input_arg, timeout=120) as response, open(tmp_path, "wb") as out:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
    except Exception as exc:  # noqa: BLE001
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        fail("Could not download source video for analysis: %s" % exc)

    def _cleanup():
        try:
            os.remove(tmp_path)
        except OSError:
            pass

    return tmp_path, _cleanup


def main():
    parser = argparse.ArgumentParser(description="MediaPipe Pose runner")
    parser.add_argument("--input", required=True, help="Video path or URL")
    parser.add_argument("--fps", type=float, default=None, help="Target analysis frame rate (maximum 60)")
    parser.add_argument("--max-frames", type=int, default=None, help="Cap analysis frames emitted")
    parser.add_argument("--repairs-file", type=str, default=None,
                         help="Phase 2: path to a JSON file of accepted manual World-Lock Repairs")
    parser.add_argument("--travel-direction", type=str, default="auto",
                         choices=["left_to_right", "right_to_left", "auto"],
                         help="Day 95: coach-configured sprint direction, for the athlete tracker's "
                              "acquisition (expected entry side) and identity-continuity checks")
    parser.add_argument("--entry-gate-x", type=float, default=None,
                         help="Day 103: calibrated start-gate x (normalized source-frame coords), "
                              "for the athlete tracker's pre-zone acquisition corridor")
    parser.add_argument("--entry-gate-y", type=float, default=None,
                         help="Day 103: calibrated start-gate y (normalized source-frame coords)")
    args = parser.parse_args()

    os.environ.setdefault("GLOG_minloglevel", "3")
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

    try:
        import cv2
        import mediapipe as mp
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision as mp_vision
    except Exception as exc:  # ImportError or native load failure
        fail("%s (%s)" % (INSTALL_HINT, exc))

    # Day 95 audit: download once, read locally for every pass (see
    # resolve_local_input's docstring for why). `atexit` is the cleanup
    # backstop on the fail()-exits-the-process path; the explicit call at the
    # end of main() is the normal-completion path.
    import atexit
    # Day 96 audit (Part 9): structured stage-duration profiling. Printed as
    # one JSON line to stderr at the end of the run — cheap (a handful of
    # time.time() calls), always on, so every real run (not just a special
    # "profiling mode") has this evidence available.
    stage_durations = {}
    _t_download0 = time.time()
    local_input, cleanup_input = resolve_local_input(args.input)
    stage_durations["downloadSeconds"] = time.time() - _t_download0
    atexit.register(cleanup_input)

    camera_path_diagnostics = os.environ.get("CAMERA_PATH_DIAGNOSTICS", "").strip().lower() in ("1", "true", "yes", "on")
    try:
        import camera_path as cp
        import repair_transform as rt
    except Exception as exc:  # noqa: BLE001 — Phase 1/2 camera path is additive; never block analysis
        cp = None
        rt = None
        print("camera_path module unavailable, Phase 1/2 global path will be skipped: %s" % exc, file=sys.stderr)

    try:
        import athlete_tracker as at
    except Exception as exc:  # noqa: BLE001 — never block analysis; falls back to the legacy single-pose path
        at = None
        print("athlete_tracker module unavailable, falling back to unverified single-pose tracking: %s" % exc, file=sys.stderr)

    try:
        import box_tracker as bt
    except Exception as exc:  # noqa: BLE001 — never block analysis; falls back to the Day 95 per-frame path
        bt = None
        print("box_tracker module unavailable, falling back to per-frame multi-candidate detection: %s" % exc, file=sys.stderr)

    # Phase 2 (Part 11): load accepted manual repairs, if the Node worker
    # supplied any (see PythonMediaPipePoseService.ts). Never let a malformed
    # repairs file block the rest of analysis — camera-path is additive.
    pending_repairs = []
    if args.repairs_file:
        try:
            with open(args.repairs_file, "r", encoding="utf-8") as handle:
                pending_repairs = json.load(handle)
        except Exception as exc:  # noqa: BLE001
            print("repairs file unreadable, continuing without manual repairs: %s" % exc, file=sys.stderr)

    # Open the video first so a bad path fails fast (before any model download).
    cap = cv2.VideoCapture(local_input)
    if not cap.isOpened():
        fail("Could not open video input: %s" % args.input)
    # R5B.4V: read-only tracker-validation runs may supply the rotation
    # already established by source forensics when ffprobe is unavailable in
    # a constrained local environment.  Normal production invocation remains
    # entirely unchanged.
    _validation_rotation = os.environ.get("AVA_TRACKING_VALIDATION_ROTATION_DEGREES")
    _probed_rotation_degrees = (
        float(_validation_rotation) if _validation_rotation is not None
        else probe_rotation_degrees(local_input)
    )
    rotation_code = rotation_code_for_angle(_probed_rotation_degrees, cv2)
    stage_durations["probedRotationDegrees"] = _probed_rotation_degrees
    stage_durations["rotationApplied"] = rotation_code is not None
    if rotation_code is not None:
        print("source carries rotation metadata — correcting every decoded frame", file=sys.stderr)

    opencv_fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    evidence = probe_fps_evidence(local_input)
    src_fps = evidence.get("averageFps") or opencv_fps
    if src_fps <= 0:
        fail("Could not determine the source video frame rate.")
    fps_classification, fps_tier_reason, tier_analysis_fps = classify_fps(evidence, src_fps)
    if fps_classification == "unsupported_source_fps":
        fail(UNSUPPORTED_FPS_MESSAGE)
    fps = tier_analysis_fps
    # Phase 1 audit: `src_fps` (computed above, before classification) feeds both
    # the per-frame monotonic-timestamp fallback denominator AND the artifact's
    # `sourceMetadata.fps`/`sourceFps` fields — separately from `fps` above. For
    # validated_60/experimental_30 these two numbers have always legitimately
    # differed slightly (e.g. a real 60fps clip's own averageFps vs. the fixed
    # 60) and that established behavior must not change. But classify_fps()'s
    # native_source_class branch can now correct `fps` away from the raw
    # container average using real timestamp evidence — re-sync `src_fps` to
    # match ONLY in that branch, so the artifact never again reports two
    # different "fps" values for the same native-rate analysis (the worker's
    # own result-validation in analysis-worker.mjs requires them to agree).
    if fps_classification == "native_source_class":
        src_fps = fps
    max_supported_fps = FPS_POLICY.get("maxSupportedFps", 300.5)
    if fps > max_supported_fps:
        fail("AVA production analysis is capped at %.1f FPS." % max_supported_fps)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    if rotation_code in (cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_90_COUNTERCLOCKWISE):
        width, height = height, width  # a 90/270 correction swaps the decoded aspect ratio
    source_frame_count = evidence.get("frameCount") or int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    source_duration_seconds = evidence.get("durationSeconds") or (source_frame_count / src_fps if source_frame_count > 0 else 0.0)
    fourcc = int(cap.get(cv2.CAP_PROP_FOURCC) or 0)
    source_codec = "".join(chr((fourcc >> (8 * i)) & 0xFF) for i in range(4)).strip("\x00") or None
    print(
        "source fps detected=%.5f average=%s nominal=%s real=%s timestamp=%s vfr=%s classification=%s analysis=%s"
        % (opencv_fps, evidence.get("averageFps"), evidence.get("nominalFps"),
           evidence.get("realFps"), evidence.get("timestampFps"),
           evidence.get("variableFrameRate"), fps_classification, fps),
        file=sys.stderr,
    )

    model_path = ensure_model()
    print(
        "pose model=%s det=%.2f pres=%.2f track=%.2f roi=%s zoom=%.2f pad=%.2f minfrac=%.3f"
        % (os.path.basename(model_path), MIN_DETECTION_CONFIDENCE, MIN_PRESENCE_CONFIDENCE, MIN_TRACKING_CONFIDENCE, ROI_ENABLED, ROI_ZOOM, EFF_PADDING, EFF_MIN_SIDE_FRAC),
        file=sys.stderr,
    )

    # --- Pass 1: locate the athlete each frame (full frame). In ROI mode only. ---
    _t_pass1_0 = time.time()
    crops = None
    boxes = []
    direct_box_flags = []
    box_confidences = []
    camera_transforms = []
    orb_snapshots = {}
    tracking_diagnostics = []  # legacy Day 95 shape; kept populated for build_tracking_debug_artifact()
    tracking_debug = None
    box_track_records = []
    entry_gate = (
        (args.entry_gate_x, args.entry_gate_y)
        if args.entry_gate_x is not None and args.entry_gate_y is not None
        else None
    )
    tracker = (
        at.AthleteTracker(travel_direction=args.travel_direction, fps=fps, entry_gate=entry_gate)
        if at is not None else None
    )
    # Day 96 audit: the continuous box tracker separates LOCALIZATION (this
    # object — periodic identity-verified detection + optical-flow tracking
    # between detector frames) from POSE INFERENCE (pass 2 below, which now
    # runs single-pose MediaPipe inside whatever crop this establishes,
    # instead of every frame independently rediscovering the athlete via
    # expensive multi-candidate detection). See box_tracker.py.
    box_tracker = (
        # `width`/`height` (from cap.get(CAP_PROP_FRAME_*) above) are usually
        # already correct here — construct with those directly rather than a
        # hardcoded 0,0. The per-frame `if width == 0 ...` fallback below only
        # backfills box_tracker.width/height when cap.get() itself returned 0
        # (some codecs/backends don't report dimensions reliably); when it
        # DIDN'T fail — the common case — that fallback's guard never fires,
        # so constructing with 0,0 here left box_tracker.width/height stuck at
        # 0 for the whole run: every detected box's cx/cy (`c.cx * self.width`)
        # silently collapsed to ~0 instead of real pixel coordinates. This was
        # the actual root cause of a real-run regression found during this
        # audit (frozen crop, zero pose landmarks for the entire clip).
        bt.AthleteBoxTracker(tracker, detector_cadence_frames=DETECTOR_CADENCE_FRAMES, width=width, height=height)
        if (bt is not None and tracker is not None) else None
    )
    if ROI_ENABLED:
        loc = mp_vision.PoseLandmarker.create_from_options(
            make_options(model_path, mp_python, mp_vision, num_poses=TRACKER_NUM_CANDIDATES if tracker else 1)
        )
        # Dynamic Analysis Viewport tile fallback (Part X): a separate IMAGE-mode
        # landmarker, created lazily only if/when a frame's full-frame detection
        # fails — VIDEO-mode `loc` above requires a single monotonic timestamp
        # stream and cannot be reused for arbitrary tile crops. Zero cost for
        # clips where full-frame detection already succeeds every frame.
        tile_landmarker = None
        tile_locate_count = 0
        last_located_x = None
        index = 0
        prev_gray = None
        prev_box = None
        previous_locator_timestamp_ms = None
        # Day 104 (Part 2): bidirectional offline identity recovery. While
        # `box_tracker.track_state == "acquiring"` (i.e. before the first
        # identity lock), `wants_detector_frame()` already requests the
        # (expensive) multi-candidate MediaPipe detector on EVERY frame — see
        # box_tracker.py. Those candidate lists were previously discarded
        # once `AthleteTracker.step()` consumed them. Buffering them here
        # costs nothing extra (the detection already ran) and lets
        # `at.track_backward()` walk them backward from the lock frame after
        # pass 1 completes, recovering real, verified pre-lock frames instead
        # of leaving them `invalid`/un-cropped.
        pre_lock_candidates = {}
        anchor_frame = None
        anchor_center = None
        anchor_height = None
        anchor_time_s = None
        # Phase 1 recovery-capture bookkeeping: a periodic snapshot stride alone
        # essentially never lands exactly on the frame where a real relock
        # candidate is chosen (that frame is decided dynamically, by when
        # tracking actually stabilizes again) — the first real end-to-end run
        # against this footage found exactly that: 0 relock attempts, because
        # `orb_snapshots.get(candidate_frame)` was always None. Capturing a
        # short window right after every recovery from an unreliable step
        # guarantees a snapshot exists at whichever frame `build_camera_path`
        # actually selects as the candidate.
        prev_step_ok = True
        recovery_capture_countdown = 0
        expected_dir_sign = {"left_to_right": 1, "right_to_left": -1}.get(args.travel_direction, 0)
        # Mirrors this loop's own break condition exactly, so the reported
        # total is never larger than what pass 1 will actually iterate.
        pass1_total_frames = (
            min(source_frame_count, int(round(args.max_frames * src_fps / fps)))
            if args.max_frames is not None and source_frame_count
            else (source_frame_count or 1)
        )
        emit_progress("pass1", 0, pass1_total_frames, src_fps, width, height, force=True)
        try:
            while True:
                if args.max_frames is not None and index >= int(round(args.max_frames * src_fps / fps)):
                    break
                ok, frame_bgr = cap.read()
                if not ok:
                    break
                frame_bgr = apply_rotation(frame_bgr, rotation_code, cv2)
                if width == 0 or height == 0:
                    height, width = frame_bgr.shape[0], frame_bgr.shape[1]
                    if box_tracker is not None:
                        box_tracker.width, box_tracker.height = width, height
                source_timestamp_ms = monotonic_media_timestamp(
                    cap.get(cv2.CAP_PROP_POS_MSEC), index, src_fps, previous_locator_timestamp_ms
                )
                previous_locator_timestamp_ms = source_timestamp_ms
                gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)

                if box_tracker is not None:
                    # --- Day 96 audit: continuous localization, MediaPipe only
                    # on detector frames (Part 3) --------------------------------
                    # The expensive identity-verified multi-pose call only runs
                    # when the box tracker actually needs it (periodic cadence,
                    # or immediately on tracking-quality loss/acquisition) — every
                    # other frame is carried forward by cheap optical flow
                    # (box_tracker.py), not by rediscovering the athlete from
                    # scratch. This is the core Day 96 architecture change.
                    wants_detector = box_tracker.wants_detector_frame()
                    candidates = None
                    search_source = None
                    primary_fallback_reason = None
                    if wants_detector:
                        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                        result = loc.detect_for_video(mp_image, int(round(source_timestamp_ms)))
                        candidates = [
                            at.candidate_from_landmarks(lm, width, height, TRACKER_LANDMARK_NAMES)
                            for lm in (result.pose_landmarks or [])
                        ]
                        # Phase R3B-5: the primary pass may only suppress the
                        # tile fallback when it found NOTHING at all, OR when
                        # everything it found is implausibly small to be a
                        # real athlete (see _primary_pass_has_plausible_candidate's
                        # own docstring) — a weak/implausible primary
                        # candidate is kept in `candidates` either way, never
                        # discarded, so this can only ADD search coverage,
                        # never remove evidence identity logic already had.
                        primary_plausible = _primary_pass_has_plausible_candidate(candidates)
                        search_source = "primary" if primary_plausible else None
                        if not primary_plausible and ROI_TILE_FALLBACK:
                            primary_fallback_reason = "no_primary" if not any(candidates) else "below_plausibility_floor"
                            if tile_landmarker is None:
                                tile_landmarker = mp_vision.PoseLandmarker.create_from_options(
                                    mp_vision.PoseLandmarkerOptions(
                                        base_options=mp_python.BaseOptions(model_asset_path=model_path),
                                        running_mode=mp_vision.RunningMode.IMAGE,
                                        num_poses=1,
                                        min_pose_detection_confidence=max(0.2, MIN_DETECTION_CONFIDENCE * 0.7),
                                        min_pose_presence_confidence=max(0.2, MIN_PRESENCE_CONFIDENCE * 0.7),
                                        min_tracking_confidence=max(0.2, MIN_TRACKING_CONFIDENCE * 0.7),
                                    )
                                )
                            tile_box, tile_confidence, tile_landmarks_list = tiled_locate(
                                frame_bgr, width, height, tile_landmarker, mp, mp.Image, cv2, hint_x=last_located_x
                            )
                            tile_locate_count += 1
                            if tile_landmarks_list:
                                search_source = "tiled"
                            for tile_lm in (tile_landmarks_list or []):
                                candidates.append(at.candidate_from_landmarks(tile_lm, width, height, TRACKER_LANDMARK_NAMES))
                        elif primary_plausible:
                            primary_fallback_reason = "primary_accepted"
                    # Day 104 bugfix: `box_tracker.track_state` is NOT a
                    # reliable "still pre-lock" signal — it flips from
                    # "acquiring" to "reacquiring" the moment the FIRST
                    # detector call fails to select a candidate (see
                    # `AthleteBoxTracker.step`'s prediction-fallback branch,
                    # reached whenever `self.last_box is None`, which is
                    # every frame before the true first lock) and never goes
                    # back to "acquiring" — so checking `== "acquiring"` here
                    # was only ever true for frame 0, silently disabling
                    # backward recovery on every real clip (caught via a real
                    # end-to-end rerun, not a synthetic test — the synthetic
                    # athlete-tracker-sanity fixtures happened to lock on the
                    # very first frame they fed in some paths, masking this).
                    # `identity_tracker.identity_state` is the correct,
                    # already-existing signal: it stays in
                    # searching/candidate/verifying for the ENTIRE real
                    # pre-lock period regardless of box_tracker's own
                    # (otherwise-correct-for-its-purpose) state machine.
                    was_pre_lock = tracker.identity_state in ("searching", "candidate", "verifying")
                    if wants_detector and was_pre_lock:
                        # Real evidence, not yet corroborated into a lock — the
                        # exact input `at.track_backward()` needs after pass 1.
                        pre_lock_candidates[index] = (source_timestamp_ms / 1000.0, candidates)
                    box_record = box_tracker.step(index, source_timestamp_ms / 1000.0, prev_gray, gray, candidates, expected_dir_sign)
                    if anchor_frame is None and was_pre_lock and box_record.boxOrigin == "detected":
                        # The exact frame identity first locked — capture the
                        # athlete_tracker's own normalized reference state as
                        # the backward walk's anchor.
                        anchor_frame = index
                        anchor_center = tracker.state.center
                        anchor_height = tracker.state.height
                        anchor_time_s = tracker.state.time
                    box = box_record.box
                    box_confidence = box_record.trackingConfidence if box_record.detectionConfidence is None else box_record.detectionConfidence
                    box_track_records.append(box_record)
                    tracking_diagnostics.append({
                        "frame": index,
                        "identityState": box_record.trackState,
                        "verified": box_record.boxOrigin in ("detected", "reacquired"),
                        "identitySwitch": False,
                        "configuredDirection": args.travel_direction,
                        "candidateCount": len([c for c in candidates if c is not None]) if candidates else 0,
                        "rejectedCandidates": [],
                        "selectedScore": box_confidence,
                        "landmarksSource": {},
                        # Phase R3B-5 (Part R): developer/scientific provenance
                        # only — never gates any decision, never a consumer-
                        # facing confidence percentage.
                        "searchSource": search_source,
                        "primaryFallbackReason": primary_fallback_reason,
                    })
                elif tracker is not None:
                    # --- Day 95 fallback: box_tracker module unavailable, but
                    # identity-aware per-frame multi-candidate selection is. ---
                    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                    result = loc.detect_for_video(mp_image, int(round(source_timestamp_ms)))
                    candidates = [
                        at.candidate_from_landmarks(lm, width, height, TRACKER_LANDMARK_NAMES)
                        for lm in (result.pose_landmarks or [])
                    ]
                    primary_plausible = _primary_pass_has_plausible_candidate(candidates)
                    search_source = "primary" if primary_plausible else None
                    primary_fallback_reason = "primary_accepted" if primary_plausible else None
                    if not primary_plausible and ROI_TILE_FALLBACK:
                        primary_fallback_reason = "no_primary" if not any(candidates) else "below_plausibility_floor"
                        if tile_landmarker is None:
                            tile_landmarker = mp_vision.PoseLandmarker.create_from_options(
                                mp_vision.PoseLandmarkerOptions(
                                    base_options=mp_python.BaseOptions(model_asset_path=model_path),
                                    running_mode=mp_vision.RunningMode.IMAGE,
                                    num_poses=1,
                                    min_pose_detection_confidence=max(0.2, MIN_DETECTION_CONFIDENCE * 0.7),
                                    min_pose_presence_confidence=max(0.2, MIN_PRESENCE_CONFIDENCE * 0.7),
                                    min_tracking_confidence=max(0.2, MIN_TRACKING_CONFIDENCE * 0.7),
                                )
                            )
                        tile_box, tile_confidence, tile_landmarks_list = tiled_locate(
                            frame_bgr, width, height, tile_landmarker, mp, mp.Image, cv2, hint_x=last_located_x
                        )
                        tile_locate_count += 1
                        if tile_landmarks_list:
                            search_source = "tiled"
                        for tile_lm in (tile_landmarks_list or []):
                            candidates.append(at.candidate_from_landmarks(tile_lm, width, height, TRACKER_LANDMARK_NAMES))
                    step_result = tracker.step(candidates, index, source_timestamp_ms / 1000.0)
                    selected = candidates[step_result["selectedIndex"]] if step_result["selectedIndex"] is not None else None
                    box = (selected.cx * width, selected.cy * height, selected.w * width, selected.h * height) if selected else None
                    box_confidence = step_result["candidates"][step_result["selectedIndex"]].get("score") if selected else None
                    tracking_diagnostics.append({
                        "frame": index,
                        "identityState": step_result["identityState"],
                        "verified": step_result["verified"],
                        "identitySwitch": step_result["identitySwitch"],
                        "configuredDirection": step_result["configuredDirection"],
                        "candidateCount": len([c for c in candidates if c is not None]),
                        "rejectedCandidates": [
                            {"reason": pc.get("rejectionReason"), "score": pc.get("score")}
                            for j, pc in enumerate(step_result["candidates"])
                            if j != step_result["selectedIndex"]
                        ],
                        "selectedScore": box_confidence,
                        "landmarksSource": (selected.landmarks if selected else {}),
                        "searchSource": search_source,
                        "primaryFallbackReason": primary_fallback_reason,
                    })
                else:
                    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                    result = loc.detect_for_video(mp_image, int(round(source_timestamp_ms)))
                    # Legacy path (athlete_tracker unavailable): unverified
                    # single-highest-confidence detection, no identity check.
                    box = bbox_from_result(result, width, height)
                    box_confidence = None
                    # Phase R3B-5: same plausibility floor as the identity-
                    # aware paths above, expressed against this branch's own
                    # PIXEL box (bbox_from_result's own convention) via
                    # height / frame-height — no Candidate object exists on
                    # this legacy, no-identity path.
                    primary_plausible = bool(box is not None and height > 0 and (box[3] / height) >= PRIMARY_SUPPRESSION_MIN_HEIGHT_FRACTION)
                    if result.pose_landmarks and primary_plausible:
                        values = [max(0.0, min(1.0, float(getattr(lm, "visibility", 0.0))))
                                  for lm in result.pose_landmarks[0]]
                        box_confidence = sum(values) / len(values) if values else 0.0
                    elif ROI_TILE_FALLBACK:
                        if tile_landmarker is None:
                            tile_landmarker = mp_vision.PoseLandmarker.create_from_options(
                                mp_vision.PoseLandmarkerOptions(
                                    base_options=mp_python.BaseOptions(model_asset_path=model_path),
                                    running_mode=mp_vision.RunningMode.IMAGE,
                                    min_pose_detection_confidence=max(0.2, MIN_DETECTION_CONFIDENCE * 0.7),
                                    min_pose_presence_confidence=max(0.2, MIN_PRESENCE_CONFIDENCE * 0.7),
                                    min_tracking_confidence=max(0.2, MIN_TRACKING_CONFIDENCE * 0.7),
                                )
                            )
                        tile_box, tile_confidence, _tile_lm = tiled_locate(
                            frame_bgr, width, height, tile_landmarker, mp, mp.Image, cv2, hint_x=last_located_x
                        )
                        tile_locate_count += 1
                        if tile_box is not None:
                            box = tile_box
                            box_confidence = tile_confidence
                if box is not None:
                    last_located_x = box[0]
                if os.environ.get("BOX_TRACKER_DEBUG") and index % 50 == 0:
                    print(f"[raw_box] frame={index} box={box}", file=sys.stderr)
                boxes.append(box)
                box_confidences.append(box_confidence if box_confidence is not None else 0.0)
                step = estimate_background_transform(prev_gray, gray, prev_box, cv2, index)
                camera_transforms.append(step)
                # Phase 1 (camera_path.py): reuses the grayscale image already
                # decoded above, no extra video read. Athlete-masked via the same
                # helper the adjacent-frame path uses, so the runner never
                # dominates relock matching either. Captured at: frame 0, a
                # periodic stride (general keyframe-to-keyframe matching), and a
                # short window right after any recovery from an unreliable step
                # (guarantees a snapshot at wherever the relock candidate lands).
                if cp is not None:
                    this_step_ok = (
                        step.get("confidence", 0.0) >= cp.MIN_STEP_CONFIDENCE
                        and step.get("supportingFeatureCount", 0) >= cp.MIN_STEP_FEATURES
                        and (step.get("residualPx") is None or step["residualPx"] <= cp.MAX_STEP_RESIDUAL_PX)
                    )
                    if this_step_ok and not prev_step_ok:
                        recovery_capture_countdown = cp.RELOCK_CANDIDATE_STABILITY_FRAMES + 2
                    capture_now = cp.should_capture_orb_snapshot(index) or recovery_capture_countdown > 0
                    if recovery_capture_countdown > 0:
                        recovery_capture_countdown -= 1
                    if capture_now:
                        mask = _mask_out_athlete(gray.shape, box)
                        snapshot = cp.capture_orb_snapshot(gray, mask, cv2)
                        if snapshot is not None:
                            orb_snapshots[index] = snapshot
                    prev_step_ok = this_step_ok
                prev_gray = gray
                prev_box = box
                index += 1
                emit_progress("pass1", index, pass1_total_frames, src_fps, width, height)
        finally:
            loc.close()
            if tile_landmarker is not None:
                tile_landmarker.close()
            cap.release()
        # The pass is complete even when the last stride-gated emission did
        # not land exactly on totalFrames. This is lifecycle telemetry only.
        emit_progress("pass1", pass1_total_frames, pass1_total_frames, src_fps, width, height, force=True)
        stage_durations["pass1LocalizationSeconds"] = time.time() - _t_pass1_0
        stage_durations["detectorInvocations"] = box_tracker.detector_invocations if box_tracker is not None else None
        if box_tracker is not None:
            # Phase 4.1 (2026-08-05): surface the localization-quality summary
            # (tracked/predicted/detected/reacquired counts, teleport
            # rejections, observed peak speed) on every run — the prior state
            # only ever exposed `detectorInvocations`, leaving no evidence
            # trail for diagnosing localization drift outside of enabling
            # full BOX_TRACKER_DEBUG per-frame logging. Reporting only; does
            # not affect tracking behavior.
            print("box_tracker summary: %s" % box_tracker.summary(), file=sys.stderr)

        # R5B.4V: exact pass-1 production-localization validation without
        # running the unrelated crop/pose/render pipeline.  This is opt-in,
        # read-only, and deliberately occurs only after the normal tracker
        # loop has completed all source frames.  It makes a deterministic
        # state/cadence validation practical on real clips.
        validation_output = os.environ.get("AVA_TRACKING_VALIDATION_OUTPUT")
        if validation_output:
            payload = {
                "validationOnly": True,
                "sourceWidth": width,
                "sourceHeight": height,
                "sourceFps": src_fps,
                "rotationDegrees": _probed_rotation_degrees,
                "boxTrackerSummary": box_tracker.summary() if box_tracker is not None else None,
                "frames": [record.to_dict() for record in box_track_records],
            }
            with open(validation_output, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, separators=(",", ":"))
            print("tracking validation artifact: %s" % validation_output, file=sys.stderr)
            return

        # Day 104 (Part 2): backward identity recovery — walk the already-
        # computed pre-lock candidate evidence backward from the anchor
        # (first identity lock) toward frame 0. Zero extra MediaPipe cost:
        # every candidate list here was already produced by pass 1's own
        # per-frame detector calls while `track_state == "acquiring"`.
        backward_recovery = None
        backward_recovered_frames = {}
        if at is not None and anchor_frame is not None and pre_lock_candidates:
            _t_backward_0 = time.time()
            backward_recovered_frames, backward_recovery = at.track_backward(
                pre_lock_candidates, anchor_frame, anchor_center, anchor_height, anchor_time_s,
                args.travel_direction,
            )
            stage_durations["backwardRecoverySeconds"] = time.time() - _t_backward_0
            print(
                "backward recovery: anchor=%d recovered=%d frame(s) [%s..%s], stopped at frame %s (%s)"
                % (anchor_frame, backward_recovery["recoveredFrameCount"],
                   backward_recovery["firstRecoveredFrame"], backward_recovery["lastRecoveredFrame"],
                   backward_recovery["stopFrame"], backward_recovery["stopReason"]),
                file=sys.stderr,
            )
            for f, rec in backward_recovered_frames.items():
                raw_w, raw_h = rec["w"] * width, rec["h"] * height
                # Mirror box_tracker.py's own detected-box construction
                # exactly (BOX_PADDING + MIN_BOX_SIDE_PX floor) so a
                # backward-recovered box is planned/cropped identically to a
                # forward-detected one — no separate, unvalidated code path.
                box_w = max(raw_w * bt.BOX_PADDING, bt.MIN_BOX_SIDE_PX) if bt is not None else raw_w
                box_h = max(raw_h * bt.BOX_PADDING, bt.MIN_BOX_SIDE_PX) if bt is not None else raw_h
                patched_box = (rec["cx"] * width, rec["cy"] * height, box_w, box_h)
                boxes[f] = patched_box
                box_confidences[f] = rec["score"]
                # Critical: pass 2 emits each frame's `boxOrigin` straight
                # from `box_track_records[source_index]` (see `frame_obj[
                # "boxOrigin"]` below), and BOTH the overlay renderer
                # (VideoOverlay.tsx) and the metrics engine
                # (measurements.ts) strip landmarks to `{}` for
                # "predicted"/"invalid" origin frames. Without patching the
                # record here too, a backward-recovered frame would still
                # read "invalid" downstream and its real Pass-2 pose
                # evidence would be silently discarded — defeating Part 2
                # entirely. "detected" is the semantically correct value
                # (a fresh, identity-verified sighting) — the forward/
                # backward distinction itself lives in `boxProvenance`
                # above, not in this narrower, schema-validated field.
                if f < len(box_track_records):
                    box_track_records[f].box = patched_box
                    box_track_records[f].boxOrigin = "detected"
                    box_track_records[f].trackState = "verified"
                    box_track_records[f].detectionConfidence = rec["score"]
                    box_track_records[f].identityContinuityScore = rec["score"]

        # Persist per-frame localization provenance (Part 3) BEFORE building
        # the tracking-debug artifact, so it can carry `boxProvenance`
        # alongside the fields that already existed.
        for i, rec in enumerate(box_track_records):
            if i in backward_recovered_frames:
                provenance = "backward_detection"
            elif rec.boxOrigin == "detected":
                provenance = "forward_detection"
            elif rec.boxOrigin == "reacquired":
                provenance = "forward_reacquired"
            elif rec.boxOrigin == "tracked":
                provenance = "forward_tracking"
            elif rec.boxOrigin == "predicted":
                provenance = "predicted_only"
            elif rec.boxOrigin == "frozen_suspect":
                # Phase 4.2/4.2B: distinct from "invalid" — this frame WAS
                # tracked with real optical-flow evidence at the time, but a
                # later identity-verified detection proved it had settled
                # onto near-static structure instead of the athlete. Keeping
                # it distinguishable in developer diagnostics (Part 6) is
                # more honest than collapsing it into "invalid" (which means
                # "no evidence at all") — it still must never render a
                # skeleton or contribute a contact, exactly like "invalid".
                provenance = "frozen_suspect"
            else:
                provenance = "invalid"
            if i < len(tracking_diagnostics):
                tracking_diagnostics[i]["boxProvenance"] = provenance

        # Phase 4.2C (Part 2/8): sync `boxes[]`/`box_confidences[]` from any
        # RETROACTIVE `frozen_suspect` correction BEFORE `plan_crops()` runs.
        # Disclosed gap from Phase 4.2B (see docs/phase-4-2b-frozen-track-
        # production-wiring.md Section 17, item 4): `box_tracker.py`'s
        # `_resolve_freeze_run` corrects `box_track_records[i].boxOrigin`
        # in place, but `boxes[i]` (pass 1's own array, built frame-by-frame
        # DURING `box_tracker.step()`, before any later frame's retroactive
        # correction could exist yet) was never re-synced — so a confirmed
        # `frozen_suspect` span's PROVEN-WRONG frozen position was still
        # being fed into `plan_crops()`'s linear-trend/smoothing fit,
        # anchoring the crop to exactly the position this project has
        # actively disproven. Clearing it to `None` here routes those
        # frames through the SAME, already-existing, already-trusted
        # extrapolation `plan_crops()` already uses for genuinely
        # undetected frames — not new interpolation logic, just correctly
        # excluding proven-wrong evidence from an existing mechanism.
        # `crop_fallback_reasons[i]` distinguishes WHY a frame has no direct
        # box at `plan_crops()` time, for the provenance fields below.
        crop_fallback_reasons = [None] * len(boxes)
        for i, rec in enumerate(box_track_records):
            if i >= len(boxes):
                break
            if boxes[i] is None:
                crop_fallback_reasons[i] = "never_detected"
            if rec.boxOrigin == "frozen_suspect":
                boxes[i] = None
                box_confidences[i] = 0.0
                crop_fallback_reasons[i] = "frozen_suspect_excluded"

        direction_sign = {"left_to_right": 1, "right_to_left": -1}.get(args.travel_direction, 0)
        # Phase 4.2D: per-frame origins, so plan_crops() can detect a fresh
        # identity-verified reacquisition boundary (segment reset) even
        # across a bridgeable gap. Same length as `boxes` by construction
        # (both built frame-by-frame in the same pass-1 loop).
        crop_origins = [rec.boxOrigin for rec in box_track_records] if box_track_records else None
        # Phase 5.0B (Part F): box_tracker.py's own already-computed
        # trajectoryResidualFrameWidths, reused (not recomputed) as the
        # crop's risk-widen signal — same length/indexing as `boxes` by
        # construction (both built frame-by-frame in the same pass-1 loop).
        crop_risk_fw = [rec.trajectoryResidualFrameWidths for rec in box_track_records] if box_track_records else None
        crops, crop_plan_diagnostics = plan_crops(
            boxes, width, height, fps, direction_sign=direction_sign,
            confidences=box_confidences, origins=crop_origins, risk_fw=crop_risk_fw,
        )
        crop_predicted_offsets_px = [d["predictedCenterOffsetPx"] for d in crop_plan_diagnostics]
        crop_scale_factors = [d["cropScaleFactor"] for d in crop_plan_diagnostics]
        crop_adjustment_reasons = [d.get("cropAdjustmentReason") for d in crop_plan_diagnostics]
        tracking_debug = build_tracking_debug_artifact(tracking_diagnostics, crops, width, height, fps)
        if tracking_debug is not None and backward_recovery is not None:
            tracking_debug["backwardRecovery"] = backward_recovery
        if tracking_debug is not None:
            s = tracking_debug["summary"]
            print(
                "athlete tracker: %d/%d frames verified (%.1f%%), longest run=%d frames, "
                "identitySwitches=%d reacquisitions=%d directionRejections=%d "
                "outsideCrop(head=%d pelvis=%d feet=%d)"
                % (s["poseValidFrames"], s["totalFrames"], s["poseValidPct"], s["longestContinuousTrackFrames"],
                   s["identitySwitches"], s["reacquisitions"], s["directionRejectedCandidates"],
                   s["framesHeadOutsideCrop"], s["framesPelvisOutsideCrop"], s["framesFeetOutsideCrop"]),
                file=sys.stderr,
            )
        direct_box_flags = [box is not None for box in boxes]
        detected = sum(1 for b in boxes if b is not None)
        print("ROI pass 1: located athlete in %d/%d frames" % (detected, len(boxes)), file=sys.stderr)
        if tile_locate_count > 0:
            print(
                "ROI pass 1: dynamic-viewport tile fallback ran on %d frames (full-frame detection missed them)"
                % tile_locate_count,
                file=sys.stderr,
            )
        cap = cv2.VideoCapture(local_input)  # reopen for pass 2
        if not cap.isOpened():
            fail("Could not reopen video for ROI pass 2: %s" % args.input)

    # --- Detection pass: full frame, or ROI-cropped (pass 2). Landmarks are always
    #     emitted in FULL-FRAME normalized coordinates. ---
    _t_pass2_0 = time.time()
    # Day 104 (Part 8): expected pass-2 frame count in ANALYSIS-frame terms —
    # equal to the source frame count for every native-rate class (the common
    # case), else derived from the real measured duration/target fps.
    pass2_total_frames = (
        source_frame_count if fps_classification in NATIVE_RATE_FPS_CLASSES
        else max(1, int(round(source_duration_seconds * fps)))
    )
    if args.max_frames is not None:
        pass2_total_frames = min(pass2_total_frames, args.max_frames)
    emit_progress("pass2", 0, pass2_total_frames, src_fps, width, height, force=True)
    landmarker = mp_vision.PoseLandmarker.create_from_options(make_options(model_path, mp_python, mp_vision))
    # Day 96 audit (Part 6): a single lazily-created IMAGE-mode landmarker for
    # the bounded expanded-crop retry below — IMAGE mode (not VIDEO) so a
    # retry call never has to satisfy the VIDEO landmarker's strictly-
    # increasing-timestamp requirement against the next real frame.
    retry_landmarker = None
    retry_count = 0
    frames = []
    source_index = 0
    analysis_index = 0
    previous_analysis_timestamp_ms = None
    # Phase 4.2C (Part 3/4): previous frame's crop rect, to detect the one
    # real, reachable "unexplained spatial jump" this pipeline can produce —
    # `plan_crops()` already bounds normal frame-to-frame crop movement
    # (`MAX_CENTER_STEP_FRAC`), so the only way a crop can jump
    # discontinuously is falling back to the full-frame degenerate case
    # (crop region collapsed below plan_crops()'s own 8px minimum).
    prev_crop_rect = None
    try:
        while True:
            if args.max_frames is not None and analysis_index >= args.max_frames:
                break
            ok, frame_bgr = cap.read()
            if not ok:
                break
            frame_bgr = apply_rotation(frame_bgr, rotation_code, cv2)
            # Nominal-60, experimental-30, and native high-speed footage all keep
            # every real source frame and its real timestamp — analysisFps equals
            # the source's own rate for each of these classes, so no frame is ever
            # dropped or relabeled onto a different clock. Only a classification
            # AVA has no full-rate profile for would fall to the ratio below, and
            # that path never runs today (every accepted classification is native).
            wanted_source_index = (
                source_index if fps_classification in NATIVE_RATE_FPS_CLASSES
                else int(round(analysis_index * src_fps / fps))
            )
            if source_index < wanted_source_index:
                source_index += 1
                continue
            if width == 0 or height == 0:
                height, width = frame_bgr.shape[0], frame_bgr.shape[1]

            # Phase 4.2C (Part 2): the box actually fed to `plan_crops()` for
            # THIS source frame — captured BEFORE pass 2's own landmark-
            # derived overwrite below, so this is genuinely "what crop
            # planning saw," not "what pose ended up finding here."
            crop_planner_input_box = boxes[source_index] if source_index < len(boxes) else None
            crop_rect_norm = None
            is_fallback_jump = False
            this_crop_tuple = None
            if crops is not None:
                # Pass 1 and pass 2 open the same file with two separate
                # cv2.VideoCapture instances; a small number of real-world
                # (HEVC) files decode a handful more frames on the second open
                # than the first. That only ever surfaced once native
                # high-speed footage started walking every source index
                # instead of every other one (the old 60 Hz downsample never
                # reached the tail) — clamp to the last known crop rather than
                # crash; a stale ROI box for the last frame or two is a safe,
                # bounded degradation, not a correctness issue.
                this_crop_tuple = crops[min(source_index, len(crops) - 1)]
                x0, y0, x1, y1 = this_crop_tuple
                # Phase 4.2C (Part 3/4): the one real, reachable "unexplained
                # spatial jump" `plan_crops()` can produce — its own
                # frame-to-frame smoothing bounds (MAX_CENTER_STEP_FRAC/
                # MAX_SIDE_CHANGE_FRAC) only apply along the SAME code path;
                # the full-frame degenerate fallback `(0, 0, width, height)`
                # bypasses them entirely when the computed region collapses
                # below plan_crops()'s own 8px minimum. Flag exactly the
                # transition INTO that fallback (not every full-frame crop —
                # a clip that legitimately never got ROI evidence at all
                # stays full-frame throughout, which is not a "jump").
                if (
                    this_crop_tuple == (0, 0, width, height)
                    and prev_crop_rect is not None
                    and prev_crop_rect != (0, 0, width, height)
                ):
                    is_fallback_jump = True
                sub = frame_bgr[y0:y1, x0:x1]
                cw, ch = (x1 - x0), (y1 - y0)
                # Map crop-normalized coords back to full-frame: full = (offset + n*crop)/frame.
                sx, sy = cw / float(width), ch / float(height)
                ox, oy = x0 / float(width), y0 / float(height)
                crop_rect_norm = {
                    "x0": x0 / float(width), "y0": y0 / float(height),
                    "x1": x1 / float(width), "y1": y1 / float(height),
                }
            else:
                sub = frame_bgr
                sx, sy, ox, oy = 1.0, 1.0, 0.0, 0.0

            rgb = cv2.cvtColor(sub, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            source_timestamp_ms = monotonic_media_timestamp(
                cap.get(cv2.CAP_PROP_POS_MSEC), source_index, src_fps, previous_analysis_timestamp_ms
            )
            analysis_timestamp_ms = (
                source_timestamp_ms if fps_classification in NATIVE_RATE_FPS_CLASSES
                else (analysis_index / fps) * 1000.0
            )
            timestamp_ms = int(round(analysis_timestamp_ms))
            if previous_analysis_timestamp_ms is not None:
                timestamp_ms = max(timestamp_ms, int(round(previous_analysis_timestamp_ms)) + 1)
            previous_analysis_timestamp_ms = timestamp_ms
            result = landmarker.detect_for_video(mp_image, timestamp_ms)

            # Day 96 audit (Part 6): a bounded, ONE-shot expanded-crop retry
            # when the normal (tight) crop finds nothing — a low-confidence
            # box_tracker prediction can crop slightly too tight around a
            # fast-moving athlete. Never retries more than once per frame
            # (no unbounded retry loop), and the retry is fully diagnosed.
            pose_retry_used = False
            if not result.pose_landmarks and crops is not None:
                x0, y0, x1, y1 = crops[min(source_index, len(crops) - 1)]
                cw0, ch0 = x1 - x0, y1 - y0
                expand = 0.6  # +60% linear size, centered on the same box
                ex0 = max(0, int(x0 - cw0 * expand / 2))
                ey0 = max(0, int(y0 - ch0 * expand / 2))
                ex1 = min(width, int(x1 + cw0 * expand / 2))
                ey1 = min(height, int(y1 + ch0 * expand / 2))
                if ex1 - ex0 >= 8 and ey1 - ey0 >= 8 and (ex1 - ex0 > cw0 or ey1 - ey0 > ch0):
                    if retry_landmarker is None:
                        retry_landmarker = mp_vision.PoseLandmarker.create_from_options(
                            mp_vision.PoseLandmarkerOptions(
                                base_options=mp_python.BaseOptions(model_asset_path=model_path),
                                running_mode=mp_vision.RunningMode.IMAGE,
                                min_pose_detection_confidence=max(0.2, MIN_DETECTION_CONFIDENCE * 0.7),
                                min_pose_presence_confidence=max(0.2, MIN_PRESENCE_CONFIDENCE * 0.7),
                                min_tracking_confidence=max(0.2, MIN_TRACKING_CONFIDENCE * 0.7),
                            )
                        )
                    esub = frame_bgr[ey0:ey1, ex0:ex1]
                    ergb = cv2.cvtColor(esub, cv2.COLOR_BGR2RGB)
                    eimg = mp.Image(image_format=mp.ImageFormat.SRGB, data=ergb)
                    retry_result = retry_landmarker.detect(eimg)
                    retry_count += 1
                    pose_retry_used = True
                    if retry_result.pose_landmarks:
                        result = retry_result
                        ecw, ech = ex1 - ex0, ey1 - ey0
                        sx, sy = ecw / float(width), ech / float(height)
                        ox, oy = ex0 / float(width), ey0 / float(height)
                        crop_rect_norm = {"x0": ox, "y0": oy, "x1": ox + sx, "y1": oy + sy}

            landmarks = []
            landmarks_crop_space = []
            if result.pose_landmarks:
                landmarks = [landmark_dict(lm, sx, sy, ox, oy) for lm in result.pose_landmarks[0]]
                if crops is not None:
                    # Same landmarks, WITHOUT the crop->source remap — i.e. exactly
                    # as MediaPipe returned them, crop-normalized [0,1]. Persisted so
                    # a crop->source mapping bug is independently verifiable against
                    # the raw model output rather than only against the final value.
                    landmarks_crop_space = [landmark_dict(lm) for lm in result.pose_landmarks[0]]
            tracking_confidence = 0.0
            if result.pose_landmarks:
                tracking_values = [max(0.0, min(1.0, float(getattr(lm, "visibility", 0.0))))
                                   for lm in result.pose_landmarks[0]]
                tracking_confidence = sum(tracking_values) / len(tracking_values) if tracking_values else 0.0
                if source_index < len(boxes) and landmarks:
                    xs = [lm["x"] * width for lm in landmarks]
                    ys = [lm["y"] * height for lm in landmarks]
                    boxes[source_index] = ((min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0,
                                           max(xs) - min(xs), max(ys) - min(ys))
                    box_confidences[source_index] = tracking_confidence

            frame_obj = {
                "index": analysis_index,
                "sourceFrameIndex": source_index,
                "sourceTimestampMs": source_timestamp_ms,
                "timestampMs": analysis_timestamp_ms,
                # Landmark coordinates in SOURCE-frame space (crop remap already
                # applied) — the space the UI renders against.
                "landmarks": landmarks,
                "trackingConfidence": tracking_confidence,
            }
            if pose_retry_used:
                frame_obj["poseRetryUsed"] = True
            # Day 96 audit (Part 7): the box-tracker's per-frame provenance for
            # THIS source frame — downstream (TS) contact/crossing evidence
            # must never treat a "predicted" or "invalid" origin frame as
            # verified pose evidence, however plausible-looking `landmarks` is.
            if source_index < len(box_track_records):
                rec = box_track_records[source_index]
                frame_obj["boxOrigin"] = rec.boxOrigin
                frame_obj["trackState"] = rec.trackState
                frame_obj["identityContinuityScore"] = rec.identityContinuityScore
                # R5B.4: failure-aware reacquisition provenance.  This is
                # diagnostic-only metadata; existing metric/pose consumers
                # continue to use the authoritative box origin/state above.
                if rec.trackingUnreliable:
                    frame_obj["trackingUnreliable"] = True
                    frame_obj["trackingUnreliableReason"] = rec.trackingUnreliableReason
                # Phase 4.2B: frozen-track detector diagnostics. `rec.boxOrigin`
                # above already reflects any retroactive `frozen_suspect`
                # correction (pass 1 fully completes, including every
                # `_resolve_freeze_run` call, before pass 2 ever reads this) —
                # these are supplementary developer-visibility fields only,
                # never consulted by metrics/contact logic.
                if rec.freezeSuspect is not None:
                    frame_obj["freezeSuspect"] = rec.freezeSuspect
                if rec.motionEstablished is not None:
                    frame_obj["motionEstablished"] = rec.motionEstablished
                if rec.freezeDurationMs is not None:
                    frame_obj["freezeDurationMs"] = rec.freezeDurationMs
                if rec.trajectoryResidualPx is not None:
                    frame_obj["trajectoryResidualPx"] = rec.trajectoryResidualPx
                if rec.featureSpreadPx is not None:
                    frame_obj["featureSpreadPx"] = rec.featureSpreadPx
                if rec.featureSpreadGrowthRatio is not None:
                    frame_obj["featureSpreadGrowthRatio"] = rec.featureSpreadGrowthRatio
                if rec.frozenDecision is not None:
                    frame_obj["frozenDecision"] = rec.frozenDecision
                # Phase 4.2F: athlete-interior feature-selection diagnostics
                # — supplementary developer-visibility fields only, never
                # consulted by metrics/contact logic (same convention as the
                # Phase 4.2B fields immediately above).
                if rec.athleteInteriorFeatureRatio is not None:
                    frame_obj["athleteInteriorFeatureRatio"] = rec.athleteInteriorFeatureRatio
                if rec.backgroundRiskFeatureRatio is not None:
                    frame_obj["backgroundRiskFeatureRatio"] = rec.backgroundRiskFeatureRatio
                if rec.flowQualityDegrading is not None:
                    frame_obj["flowQualityDegrading"] = rec.flowQualityDegrading
                if rec.featureMaskSource is not None:
                    frame_obj["featureMaskSource"] = rec.featureMaskSource
                if rec.flowRejectedBackgroundDominated is not None:
                    frame_obj["flowRejectedBackgroundDominated"] = rec.flowRejectedBackgroundDominated
                # Phase 4.2G: time-normalized coast-risk diagnostics — real
                # gap found during Phase 4.2H's own audit: these fields were
                # added to BoxTrackFrame and populated in box_tracker.py's
                # record_kwargs, but never actually threaded through here, so
                # every persisted artifact silently dropped them (the same
                # class of bug Phase 4.2F itself found and fixed for its own
                # new fields). Supplementary developer-visibility fields
                # only, never consulted by metrics/contact logic (same
                # convention as the Phase 4.2B/F fields above).
                if rec.timeSinceVerifiedDetectorMs is not None:
                    frame_obj["timeSinceVerifiedDetectorMs"] = rec.timeSinceVerifiedDetectorMs
                if rec.distanceSinceVerifiedDetectorPx is not None:
                    frame_obj["distanceSinceVerifiedDetectorPx"] = rec.distanceSinceVerifiedDetectorPx
                if rec.distanceSinceVerifiedDetectorFrameWidths is not None:
                    frame_obj["distanceSinceVerifiedDetectorFrameWidths"] = rec.distanceSinceVerifiedDetectorFrameWidths
                if rec.coastRiskState is not None:
                    frame_obj["coastRiskState"] = rec.coastRiskState
                if rec.coastRiskSignals is not None:
                    frame_obj["coastRiskSignals"] = rec.coastRiskSignals
                if rec.flowProtectionActive is not None:
                    frame_obj["flowProtectionActive"] = rec.flowProtectionActive
                if rec.flowProtectionReason is not None:
                    frame_obj["flowProtectionReason"] = rec.flowProtectionReason
                # Phase 4.2H: distance-and-evidence-based coast-risk
                # diagnostics — same passthrough-only, developer-visibility
                # convention as every field above.
                if rec.expectedDistanceFrameWidths is not None:
                    frame_obj["expectedDistanceFrameWidths"] = rec.expectedDistanceFrameWidths
                if rec.trajectoryResidualFrameWidths is not None:
                    frame_obj["trajectoryResidualFrameWidths"] = rec.trajectoryResidualFrameWidths
                if rec.athleteOwnedFeatureRatio is not None:
                    frame_obj["athleteOwnedFeatureRatio"] = rec.athleteOwnedFeatureRatio
                if rec.backgroundRiskRatio is not None:
                    frame_obj["backgroundRiskRatio"] = rec.backgroundRiskRatio
                if rec.forwardBackwardValidRatio is not None:
                    frame_obj["forwardBackwardValidRatio"] = rec.forwardBackwardValidRatio
                if rec.coastRiskReasons is not None:
                    frame_obj["coastRiskReasons"] = rec.coastRiskReasons
                if rec.flowProtectionLevel is not None:
                    frame_obj["flowProtectionLevel"] = rec.flowProtectionLevel
                if rec.localizationTerminationReason is not None:
                    frame_obj["localizationTerminationReason"] = rec.localizationTerminationReason
                # Phase 4.2I: pose-landmark-guided per-point ownership
                # diagnostic — same passthrough-only, developer-visibility
                # convention as every field above.
                if rec.skeletonOwnershipRatio is not None:
                    frame_obj["skeletonOwnershipRatio"] = rec.skeletonOwnershipRatio

                # Phase 4.2C (Part 2/3): crop-handoff provenance. Every
                # index/timestamp pair below is asserted equal to the SAME
                # `source_index`/`source_timestamp_ms` this frame_obj is
                # already keyed on — real invariants (checked in
                # `classify_crop_validation`'s frame-mismatch branch), not
                # merely assumed true because this loop happens to be
                # single-threaded and sequential today.
                age_ms = rec.timeSinceVerifiedDetectionMs
                if age_ms is None and rec.framesSinceVerifiedDetection is not None and src_fps:
                    # box_tracker.py only populates timeSinceVerifiedDetectionMs
                    # on tracked-branch frames; for predicted/invalid frames,
                    # derive the same real quantity from the frame-count
                    # equivalent — an honest computation, not a fabricated one.
                    age_ms = rec.framesSinceVerifiedDetection / src_fps * 1000.0
                elif rec.boxOrigin in ("detected", "reacquired"):
                    age_ms = 0.0
                validation = classify_crop_validation(
                    rec, source_index, source_index, crop_fallback_reasons[source_index] if source_index < len(crop_fallback_reasons) else None,
                    crop_planner_input_box, width, height, is_fallback_jump, bt,
                )
                is_scientifically_eligible = validation in ("crop_verified", "crop_provisional")
                frame_obj["localizationSourceFrameIndex"] = source_index
                frame_obj["localizationTimestampMs"] = source_timestamp_ms
                frame_obj["localizationState"] = rec.trackState
                frame_obj["localizationOrigin"] = rec.boxOrigin
                frame_obj["localizationVerified"] = rec.boxOrigin in ("detected", "reacquired")
                frame_obj["localizationAgeMs"] = age_ms
                frame_obj["scientificAthleteBox"] = (
                    normalized_box(rec.box, width, height) if (is_scientifically_eligible and rec.box is not None) else None
                )
                frame_obj["cropPlannerInputBox"] = (
                    normalized_box(crop_planner_input_box, width, height) if crop_planner_input_box is not None else None
                )
                frame_obj["cropSourceFrameIndex"] = source_index
                frame_obj["cropTimestampMs"] = source_timestamp_ms
                frame_obj["cropOrigin"] = rec.boxOrigin if crop_planner_input_box is not None else "extrapolated"
                frame_obj["cropAgeMs"] = age_ms
                frame_obj["cropUsedPrediction"] = rec.boxOrigin == "predicted"
                frame_obj["cropUsedFallback"] = crop_planner_input_box is None
                frame_obj["cropUsedStaleBox"] = rec.boxOrigin in ("predicted", "frozen_suspect")
                frame_obj["cropValidation"] = validation
                frame_obj["cropRejected"] = validation.startswith("crop_rejected")
                frame_obj["cropRejectedReason"] = validation if validation.startswith("crop_rejected") else None
                frame_obj["poseSourceFrameIndex"] = source_index
                frame_obj["poseTimestampMs"] = source_timestamp_ms
            if crops is not None:
                # Full per-frame crop provenance (Part 5, Day 94): lets a
                # crop->source coordinate bug be caught independently of the
                # final remapped landmark values.
                frame_obj["cropRect"] = crop_rect_norm
                frame_obj["cropScale"] = {"x": sx, "y": sy}
                frame_obj["cropTranslation"] = {"x": ox, "y": oy}
                frame_obj["sourceWidth"] = width
                frame_obj["sourceHeight"] = height
                if landmarks_crop_space:
                    frame_obj["landmarksCropSpace"] = landmarks_crop_space
                if source_index < len(boxes) and boxes[source_index] is not None:
                    bcx, bcy, bbw, bbh = boxes[source_index]
                    frame_obj["athleteBoundingBoxSource"] = {
                        "x0": (bcx - bbw / 2.0) / float(width), "y0": (bcy - bbh / 2.0) / float(height),
                        "x1": (bcx + bbw / 2.0) / float(width), "y1": (bcy + bbh / 2.0) / float(height),
                    }
                # Phase 5.0B (Part E/J) — full-body containment provenance,
                # computed from THIS frame's own real crop rect + real pose
                # result only (never a downstream metric, never a different
                # frame's evidence). Uses the same box_track_records `rec`
                # already resolved above for this exact source_index.
                landmarks_by_name = {
                    name: landmarks[idx] for idx, name in CROP_CONTAINMENT_LANDMARK_INDEX.items() if idx < len(landmarks)
                }
                containment_state, containment_diag = classify_crop_containment(
                    landmarks_by_name, crop_rect_norm, width, height,
                    rec.boxOrigin if source_index < len(box_track_records) else None,
                    frame_obj.get("cropUsedStaleBox", False), frame_obj.get("cropUsedPrediction", False),
                )
                frame_obj["cropContainmentState"] = containment_state
                frame_obj["cropUtilization"] = containment_diag["cropUtilization"]
                frame_obj["footBoundaryRisk"] = containment_diag["footBoundaryRisk"]
                frame_obj["headBoundaryRisk"] = containment_diag["headBoundaryRisk"]
                frame_obj["minJointMarginNormalized"] = containment_diag["minJointMarginNormalized"]
                frame_obj["forwardMarginNormalized"] = containment_diag["forwardMarginNormalized"]
                frame_obj["rearMarginNormalized"] = containment_diag["rearMarginNormalized"]
                frame_obj["bottomMarginNormalized"] = containment_diag["bottomMarginNormalized"]
                frame_obj["predictedCenterOffsetPx"] = crop_predicted_offsets_px[source_index] if source_index < len(crop_predicted_offsets_px) else None
                frame_obj["predictionHorizonMs"] = CROP_PREDICTION_HORIZON_MS if direction_sign else 0.0
                frame_obj["cropScaleFactor"] = crop_scale_factors[source_index] if source_index < len(crop_scale_factors) else None
                # The REAL decision plan_crops() itself made this frame —
                # not an independently-recomputed heuristic (a real gap
                # this phase's own validation found and fixed: a separate
                # heuristic here could disagree with what plan_crops()
                # actually did internally, e.g. once fresh-evidence gating
                # suppresses risk-widening — Section 6.2 of this phase's
                # own report).
                frame_obj["cropAdjustmentReason"] = crop_adjustment_reasons[source_index] if source_index < len(crop_adjustment_reasons) else None
            if result.pose_world_landmarks:
                # World landmarks are metric (hip-relative), not image-space — pass through.
                frame_obj["worldLandmarks"] = [
                    landmark_dict(lm) for lm in result.pose_world_landmarks[0]
                ]

            frames.append(frame_obj)
            if this_crop_tuple is not None:
                prev_crop_rect = this_crop_tuple
            analysis_index += 1
            source_index += 1
            emit_progress("pass2", analysis_index, pass2_total_frames, src_fps, width, height)
    finally:
        landmarker.close()
        if retry_landmarker is not None:
            retry_landmarker.close()
        cap.release()
    # Some source frames legitimately produce no analysis frame (sampling or
    # decode gaps), but the pass still consumed the complete source workload.
    emit_progress("pass2", pass2_total_frames, pass2_total_frames, src_fps, width, height, force=True)
    stage_durations["pass2PoseInferenceSeconds"] = time.time() - _t_pass2_0
    stage_durations["poseRetryCount"] = retry_count
    if retry_count:
        print("pass 2: expanded-crop retry used on %d frame(s)" % retry_count, file=sys.stderr)

    # Phase 4.2C (Part 5): pose-as-localization-feedback — must run AFTER
    # pass 2 fully completes (pose results for a frame don't exist until
    # pass 2 processes it; see `apply_pose_localization_feedback`'s
    # docstring for why this is a real, disclosed architectural limit, not
    # an oversight).
    if any("localizationOrigin" in f for f in frames):
        apply_pose_localization_feedback(frames, src_fps)
        _suspect_from_pose = sum(1 for f in frames if f.get("frozenDecision") == "pose_corroborated_freeze")
        if _suspect_from_pose:
            print(
                "pose-localization feedback: %d frame(s) newly confirmed frozen via repeated pose miss on a stale crop"
                % _suspect_from_pose,
                file=sys.stderr,
            )
        # Phase 4.2J: bounded, retroactive short-interval adjudication —
        # must run AFTER apply_pose_localization_feedback (so any frame it
        # already downgraded to frozen_suspect is correctly excluded here
        # too), and after pass 2 for the same "pose evidence doesn't exist
        # until pass 2" reason as the function above.
        adjudicate_short_disagreement_intervals(frames, src_fps, width, height)

        # Phase 5.0C: bounded, retroactive contact-critical foot landmark
        # recovery — must run AFTER every other retroactive correction
        # above, so eligibility is judged against each frame's FINAL,
        # fully-corrected boxOrigin/coastRiskState/localizationTerminationReason
        # (e.g. a frame Phase 4.2J's own adjudication just confirmed
        # `frozen_suspect` must never become secondary-recovery-eligible).
        recovery_summary = recover_contact_critical_landmarks(
            frames, local_input, width, height, src_fps, model_path, cv2, mp, mp_python, mp_vision,
            rotation_code=rotation_code,
        )

        # Phase 4.2K: bounded, retroactive, bidirectional-trajectory
        # independent localization verification -- runs last, after every
        # other retroactive correction above, so it verifies each frame's
        # FINAL boxOrigin/coastRiskState. Touches only the new `independent*`
        # fields; never mutates `boxOrigin`, `landmarks`, or any existing
        # provenance field.
        independent_verification_summary = verify_independent_localization(frames, src_fps)

    if width <= 0 or height <= 0:
        fail("Could not determine video dimensions for input: %s" % args.input)

    camera_transforms = smooth_camera_transforms(camera_transforms, cp)

    camera_evidence = None
    if ROI_ENABLED and boxes:
        athlete_track = []
        missing = [frame["index"] for frame in frames if not frame["landmarks"]]
        unstable = []
        for i, crop in enumerate(crops):
            box = boxes[i] if i < len(boxes) else None
            confidence = box_confidences[i] if i < len(box_confidences) else 0.0
            transform = camera_transforms[i] if i < len(camera_transforms) else None
            if transform and (transform["confidence"] < 0.2 and
                              abs(transform["translationX"]) + abs(transform["translationY"]) > 0.004):
                unstable.append(i)
            bbox = normalized_box(box, width, height)
            crop_box = normalized_crop(crop, width, height)
            partial = bool(bbox and (bbox["x"] < 0.005 or bbox["y"] < 0.005 or
                                     bbox["x"] + bbox["width"] > 0.995 or
                                     bbox["y"] + bbox["height"] > 0.995))
            athlete_track.append({"frame": i, "boundingBox": bbox, "cropBox": crop_box,
                                  "detectionConfidence": confidence,
                                  "cropConfidence": confidence if direct_box_flags[i] else min(confidence, 0.5),
                                  "cropSource": "direct" if direct_box_flags[i] else "interpolated",
                                  "partiallyCropped": partial})
        camera_evidence = {"cameraMotionModelVersion": CAMERA_MOTION_MODEL_VERSION,
                           "dynamicCropVersion": DYNAMIC_CROP_VERSION,
                           "athleteTrackingVersion": ATHLETE_TRACKING_VERSION,
                           "transforms": camera_transforms, "athleteTrack": athlete_track,
                           "trackingLossRanges": frame_ranges(missing),
                           "unstableFrameRanges": frame_ranges(unstable)}

    _t_camerapath_0 = time.time()
    camera_path = None
    if cp is not None and camera_evidence is not None and camera_transforms:
        def _log_camera_path(tag, payload):
            if camera_path_diagnostics:
                print(tag, json.dumps(payload, default=str), file=sys.stderr)
        try:
            # Pass 1: the automatic Phase 1 path alone — this is also the
            # "before repair" baseline (Part 9) and, when repairs exist, the
            # source of each repair's reference keyframe's CURRENT global
            # anchor (never a stale/client-cached one, Part 11).
            automatic_path = cp.build_camera_path(
                camera_transforms, orb_snapshots, width, height, len(camera_transforms),
                0, cv2, diagnostics_sink=_log_camera_path,
            )
            unavailable_before_repair = automatic_path["diagnostics"]["unavailableFrameRanges"]

            manual_repairs_by_frame = {}
            applied_repair_records = []
            if rt is not None and pending_repairs:
                automatic_frame_paths = {fp["frameIndex"]: fp for fp in automatic_path["framePaths"]}
                for repair in pending_repairs:
                    reference_frame_path = automatic_frame_paths.get(repair["referenceFrameIndex"])
                    if reference_frame_path is None or reference_frame_path.get("frameToGlobalMatrix") is None:
                        print("[world-lock-repair-apply] rejected: reference frame %s is not globally anchored in the current automatic path"
                              % repair["referenceFrameIndex"], file=sys.stderr)
                        continue
                    pixel_pairs = [{
                        "target": {"x": pair["targetPoint"]["x"] * width, "y": pair["targetPoint"]["y"] * height},
                        "reference": {"x": pair["referencePoint"]["x"] * width, "y": pair["referencePoint"]["y"] * height},
                    } for pair in repair["pointPairs"]]
                    fit = rt.fit_partial_affine(pixel_pairs)
                    if fit is None:
                        print("[world-lock-repair-apply] rejected: non_invertible for repair %s" % repair["repairId"], file=sys.stderr)
                        continue
                    reference_to_global = cp._matrix_dict_to_np(reference_frame_path["frameToGlobalMatrix"], width, height)
                    # Re-decompose the fitted (a,b,tx,ty) into the same
                    # rotation/scale/translation form camera_path.py's numpy
                    # matrices use, so composition goes through ONE consistent
                    # matrix convention (this is exact — no information lost,
                    # see repair_transform.py's module docstring).
                    decomposed_fit = rt.affine_to_decomposed_similarity(fit)
                    target_to_reference_np = cp.similarity_to_np(
                        decomposed_fit["rotationDeg"], decomposed_fit["scale"],
                        decomposed_fit["translationX"] / width, decomposed_fit["translationY"] / height,
                        width, height,
                    )
                    target_to_global_np = cp.compose_np(reference_to_global, target_to_reference_np)
                    errors = [rt._point_distance(rt.apply_fitted_affine(fit, pp["target"]), pp["reference"]) for pp in pixel_pairs]
                    mean_error_px = sum(errors) / len(errors)
                    max_error_px = max(errors)
                    manual_repairs_by_frame[repair["targetFrameIndex"]] = {
                        "repairId": repair["repairId"],
                        "referenceFrameIndex": repair["referenceFrameIndex"],
                        "pointPairs": repair["pointPairs"],
                        "targetFrameToGlobalMatrix": cp.matrix_dict(
                            target_to_global_np, width, height, 1.0, len(repair["pointPairs"]),
                            len(repair["pointPairs"]), 1.0, mean_error_px,
                        ),
                        "meanErrorPx": mean_error_px,
                    }
                    applied_repair_records.append({
                        "repairId": repair["repairId"], "createdAt": repair.get("createdAt", ""),
                        "referenceFrameIndex": repair["referenceFrameIndex"], "targetFrameIndex": repair["targetFrameIndex"],
                        "pointPairs": repair["pointPairs"],
                        "targetFrameToReferenceMatrix": cp.matrix_dict(
                            target_to_reference_np, width, height, 1.0, len(repair["pointPairs"]),
                            len(repair["pointPairs"]), 1.0, mean_error_px,
                        ),
                        "targetFrameToGlobalMatrix": manual_repairs_by_frame[repair["targetFrameIndex"]]["targetFrameToGlobalMatrix"],
                        "meanErrorPx": mean_error_px, "maxErrorPx": max_error_px,
                        "scale": decomposed_fit["scale"], "rotationDeg": decomposed_fit["rotationDeg"],
                        "acceptedBy": repair.get("acceptedBy", "unknown"),
                        "status": "accepted", "version": repair.get("version", 0),
                    })
                    print(
                        "[world-lock-repair-apply] repairId=%s target=%d reference=%d meanErrorPx=%.3f"
                        % (repair["repairId"], repair["targetFrameIndex"], repair["referenceFrameIndex"], mean_error_px),
                        file=sys.stderr,
                    )

            if manual_repairs_by_frame:
                # Pass 2: the FINAL path, with repairs spliced in. Frames before
                # each repair's target frame are unaffected (Part 8) since the
                # loop in build_camera_path processes strictly in frame order
                # and only frame_index-matching repairs alter its behavior.
                camera_path = cp.build_camera_path(
                    camera_transforms, orb_snapshots, width, height, len(camera_transforms),
                    0, cv2, diagnostics_sink=_log_camera_path, manual_repairs=manual_repairs_by_frame,
                )
                camera_path["diagnostics"]["unavailableFrameRangesBeforeRepair"] = unavailable_before_repair
                camera_path["repairs"] = applied_repair_records
            else:
                camera_path = automatic_path

            camera_path["sourceFps"] = fps
            print(
                "camera path: %d keyframes, %d/%d frames globally covered, %d relock attempts (%d succeeded), %d repairs applied"
                % (camera_path["diagnostics"]["keyframeCount"], camera_path["diagnostics"]["globallyCoveredFrameCount"],
                   len(camera_transforms), camera_path["diagnostics"]["relockAttemptCount"],
                   camera_path["diagnostics"]["relockSuccessCount"], len(manual_repairs_by_frame)),
                file=sys.stderr,
            )
        except Exception as exc:  # noqa: BLE001 — Phase 1/2 path is additive; never fail the analysis
            camera_path = None
            print("camera path build failed, continuing without it: %s" % exc, file=sys.stderr)
    stage_durations["cameraPathBuildSeconds"] = time.time() - _t_camerapath_0

    _t_serialize_0 = time.time()
    json.dump({"fps": fps, "sourceFps": src_fps,
               "coordinateSchemaVersion": WORLD_COORDINATE_SCHEMA_VERSION,
               "sourceAverageFps": evidence.get("averageFps"),
               "sourceNominalFps": evidence.get("nominalFps"),
               "sourceRealFps": evidence.get("realFps"),
               "sourceTimestampFps": evidence.get("timestampFps"),
               "sourceVariableFrameRate": evidence.get("variableFrameRate"),
               "sourceFpsClassification": fps_classification,
               "sourceFpsTierReason": fps_tier_reason,
               "sourceFpsTierPolicyVersion": FPS_POLICY["policyVersion"],
               "sourceFrameCount": source_frame_count,
               "sourceDurationSeconds": source_duration_seconds, "sourceCodec": source_codec,
               "width": width, "height": height,
               **({"cameraEvidence": camera_evidence} if camera_evidence is not None else {}),
               **({"cameraPath": camera_path} if camera_path is not None else {}),
               **({"trackingDebug": tracking_debug} if tracking_debug is not None else {}),
               "frames": frames}, sys.stdout)
    sys.stdout.flush()
    stage_durations["serializationSeconds"] = time.time() - _t_serialize_0
    stage_durations["totalSeconds"] = time.time() - _t_download0
    print("stage_durations " + json.dumps(stage_durations), file=sys.stderr)
    cleanup_input()


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 — surface any failure cleanly
        fail("MediaPipe runner failed: %s" % exc)
