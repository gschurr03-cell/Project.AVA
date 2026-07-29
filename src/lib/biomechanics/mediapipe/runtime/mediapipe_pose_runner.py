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
import os
import statistics
import subprocess
import sys
import urllib.request

POLICY_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "video", "fpsPolicy.json"))
with open(POLICY_PATH, "r", encoding="utf-8") as policy_file:
    FPS_POLICY = json.load(policy_file)

UNSUPPORTED_FPS_MESSAGE = FPS_POLICY["unsupportedMessage"]


def ratio(value):
    if not value or value == "0/0":
        return None
    try:
        numerator, denominator = value.split("/", 1)
        result = float(numerator) / float(denominator)
        return result if result > 0 else None
    except (ValueError, ZeroDivisionError):
        return None


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
    if detected > maximum:
        return "high_speed_source_normalized_to_60", "source_above_validated_rate", 60
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
    return "unsupported_source_fps", "insufficient_temporal_evidence", None

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
ROI_SMOOTH_WINDOW = int(_num("MEDIAPIPE_ROI_SMOOTH_WINDOW", 1))
# Acceleration V2: the early set/start occupies the smallest part of many clips.
# Tighten only the INTERNAL analysis crop during that window. Landmarks are still
# remapped to original-frame coordinates below; replay never sees this crop.
ACCELERATION_MODE = os.environ.get("MEDIAPIPE_ACCELERATION", "").strip().lower() in ("1", "true", "yes", "on")
ACCEL_START_SECONDS = _num("MEDIAPIPE_ACCEL_START_SECONDS", 2.5)
ACCEL_START_ZOOM = _num("MEDIAPIPE_ACCEL_START_ZOOM", 1.3)

CAMERA_MOTION_MODEL_VERSION = "ava-background-world-v2"
WORLD_COORDINATE_SCHEMA_VERSION = "ava-world-reference-v1"
DYNAMIC_CROP_VERSION = "ava-mediapipe-roi-v1"
ATHLETE_TRACKING_VERSION = "ava-single-pose-continuity-v1"
MIN_BACKGROUND_FEATURES = 12
MAX_TRACKING_GAP_FRAMES = 12


def fail(message, code=1):
    print(message, file=sys.stderr)
    sys.exit(code)


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


def make_options(model_path, mp_python, mp_vision):
    return mp_vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=model_path),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=MIN_DETECTION_CONFIDENCE,
        min_pose_presence_confidence=MIN_PRESENCE_CONFIDENCE,
        min_tracking_confidence=MIN_TRACKING_CONFIDENCE,
    )


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


