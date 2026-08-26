#!/usr/bin/env python3
"""Evaluation-only, identical-crop pose-backend benchmark for Phase 5.0E."""

import argparse
import hashlib
import json
import math
import os
import resource
import statistics
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "tmp" / "phase50e"
MODEL_MP = ROOT / "src/lib/biomechanics/mediapipe/runtime/models/pose_landmarker_heavy.task"
MODEL_RTM = ROOT / "models/rtmpose/rtmpose-m_simcc-coco-wholebody_pt-aic-coco_270e-256x192-cd5e845c_20230123.pth"
CONFIG_RTM = ROOT / "models/rtmpose/rtmpose-m_8xb64-270e_coco-wholebody-256x192.py"
VISIBILITY_FLOOR = 0.4

ARTIFACTS = {
    "gav_stationary_reference": ROOT / "tmp/phase42k-final-gav.pose.json",
    "vanni_fly_240": ROOT / "tmp/phase42k-final-vanni240.pose.json",
    "vanni_fly_120": ROOT / "tmp/phase42k-final-vanni120.pose.json",
    "vanni_fly_60": ROOT / "tmp/phase42k-final-vanni60.pose.json",
}

MP_INDEX = {
    0: "nose", 11: "left_shoulder", 12: "right_shoulder", 13: "left_elbow",
    14: "right_elbow", 15: "left_wrist", 16: "right_wrist", 23: "left_hip",
    24: "right_hip", 25: "left_knee", 26: "right_knee", 27: "left_ankle",
    28: "right_ankle", 29: "left_heel", 30: "right_heel",
    31: "left_toe", 32: "right_toe",
}
RTM_INDEX = {
    0: "nose", 5: "left_shoulder", 6: "right_shoulder", 7: "left_elbow",
    8: "right_elbow", 9: "left_wrist", 10: "right_wrist", 11: "left_hip",
    12: "right_hip", 13: "left_knee", 14: "right_knee", 15: "left_ankle",
    16: "right_ankle", 17: "left_toe", 19: "left_heel",
    20: "right_toe", 22: "right_heel",
}
CONTACT = ("left_ankle", "right_ankle", "left_heel", "right_heel", "left_toe", "right_toe")


def sha256_bytes(value):
    return hashlib.sha256(value).hexdigest()


def read_json(path):
    with open(path, encoding="utf8") as handle:
        return json.load(handle)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf8") as handle:
        json.dump(value, handle, indent=2, sort_keys=True)


def visible(frame, joint):
    point = frame.get("keypoints", {}).get(joint)
    return bool(point and point.get("score", point.get("visibility", 0)) >= VISIBILITY_FLOOR)


def choose_frames(label, artifact):
    frames = artifact["frames"]
    n = len(frames)
    chosen = {0, n - 1}
    # Positive controls spanning the clip.
    chosen.update(round(i * (n - 1) / 11) for i in range(12))
    # Every availability transition and a one-frame bracket on either side.
    previous = None
    for i, frame in enumerate(frames):
        state = tuple(visible(frame, joint) for joint in CONTACT)
        if previous is not None and state != previous:
            chosen.update((i - 1, i, i + 1))
        previous = state
    if label == "vanni_fly_240":
        chosen.update(range(430, 551, 5))
        chosen.update((59, 76, 96, 119, 137, 141, 278, 330, 375, 464, 465,
                       474, 475, 490, 496, 517, 527, 528, 543, 550, 567, 568,
                       583, 587, 632, 668, 964, 988, 991, 1010, 1019))
    elif label == "gav_stationary_reference":
        chosen.update((10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130))
    elif label == "vanni_fly_120":
        chosen.update((200, 215, 240, 246, 247, 249, 300, 310, 315, 316, 317, 325, 400, 480, 482))
    elif label == "vanni_fly_60":
        chosen.update((20, 25, 26, 27, 29, 30, 90, 120, 145, 151, 152, 155, 160, 200, 232))
    return sorted(i for i in chosen if 0 <= i < n and frames[i].get("cropRect"))


