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
import sys
import urllib.request

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
    """Pixel bounding box (cx, cy, h) of the detected pose, or None."""
    if not result.pose_landmarks:
        return None
    xs = [lm.x * width for lm in result.pose_landmarks[0]]
    ys = [lm.y * height for lm in result.pose_landmarks[0]]
    if not xs:
        return None
    return ((min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0, max(ys) - min(ys))


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
    """Centered moving average of a list of (cx, cy, h) tuples."""
    if window <= 1 or len(track) < 2:
        return list(track)
    half = window // 2
    n = len(track)
    out = []
    for i in range(n):
        lo, hi = max(0, i - half), min(n, i + half + 1)
        seg = track[lo:hi]
        k = len(seg)
        out.append((sum(t[0] for t in seg) / k, sum(t[1] for t in seg) / k, sum(t[2] for t in seg) / k))
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
    h_s, h_i = _lin_fit(idx, [b[2] for _, b in det])
    # Raw per-frame track: detected box where present, else the linear trend; then smooth.
    raw = [
        (b[0], b[1], b[2]) if b is not None else (cx_s * i + cx_i, cy_s * i + cy_i, h_s * i + h_i)
        for i, b in enumerate(boxes)
    ]
    track = _moving_avg(raw, ROI_SMOOTH_WINDOW)
    crops = []
    for i, (cx, cy, h) in enumerate(track):
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


def main():
    parser = argparse.ArgumentParser(description="MediaPipe Pose runner")
    parser.add_argument("--input", required=True, help="Video path or URL")
    parser.add_argument("--fps", type=float, default=None, help="Override frame rate")
    parser.add_argument("--max-frames", type=int, default=None, help="Cap frames processed")
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

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    fps = args.fps if (args.fps and args.fps > 0) else (src_fps if src_fps > 0 else 30.0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    model_path = ensure_model()
    print(
        "pose model=%s det=%.2f pres=%.2f track=%.2f roi=%s zoom=%.2f pad=%.2f minfrac=%.3f"
        % (os.path.basename(model_path), MIN_DETECTION_CONFIDENCE, MIN_PRESENCE_CONFIDENCE, MIN_TRACKING_CONFIDENCE, ROI_ENABLED, ROI_ZOOM, EFF_PADDING, EFF_MIN_SIDE_FRAC),
        file=sys.stderr,
    )

    # --- Pass 1: locate the athlete each frame (full frame). In ROI mode only. ---
    crops = None
    if ROI_ENABLED:
        loc = mp_vision.PoseLandmarker.create_from_options(make_options(model_path, mp_python, mp_vision))
        boxes = []
        index = 0
        try:
            while True:
                if args.max_frames is not None and index >= args.max_frames:
                    break
                ok, frame_bgr = cap.read()
                if not ok:
                    break
                if width == 0 or height == 0:
                    height, width = frame_bgr.shape[0], frame_bgr.shape[1]
                rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                result = loc.detect_for_video(mp_image, int(round((index / fps) * 1000.0)))
                boxes.append(bbox_from_result(result, width, height))
                index += 1
        finally:
            loc.close()
            cap.release()
        crops = plan_crops(boxes, width, height, fps)
        detected = sum(1 for b in boxes if b is not None)
        print("ROI pass 1: located athlete in %d/%d frames" % (detected, len(boxes)), file=sys.stderr)
        cap = cv2.VideoCapture(args.input)  # reopen for pass 2
        if not cap.isOpened():
            fail("Could not reopen video for ROI pass 2: %s" % args.input)

    # --- Detection pass: full frame, or ROI-cropped (pass 2). Landmarks are always
    #     emitted in FULL-FRAME normalized coordinates. ---
    landmarker = mp_vision.PoseLandmarker.create_from_options(make_options(model_path, mp_python, mp_vision))
    frames = []
    index = 0
    try:
        while True:
            if args.max_frames is not None and index >= args.max_frames:
                break
            ok, frame_bgr = cap.read()
            if not ok:
                break
            if width == 0 or height == 0:
                height, width = frame_bgr.shape[0], frame_bgr.shape[1]

            if crops is not None:
                x0, y0, x1, y1 = crops[index]
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
            timestamp_ms = int(round((index / fps) * 1000.0))
            result = landmarker.detect_for_video(mp_image, timestamp_ms)

            landmarks = []
            if result.pose_landmarks:
                landmarks = [landmark_dict(lm, sx, sy, ox, oy) for lm in result.pose_landmarks[0]]

            frame_obj = {
                "index": index,
                "timestampMs": (index / fps) * 1000.0,
                "landmarks": landmarks,
            }
            if result.pose_world_landmarks:
                # World landmarks are metric (hip-relative), not image-space — pass through.
                frame_obj["worldLandmarks"] = [
                    landmark_dict(lm) for lm in result.pose_world_landmarks[0]
                ]

            frames.append(frame_obj)
            index += 1
    finally:
        landmarker.close()
        cap.release()

    if width <= 0 or height <= 0:
        fail("Could not determine video dimensions for input: %s" % args.input)

    json.dump({"fps": fps, "width": width, "height": height, "frames": frames}, sys.stdout)
    sys.stdout.flush()


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 — surface any failure cleanly
        fail("MediaPipe runner failed: %s" % exc)
