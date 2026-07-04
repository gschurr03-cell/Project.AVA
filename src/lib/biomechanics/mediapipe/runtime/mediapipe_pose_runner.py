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
    try:
        v = float(os.environ.get(env_key, default))
        return min(1.0, max(0.0, v))
    except (TypeError, ValueError):
        return default


MIN_DETECTION_CONFIDENCE = _conf("MEDIAPIPE_MIN_DETECTION_CONFIDENCE", 0.3)
MIN_PRESENCE_CONFIDENCE = _conf("MEDIAPIPE_MIN_PRESENCE_CONFIDENCE", 0.3)
MIN_TRACKING_CONFIDENCE = _conf("MEDIAPIPE_MIN_TRACKING_CONFIDENCE", 0.3)


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


def landmark_dict(lm):
    # Omit visibility/presence when absent — emitting null would fail the
    # TypeScript schema, which expects an optional number (undefined, not null).
    out = {"x": lm.x, "y": lm.y, "z": lm.z}
    visibility = getattr(lm, "visibility", None)
    presence = getattr(lm, "presence", None)
    if visibility is not None:
        out["visibility"] = visibility
    if presence is not None:
        out["presence"] = presence
    return out


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
        "pose model=%s det=%.2f pres=%.2f track=%.2f"
        % (os.path.basename(model_path), MIN_DETECTION_CONFIDENCE, MIN_PRESENCE_CONFIDENCE, MIN_TRACKING_CONFIDENCE),
        file=sys.stderr,
    )
    options = mp_vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=model_path),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=MIN_DETECTION_CONFIDENCE,
        min_pose_presence_confidence=MIN_PRESENCE_CONFIDENCE,
        min_tracking_confidence=MIN_TRACKING_CONFIDENCE,
    )
    landmarker = mp_vision.PoseLandmarker.create_from_options(options)

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

            rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            timestamp_ms = int(round((index / fps) * 1000.0))
            result = landmarker.detect_for_video(mp_image, timestamp_ms)

            landmarks = []
            if result.pose_landmarks:
                landmarks = [landmark_dict(lm) for lm in result.pose_landmarks[0]]

            frame_obj = {
                "index": index,
                "timestampMs": (index / fps) * 1000.0,
                "landmarks": landmarks,
            }
            if result.pose_world_landmarks:
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