def prepare():
    import cv2
    rows = []
    crop_dir = WORK / "crops"
    crop_dir.mkdir(parents=True, exist_ok=True)
    for label, artifact_path in ARTIFACTS.items():
        artifact = read_json(artifact_path)
        source = WORK / "sources" / f"{label}.mov"
        cap = cv2.VideoCapture(str(source))
        if not cap.isOpened():
            raise RuntimeError(f"Could not open {source}")
        selected = set(choose_frames(label, artifact))
        source_index = 0
        while selected:
            ok, image = cap.read()
            if not ok:
                break
            if source_index not in selected:
                source_index += 1
                continue
            selected.remove(source_index)
            frame = artifact["frames"][source_index]
            # OpenCV does not honor the 180-degree container orientation used by production.
            if label.startswith("vanni_"):
                image = cv2.rotate(image, cv2.ROTATE_180)
            h, w = image.shape[:2]
            rect = frame["cropRect"]
            x0, y0 = round(rect["x0"] * w), round(rect["y0"] * h)
            x1, y1 = round(rect["x1"] * w), round(rect["y1"] * h)
            crop = image[y0:y1, x0:x1]
            ok_png, encoded = cv2.imencode(".png", crop)
            if not ok_png:
                raise RuntimeError("PNG encode failed")
            payload = encoded.tobytes()
            crop_path = crop_dir / f"{label}-{source_index:04d}.png"
            crop_path.write_bytes(payload)
            rows.append({
                "benchmark": label,
                "sourceVideo": str(source.relative_to(ROOT)),
                "sourceFrameIndex": source_index,
                "timestampMs": frame.get("sourceTimestampMs", frame["tMs"]),
                "cropRect": rect,
                "cropPath": str(crop_path.relative_to(ROOT)),
                "cropSha256": sha256_bytes(payload),
                "cropPixelSha256": sha256_bytes(crop.tobytes()),
                "cropWidth": int(crop.shape[1]), "cropHeight": int(crop.shape[0]),
                "sourceWidth": w, "sourceHeight": h,
                "productionKeypoints": frame.get("keypoints", {}),
                "boxOrigin": frame.get("boxOrigin"),
                "trackState": frame.get("trackState"),
                "coastRiskState": frame.get("coastRiskState"),
                "cropContainmentState": frame.get("cropContainmentState"),
            })
            source_index += 1
        cap.release()
        if selected:
            raise RuntimeError(f"Missing decoded frames for {label}: {sorted(selected)}")
    rows.sort(key=lambda row: (row["benchmark"], row["sourceFrameIndex"]))
    write_json(WORK / "critical-frame-manifest.json", {
        "schemaVersion": "ava-phase-5.0e-critical-frames-v1",
        "selectionPolicy": "positive controls + all foot-availability transitions + charter regions",
        "visibilityFloor": VISIBILITY_FLOOR,
        "frames": rows,
    })
    print(json.dumps({"prepared": len(rows), "byBenchmark": counts(rows, "benchmark")}))


def map_source(points, scores, native_map, row):
    rect = row["cropRect"]
    sx, sy = rect["x1"] - rect["x0"], rect["y1"] - rect["y0"]
    raw, mapped = {}, {}
    for index, name in native_map.items():
        if index >= len(points):
            continue
        x, y = float(points[index][0]), float(points[index][1])
        score = float(scores[index])
        if not all(math.isfinite(v) for v in (x, y, score)):
            continue
        raw[name] = {"x": x, "y": y, "score": score}
        mapped[name] = {
            "x": rect["x0"] + x * sx,
            "y": rect["y0"] + y * sy,
            "score": max(0.0, min(1.0, score)),
        }
    return raw, mapped


