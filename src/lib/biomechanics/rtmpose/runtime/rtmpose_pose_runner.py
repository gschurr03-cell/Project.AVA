#!/usr/bin/env python3
"""Experimental AVA fly pose runner: YOLO track → dynamic crop → RTMPose.

Only canonical, normalized ORIGINAL-frame coordinates are emitted. Crops are
internal inference views and are never stored or shown to the coach.
"""

import argparse
import json
import os
import sys
from urllib.request import urlopen


COCO_TO_AVA = {
    0: "nose", 5: "left_shoulder", 6: "right_shoulder",
    7: "left_elbow", 8: "right_elbow", 9: "left_wrist", 10: "right_wrist",
    11: "left_hip", 12: "right_hip", 13: "left_knee", 14: "right_knee",
    15: "left_ankle", 16: "right_ankle",
    # COCO-WholeBody RTMPose models expose foot landmarks after COCO-17.
    17: "left_toe", 19: "left_heel", 20: "right_toe", 22: "right_heel",
}


def fail(message):
    print(message, file=sys.stderr)
    raise SystemExit(2)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--fps", type=float)
    parser.add_argument("--max-frames", type=int)
    parser.add_argument("--detector", default=os.getenv("RTMPOSE_YOLO_MODEL", "yolo11n.pt"))
    parser.add_argument("--config", default=os.getenv("RTMPOSE_CONFIG"))
    parser.add_argument("--checkpoint", default=os.getenv("RTMPOSE_CHECKPOINT"))
    parser.add_argument("--crop-padding", type=float, default=float(os.getenv("RTMPOSE_CROP_PADDING", "1.35")))
    return parser.parse_args()


def local_input(source):
    if not source.startswith(("http://", "https://")):
        return source, None
    import tempfile
    handle = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    with urlopen(source, timeout=60) as response:
        handle.write(response.read())
    handle.close()
    return handle.name, handle.name


def expanded_crop(box, width, height, padding):
    x1, y1, x2, y2 = [float(v) for v in box]
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    bw, bh = max(2.0, x2 - x1) * padding, max(2.0, y2 - y1) * padding
    # Slight forward/headroom bias helps retain sprint limbs at speed.
    cy -= bh * 0.04
    return (
        max(0, int(cx - bw / 2)), max(0, int(cy - bh / 2)),
        min(width, int(cx + bw / 2)), min(height, int(cy + bh / 2)),
    )


def choose_tracked_person(result, previous_center):
    boxes = result.boxes
    if boxes is None or len(boxes) == 0:
        return None, 0.0
    candidates = []
    for index, xyxy in enumerate(boxes.xyxy.cpu().numpy()):
        confidence = float(boxes.conf[index].item())
        cx, cy = (xyxy[0] + xyxy[2]) / 2, (xyxy[1] + xyxy[3]) / 2
        area = max(1.0, (xyxy[2] - xyxy[0]) * (xyxy[3] - xyxy[1]))
        distance = 0.0 if previous_center is None else ((cx - previous_center[0]) ** 2 + (cy - previous_center[1]) ** 2) ** 0.5
        # Prefer temporal continuity; area breaks ties on the first frame.
        score = confidence + min(area / 1_000_000, 0.25) - distance / 5000
        candidates.append((score, xyxy, confidence, (cx, cy)))
    _, box, confidence, center = max(candidates, key=lambda item: item[0])
    return (box, center), confidence


def main():
    args = parse_args()
    if not args.config or not args.checkpoint:
        fail("Set RTMPOSE_CONFIG and RTMPOSE_CHECKPOINT (or pass --config/--checkpoint).")
    try:
        import cv2
        import numpy as np
        import torch
        from ultralytics import YOLO
        from mmpose.apis import init_model, inference_topdown
    except ImportError as error:
        fail(f"Missing RTMPose dependency: {error}. Install requirements-rtmpose.txt.")

    # PyTorch 2.6+ flipped torch.load's default to weights_only=True, which refuses
    # to unpickle the metadata inside MMPose/MMEngine checkpoints and raises
    # UnpicklingError during init_model. The RTMPose config + checkpoint are trusted,
    # official OpenMMLab files that AVA ships, so restore full-unpickle loading for
    # checkpoint reads. Scoped to this runner process — no site-packages are edited.
    _original_torch_load = torch.load

    def _torch_load_full_weights(*load_args, **load_kwargs):
        load_kwargs["weights_only"] = False
        return _original_torch_load(*load_args, **load_kwargs)

    torch.load = _torch_load_full_weights

    source, temporary = local_input(args.input)
    capture = cv2.VideoCapture(source)
    if not capture.isOpened():
        fail(f"Could not open video: {args.input}")
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    source_fps = float(capture.get(cv2.CAP_PROP_FPS) or 30.0)
    output_fps = args.fps or source_fps
    sample_every = max(1, round(source_fps / output_fps))
    detector = YOLO(args.detector)
    pose_model = init_model(args.config, args.checkpoint, device=os.getenv("RTMPOSE_DEVICE", "cpu"))
    frames = []
    source_index = 0
    previous_center = None

    while True:
        ok, image = capture.read()
        if not ok:
            break
        if source_index % sample_every:
            source_index += 1
            continue
        # Ultralytics ByteTrack supplies persistent IDs; explicit center continuity
        # keeps selection stable even if an ID briefly disappears.
        tracked = detector.track(image, classes=[0], persist=True, verbose=False)[0]
        selected, tracking_confidence = choose_tracked_person(tracked, previous_center)
        keypoints = {}
        if selected is not None:
            box, previous_center = selected
            x1, y1, x2, y2 = expanded_crop(box, width, height, args.crop_padding)
            crop = image[y1:y2, x1:x2]
            if crop.size:
                predictions = inference_topdown(
                    pose_model,
                    crop,
                    bboxes=np.array([[0, 0, crop.shape[1], crop.shape[0]]], dtype=np.float32),
                    bbox_format="xyxy",
                )
                if predictions:
                    instances = predictions[0].pred_instances
                    points = np.asarray(instances.keypoints)[0]
                    scores = np.asarray(instances.keypoint_scores)[0]
                    for native_index, name in COCO_TO_AVA.items():
                        if native_index >= len(points):
                            continue
                        px, py = float(points[native_index][0]), float(points[native_index][1])
                        score = float(scores[native_index])
                        if not np.isfinite([px, py, score]).all():
                            continue
                        keypoints[name] = {
                            "x": max(0.0, min(1.0, (x1 + px) / width)),
                            "y": max(0.0, min(1.0, (y1 + py) / height)),
                            "score": max(0.0, min(1.0, score)),
                        }
        frames.append({
            "index": len(frames),
            "tMs": source_index * 1000.0 / source_fps,
            "keypoints": keypoints,
            "trackingConfidence": max(0.0, min(1.0, tracking_confidence)),
        })
        source_index += 1
        if args.max_frames and len(frames) >= args.max_frames:
            break

    capture.release()
    if temporary:
        try: os.unlink(temporary)
        except OSError: pass
    result = {
        "backend": "rtmpose",
        "modelVersion": "rtmpose-yolo-v1",
        "coordSpace": "normalized",
        "fps": output_fps,
        "width": width,
        "height": height,
        "frames": frames,
    }
    print(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