def plan_crops(boxes, width, height, fps):
    """Per-frame square crop (x0,y0,x1,y1) around the athlete. A full-video planning
    pass: detected frames use their bounding box; undetected frames (e.g. the far end
    before MediaPipe could see the small athlete) EXTRAPOLATE the centre + size from
    the linear trend of the detected frames — the runner travels in a straight line at
    ~constant speed. The resulting track is smoothed so the crop glides, keeping the
    athlete reliably inside a tight, high-zoom crop (ROI_ZOOM)."""
    det = [(i, b) for i, b in enumerate(boxes) if b is not None]
    if not det:
        return [(0, 0, width, height)] * len(boxes)
    min_side = EFF_MIN_SIDE_FRAC * height
    idx = [i for i, _ in det]
    cx_s, cx_i = _lin_fit(idx, [b[0] for _, b in det])
    cy_s, cy_i = _lin_fit(idx, [b[1] for _, b in det])
    w_s, w_i = _lin_fit(idx, [b[2] for _, b in det])
    h_s, h_i = _lin_fit(idx, [b[3] for _, b in det])
    # Raw per-frame track: detected box where present, else the linear trend; then smooth.
    raw = [
        (b[0], b[1], b[2], b[3]) if b is not None else
        (cx_s * i + cx_i, cy_s * i + cy_i, w_s * i + w_i, h_s * i + h_i)
        for i, b in enumerate(boxes)
    ]
    track = _moving_avg(raw, ROI_SMOOTH_WINDOW)
    crops = []
    for i, (cx, cy, bw, h) in enumerate(track):
        side = max(min_side, EFF_PADDING * max(h, 1.0))
        if ACCELERATION_MODE and i / fps <= ACCEL_START_SECONDS:
            # Never crop inside the detected body box: hands and feet remain visible.
            side = max(1.08 * max(h, 1.0), side / ACCEL_START_ZOOM)
        half = side / 2.0
        x0, y0, x1, y1 = cx - half, cy - half, cx + half, cy + half
        # Shift (don't shrink) back inside the frame to keep the crop square.
        if x0 < 0: x1 -= x0; x0 = 0
        if y0 < 0: y1 -= y0; y0 = 0
        if x1 > width: x0 -= (x1 - width); x1 = width
        if y1 > height: y0 -= (y1 - height); y1 = height
        x0, y0 = int(max(0, round(x0))), int(max(0, round(y0)))
        x1, y1 = int(min(width, round(x1))), int(min(height, round(y1)))
        crops.append((x0, y0, x1, y1) if (x1 - x0 >= 8 and y1 - y0 >= 8) else (0, 0, width, height))
    return crops


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
    """Robust planar homography with a conservative partial-affine fallback."""
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
    homography, homography_inliers = cv2.findHomography(
        good_prev, good_next, cv2.RANSAC, 2.5, maxIters=2000, confidence=0.99
    )
    if homography is not None and homography_inliers is not None:
        selected = homography_inliers.reshape(-1).astype(bool)
        inlier_count = int(selected.sum())
        ratio = inlier_count / float(max(1, support))
        predicted = cv2.perspectiveTransform(good_prev.reshape(-1, 1, 2), homography).reshape(-1, 2)
        residuals = __import__("numpy").linalg.norm(predicted - good_next, axis=1)
        residual = float(__import__("numpy").median(residuals[selected])) if inlier_count else None
        if inlier_count >= MIN_BACKGROUND_FEATURES and ratio >= 0.5 and residual is not None and residual <= 4.0:
            a, b, tx = homography[0]; c, d, ty = homography[1]
            scale = float((a * a + c * c) ** 0.5)
            rotation = float(__import__("math").degrees(__import__("math").atan2(c, a)))
            support_score = min(1.0, support / 80.0)
            residual_score = max(0.0, 1.0 - residual / 5.0)
            confidence = max(0.0, min(1.0, ratio * support_score * residual_score))
            return {"frame": frame_index, "translationX": float(tx / gray.shape[1]),
                    "translationY": float(ty / gray.shape[0]), "rotationDeg": rotation,
                    "scale": max(0.01, scale), "confidence": confidence,
                    "supportingFeatureCount": support, "inlierRatio": ratio,
                    "residualPx": residual, "transformType": "homography",
                    "homography": [float(value) for value in homography.reshape(-1)]}
    transform, inliers = cv2.estimateAffinePartial2D(good_prev, good_next,
        method=cv2.RANSAC, ransacReprojThreshold=2.5, maxIters=2000, confidence=0.99)
    if transform is None or inliers is None:
        empty["supportingFeatureCount"] = support
        return empty
    selected = inliers.reshape(-1).astype(bool)
    inlier_count = int(selected.sum())
    ratio = inlier_count / float(max(1, support))
    a, b, tx = transform[0]; c, d, ty = transform[1]
    scale = float((a * a + c * c) ** 0.5)
    rotation = float(__import__("math").degrees(__import__("math").atan2(c, a)))
    predicted = cv2.transform(good_prev.reshape(-1, 1, 2), transform).reshape(-1, 2)
    residuals = __import__("numpy").linalg.norm(predicted - good_next, axis=1)
    residual = float(__import__("numpy").median(residuals[selected])) if inlier_count else None
    support_score = min(1.0, support / 80.0)
    residual_score = 0.0 if residual is None else max(0.0, 1.0 - residual / 5.0)
    confidence = max(0.0, min(1.0, ratio * support_score * residual_score))
    return {"frame": frame_index, "translationX": float(tx / gray.shape[1]),
            "translationY": float(ty / gray.shape[0]), "rotationDeg": rotation,
            "scale": max(0.01, scale), "confidence": confidence,
            "supportingFeatureCount": support, "inlierRatio": ratio, "residualPx": residual,
            "transformType": "partial_affine"}


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