def infer(backend, limit=None, suffix="", benchmark=None):
    import cv2
    import numpy as np
    manifest = read_json(WORK / "critical-frame-manifest.json")
    output = []
    load_start = time.perf_counter()
    if backend == "mediapipe":
        import mediapipe as mp
        from mediapipe.tasks import python
        from mediapipe.tasks.python import vision
        options = vision.PoseLandmarkerOptions(
            base_options=python.BaseOptions(
                model_asset_path=str(MODEL_MP), delegate=python.BaseOptions.Delegate.CPU,
            ),
            running_mode=vision.RunningMode.VIDEO, num_poses=1,
            min_pose_detection_confidence=0.3, min_pose_presence_confidence=0.3,
            min_tracking_confidence=0.3,
        )
        model = vision.PoseLandmarker.create_from_options(options)
    else:
        import torch
        from mmpose.apis import inference_topdown, init_model
        original_load = torch.load
        def trusted_load(*args, **kwargs):
            kwargs["weights_only"] = False
            return original_load(*args, **kwargs)
        torch.load = trusted_load
        model = init_model(str(CONFIG_RTM), str(MODEL_RTM), device="cpu")
    load_ms = (time.perf_counter() - load_start) * 1000
    last_benchmark = None
    timestamp_offset = 0
    rows = [row for row in manifest["frames"] if benchmark is None or row["benchmark"] == benchmark]
    rows = rows[:limit] if limit else rows
    for row in rows:
        payload = (ROOT / row["cropPath"]).read_bytes()
        if sha256_bytes(payload) != row["cropSha256"]:
            raise RuntimeError("Crop hash mismatch")
        image = cv2.imdecode(np.frombuffer(payload, np.uint8), cv2.IMREAD_COLOR)
        if sha256_bytes(image.tobytes()) != row["cropPixelSha256"]:
            raise RuntimeError("Crop pixel hash mismatch")
        start = time.perf_counter()
        if backend == "mediapipe":
            if last_benchmark != row["benchmark"]:
                timestamp_offset += 10_000_000
                last_benchmark = row["benchmark"]
            rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = model.detect_for_video(mp_image, timestamp_offset + int(round(row["timestampMs"])))
            if result.pose_landmarks:
                landmarks = result.pose_landmarks[0]
                points = [(landmarks[i].x, landmarks[i].y) for i in range(len(landmarks))]
                scores = [landmarks[i].visibility for i in range(len(landmarks))]
            else:
                points, scores = [], []
            native_map = MP_INDEX
        else:
            predictions = inference_topdown(
                model, image,
                bboxes=np.array([[0, 0, image.shape[1], image.shape[0]]], dtype=np.float32),
                bbox_format="xyxy",
            )
            if predictions:
                instances = predictions[0].pred_instances
                pixel_points = np.asarray(instances.keypoints)[0]
                points = [(p[0] / image.shape[1], p[1] / image.shape[0]) for p in pixel_points]
                scores = np.asarray(instances.keypoint_scores)[0]
            else:
                points, scores = [], []
            native_map = RTM_INDEX
        elapsed_ms = (time.perf_counter() - start) * 1000
        raw, mapped = map_source(points, scores, native_map, row)
        unsupported = []
        for joint in CONTACT:
            if joint not in native_map.values():
                unsupported.append(joint)
        output.append({
            "benchmark": row["benchmark"], "sourceFrameIndex": row["sourceFrameIndex"],
            "timestampMs": row["timestampMs"], "backend": backend,
            "modelVersion": "pose_landmarker_heavy" if backend == "mediapipe" else "rtmpose-m-coco-wholebody-256x192",
            "cropRect": row["cropRect"], "cropSha256": row["cropSha256"],
            "cropPixelSha256": row["cropPixelSha256"], "rawLandmarks": raw,
            "sourceLandmarks": mapped, "unsupportedLandmarks": unsupported,
            "processingTimeMs": elapsed_ms,
        })
    if backend == "mediapipe":
        model.close()
    write_json(WORK / f"{backend}{suffix}-results.json", {
        "schemaVersion": "ava-phase-5.0e-backend-output-v1", "backend": backend,
        "modelLoadTimeMs": load_ms,
        "peakResidentBytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        "frames": output,
    })
    print(json.dumps({"backend": backend, "frames": len(output), "loadMs": load_ms,
                      "meanInferenceMs": statistics.mean(r["processingTimeMs"] for r in output)}))


def counts(rows, key):
    out = {}
    for row in rows:
        value = row[key]
        out[value] = out.get(value, 0) + 1
    return out


