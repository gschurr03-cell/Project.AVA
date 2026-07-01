#!/usr/bin/env python3
"""MediaPipe Pose runner for Project AVA.

Reads a video (local path or URL) with OpenCV, runs MediaPipe Pose on each
frame, and emits a single JSON document to stdout matching the
`MediaPipePoseResult` schema the TypeScript service validates:

    {"fps", "width", "height", "frames": [
        {"index", "timestampMs", "landmarks": [...], "worldLandmarks": [...]?}
    ]}

Only JSON is written to stdout; all diagnostics go to stderr. Exits nonzero on
any failure. This script is invoked by PythonMediaPipePoseService; it is never
imported by the TypeScript build, so missing Python deps never break the build.
"""

import argparse
import json
import os
import sys

INSTALL_HINT = (
    "MediaPipe runtime unavailable. Install Python dependencies: "
    "mediapipe opencv-python"
)


def fail(message, code=1):
    print(message, file=sys.stderr)
    sys.exit(code)


def main():
    parser = argparse.ArgumentParser(description="MediaPipe Pose runner")
    parser.add_argument("--input", required=True, help="Video path or URL")
    parser.add_argument("--fps", type=float, default=None, help="Override frame rate")
    parser.add_argument("--max-frames", type=int, default=None, help="Cap frames processed")
    args = parser.parse_args()

    # Keep native logging off stdout so it stays pure JSON.
    os.environ.setdefault("GLOG_minloglevel", "3")
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

    try:
        import cv2
        import mediapipe as mp
    except Exception as exc:  # ImportError or native load failure
        fail("%s (%s)" % (INSTALL_HINT, exc))

    cap = cv2.VideoCapture(args.input)
    if not cap.isOpened():
        fail("Could not open video input: %s" % args.input)

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    fps = args.fps if (args.fps and args.fps > 0) else (src_fps if src_fps > 0 else 30.0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    pose = mp.solutions.pose.Pose(
        static_image_mode=False, model_complexity=1, enable_segmentation=False
    )

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

            result = pose.process(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))

            landmarks = []
            if result.pose_landmarks:
                for lm in result.pose_landmarks.landmark:
                    landmarks.append(
                        {"x": lm.x, "y": lm.y, "z": lm.z, "visibility": lm.visibility}
                    )

            frame_obj = {
                "index": index,
                "timestampMs": (index / fps) * 1000.0,
                "landmarks": landmarks,
            }

            if result.pose_world_landmarks:
                world = [
                    {"x": lm.x, "y": lm.y, "z": lm.z, "visibility": lm.visibility}
                    for lm in result.pose_world_landmarks.landmark
                ]
                frame_obj["worldLandmarks"] = world

            frames.append(frame_obj)
            index += 1
    finally:
        pose.close()
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