def main():
    parser = argparse.ArgumentParser(description="MediaPipe Pose runner")
    parser.add_argument("--input", required=True, help="Video path or URL")
    parser.add_argument("--fps", type=float, default=None, help="Target analysis frame rate (maximum 60)")
    parser.add_argument("--max-frames", type=int, default=None, help="Cap analysis frames emitted")
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

    # Open the video first so a bad path fails fast (before any model download).
    cap = cv2.VideoCapture(args.input)
    if not cap.isOpened():
        fail("Could not open video input: %s" % args.input)

    opencv_fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    evidence = probe_fps_evidence(args.input)
    src_fps = evidence.get("averageFps") or opencv_fps
    if src_fps <= 0:
        fail("Could not determine the source video frame rate.")
    fps_classification, fps_tier_reason, tier_analysis_fps = classify_fps(evidence, src_fps)
    if fps_classification == "unsupported_source_fps":
        fail(UNSUPPORTED_FPS_MESSAGE)
    fps = tier_analysis_fps
    if fps > 60.0:
        fail("AVA production analysis is capped at the validated 60 FPS rate.")
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
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
    crops = None
    boxes = []
    direct_box_flags = []
    box_confidences = []
    camera_transforms = []
    if ROI_ENABLED:
        loc = mp_vision.PoseLandmarker.create_from_options(make_options(model_path, mp_python, mp_vision))
        index = 0
        prev_gray = None
        prev_box = None
        try:
            while True:
                if args.max_frames is not None and index >= int(round(args.max_frames * src_fps / fps)):
                    break
                ok, frame_bgr = cap.read()
                if not ok:
                    break
                if width == 0 or height == 0:
                    height, width = frame_bgr.shape[0], frame_bgr.shape[1]
                rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                source_timestamp_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
                if source_timestamp_ms <= 0 and index > 0:
                    source_timestamp_ms = (index / src_fps) * 1000.0
                result = loc.detect_for_video(mp_image, int(round(source_timestamp_ms)))
                box = bbox_from_result(result, width, height)
                boxes.append(box)
                if result.pose_landmarks:
                    values = [max(0.0, min(1.0, float(getattr(lm, "visibility", 0.0))))
                              for lm in result.pose_landmarks[0]]
                    box_confidences.append(sum(values) / len(values) if values else 0.0)
                else:
                    box_confidences.append(0.0)
                gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
                camera_transforms.append(estimate_background_transform(prev_gray, gray, prev_box, cv2, index))
                prev_gray = gray
                prev_box = box
                index += 1
        finally:
            loc.close()
            cap.release()
        crops = plan_crops(boxes, width, height, fps)
        direct_box_flags = [box is not None for box in boxes]
        detected = sum(1 for b in boxes if b is not None)
        print("ROI pass 1: located athlete in %d/%d frames" % (detected, len(boxes)), file=sys.stderr)
        cap = cv2.VideoCapture(args.input)  # reopen for pass 2
        if not cap.isOpened():
            fail("Could not reopen video for ROI pass 2: %s" % args.input)

    # --- Detection pass: full frame, or ROI-cropped (pass 2). Landmarks are always
    #     emitted in FULL-FRAME normalized coordinates. ---
    landmarker = mp_vision.PoseLandmarker.create_from_options(make_options(model_path, mp_python, mp_vision))
    frames = []
    source_index = 0
    analysis_index = 0
    try:
        while True:
            if args.max_frames is not None and analysis_index >= args.max_frames:
                break
            ok, frame_bgr = cap.read()
            if not ok:
                break
            # Nominal-60 footage keeps every real source frame and timestamp. True
            # high-speed footage selects the nearest source frame on the 60 Hz clock.
            wanted_source_index = (
                source_index if fps_classification in ("validated_60_fps_class", "experimental_30_fps_class")
                else int(round(analysis_index * src_fps / fps))
            )
            if source_index < wanted_source_index:
                source_index += 1
                continue
            if width == 0 or height == 0:
                height, width = frame_bgr.shape[0], frame_bgr.shape[1]

            if crops is not None:
                x0, y0, x1, y1 = crops[source_index]
                sub = frame_bgr[y0:y1, x0:x1]
                cw, ch = (x1 - x0), (y1 - y0)
                # Map crop-normalized coords back to full-frame: full = (offset + n*crop)/frame.
                sx, sy = cw / float(width), ch / float(height)
                ox, oy = x0 / float(width), y0 / float(height)
            else:
                sub = frame_bgr
                sx, sy, ox, oy = 1.0, 1.0, 0.0, 0.0

            rgb = cv2.cvtColor(sub, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            source_timestamp_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
            if source_timestamp_ms <= 0 and source_index > 0:
                source_timestamp_ms = (source_index / src_fps) * 1000.0
            analysis_timestamp_ms = (
                source_timestamp_ms if fps_classification in ("validated_60_fps_class", "experimental_30_fps_class")
                else (analysis_index / fps) * 1000.0
            )
            timestamp_ms = int(round(analysis_timestamp_ms))
            result = landmarker.detect_for_video(mp_image, timestamp_ms)

            landmarks = []
            if result.pose_landmarks:
                landmarks = [landmark_dict(lm, sx, sy, ox, oy) for lm in result.pose_landmarks[0]]
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
                "landmarks": landmarks,
                "trackingConfidence": tracking_confidence,
            }
            if result.pose_world_landmarks:
                # World landmarks are metric (hip-relative), not image-space — pass through.
                frame_obj["worldLandmarks"] = [
                    landmark_dict(lm) for lm in result.pose_world_landmarks[0]
                ]

            frames.append(frame_obj)
            analysis_index += 1
            source_index += 1
    finally:
        landmarker.close()
        cap.release()

    if width <= 0 or height <= 0:
        fail("Could not determine video dimensions for input: %s" % args.input)

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
               "frames": frames}, sys.stdout)
    sys.stdout.flush()


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 — surface any failure cleanly
        fail("MediaPipe runner failed: %s" % exc)