def summarize():
    manifest = read_json(WORK / "critical-frame-manifest.json")
    manifest_by_key = {(r["benchmark"], r["sourceFrameIndex"]): r for r in manifest["frames"]}
    report = {"schemaVersion": "ava-phase-5.0e-summary-v1", "visibilityFloor": VISIBILITY_FLOOR,
              "identicalCropContract": True, "backends": {}}
    for backend in ("mediapipe", "rtmpose"):
        data = read_json(WORK / f"{backend}-results.json")
        backend_summary = {"modelLoadTimeMs": data["modelLoadTimeMs"], "benchmarks": {}}
        for label in ARTIFACTS:
            rows = [r for r in data["frames"] if r["benchmark"] == label]
            joints = ("left_hip", "right_hip", "left_knee", "right_knee",
                      "left_ankle", "right_ankle", "left_heel", "right_heel", "left_toe", "right_toe")
            def ready(row, names):
                return all(row["sourceLandmarks"].get(n, {}).get("score", 0) >= VISIBILITY_FLOOR for n in names)
            availability = {joint: sum(ready(row, (joint,)) for row in rows) for joint in joints}
            consecutive_pairs = []
            bone_ratios = []
            swaps = 0
            previous = None
            for row in rows:
                points = row["sourceLandmarks"]
                for side in ("left", "right"):
                    hip, knee, ankle = (points.get(f"{side}_{name}") for name in ("hip", "knee", "ankle"))
                    shoulders = [points.get("left_shoulder"), points.get("right_shoulder")]
                    hips = [points.get("left_hip"), points.get("right_hip")]
                    if hip and knee and ankle and all(shoulders) and all(hips):
                        torso = math.hypot((shoulders[0]["x"] + shoulders[1]["x"] - hips[0]["x"] - hips[1]["x"]) / 2,
                                           (shoulders[0]["y"] + shoulders[1]["y"] - hips[0]["y"] - hips[1]["y"]) / 2)
                        if torso > 0:
                            bone_ratios.extend((math.hypot(hip["x"]-knee["x"], hip["y"]-knee["y"])/torso,
                                               math.hypot(knee["x"]-ankle["x"], knee["y"]-ankle["y"])/torso))
                if previous and row["sourceFrameIndex"] == previous["sourceFrameIndex"] + 1:
                    dt = (row["timestampMs"] - previous["timestampMs"]) / 1000
                    if dt > 0:
                        velocities = []
                        for joint in CONTACT:
                            a, b = previous["sourceLandmarks"].get(joint), points.get(joint)
                            if a and b and a["score"] >= VISIBILITY_FLOOR and b["score"] >= VISIBILITY_FLOOR:
                                velocities.append(math.hypot(b["x"]-a["x"], b["y"]-a["y"])/dt)
                        consecutive_pairs.extend(velocities)
                previous = row
            invalid_bones = sum(r < 0.05 or r > 2.2 for r in bone_ratios)
            inference = [r["processingTimeMs"] for r in rows]
            backend_summary["benchmarks"][label] = {
                "frames": len(rows), "availabilityCounts": availability,
                "fullLowerBodyFrames": sum(ready(r, joints[:6]) for r in rows),
                "ankleReadyFrames": sum(ready(r, ("left_ankle", "right_ankle")) for r in rows),
                "heelReadyFrames": sum(ready(r, ("left_heel", "right_heel")) for r in rows),
                "toeReadyFrames": sum(ready(r, ("left_toe", "right_toe")) for r in rows),
                "contactReadyFrames": sum(ready(r, CONTACT) for r in rows),
                "anatomicalSamples": len(bone_ratios), "anatomicalOutliers": invalid_bones,
                "consecutiveFootVelocitySamples": len(consecutive_pairs),
                "medianFootVelocityFrameWidthsPerS": statistics.median(consecutive_pairs) if consecutive_pairs else None,
                "meanInferenceMs": statistics.mean(inference),
                "p95InferenceMs": sorted(inference)[max(0, math.ceil(len(inference)*0.95)-1)],
                "cropHashesMatchManifest": all(
                    r["cropSha256"] == manifest_by_key[(label, r["sourceFrameIndex"])]["cropSha256"] and
                    r["cropPixelSha256"] == manifest_by_key[(label, r["sourceFrameIndex"])]["cropPixelSha256"]
                    for r in rows),
            }
        report["backends"][backend] = backend_summary
    mp = read_json(WORK / "mediapipe-results.json")["frames"]
    rt = read_json(WORK / "rtmpose-results.json")["frames"]
    report["crossBackend"] = {
        "frameKeysIdentical": [(r["benchmark"], r["sourceFrameIndex"], r["timestampMs"]) for r in mp]
                              == [(r["benchmark"], r["sourceFrameIndex"], r["timestampMs"]) for r in rt],
        "cropHashesIdentical": [r["cropSha256"] for r in mp] == [r["cropSha256"] for r in rt],
        "cropPixelHashesIdentical": [r["cropPixelSha256"] for r in mp] == [r["cropPixelSha256"] for r in rt],
        "contactThreshold": VISIBILITY_FLOOR,
    }
    write_json(WORK / "summary.json", report)
    print(json.dumps(report["crossBackend"]))


def render():
    import cv2
    import numpy as np
    manifest = read_json(WORK / "critical-frame-manifest.json")["frames"]
    mp_rows = {(r["benchmark"], r["sourceFrameIndex"]): r for r in read_json(WORK / "mediapipe-results.json")["frames"]}
    rt_rows = {(r["benchmark"], r["sourceFrameIndex"]): r for r in read_json(WORK / "rtmpose-results.json")["frames"]}
    requested = {
        ("gav_stationary_reference", 50), ("gav_stationary_reference", 90),
        ("vanni_fly_240", 76), ("vanni_fly_240", 475), ("vanni_fly_240", 517),
        ("vanni_fly_240", 543), ("vanni_fly_240", 568), ("vanni_fly_240", 583),
        ("vanni_fly_120", 247), ("vanni_fly_120", 315),
        ("vanni_fly_60", 145), ("vanni_fly_60", 160),
    }
    tiles = []
    edges = (("left_hip","left_knee"),("left_knee","left_ankle"),("left_ankle","left_heel"),("left_heel","left_toe"),
             ("right_hip","right_knee"),("right_knee","right_ankle"),("right_ankle","right_heel"),("right_heel","right_toe"))
    for row in manifest:
        key = (row["benchmark"], row["sourceFrameIndex"])
        if key not in requested:
            continue
        crop = cv2.imdecode(np.frombuffer((ROOT / row["cropPath"]).read_bytes(), np.uint8), cv2.IMREAD_COLOR)
        crop = cv2.resize(crop, (480, 360), interpolation=cv2.INTER_NEAREST)
        for result, color in ((mp_rows[key], (0,255,0)), (rt_rows[key], (255,0,255))):
            points = result["rawLandmarks"]
            for a, b in edges:
                if a in points and b in points:
                    pa, pb = points[a], points[b]
                    cv2.line(crop, (round(pa["x"]*480),round(pa["y"]*360)),
                             (round(pb["x"]*480),round(pb["y"]*360)), color, 2)
            for point in points.values():
                cv2.circle(crop, (round(point["x"]*480),round(point["y"]*360)), 3, color, -1)
        cv2.putText(crop, f"{row['benchmark']} f{row['sourceFrameIndex']} green=MP magenta=RTM",
                    (6,18), cv2.FONT_HERSHEY_SIMPLEX, .42, (255,255,255), 1, cv2.LINE_AA)
        tiles.append(crop)
    while len(tiles) % 3:
        tiles.append(np.zeros_like(tiles[0]))
    sheet = cv2.vconcat([cv2.hconcat(tiles[i:i+3]) for i in range(0,len(tiles),3)])
    path = WORK / "pixel-adjudication-sheet.png"
    cv2.imwrite(str(path), sheet)
    print(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("prepare", "infer-mediapipe", "infer-rtmpose", "summarize", "render"))
    parser.add_argument("--limit", type=int)
    parser.add_argument("--suffix", default="")
    parser.add_argument("--benchmark")
    args = parser.parse_args()
    if args.command == "prepare":
        prepare()
    elif args.command == "summarize":
        summarize()
    elif args.command == "render":
        render()
    else:
        infer(args.command.replace("infer-", ""), args.limit, args.suffix, args.benchmark)


if __name__ == "__main__":
    main()
