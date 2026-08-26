#!/usr/bin/env python3
"""R5B.3 diagnostic-only full-frame detector counterfactual.

This deliberately does not import or alter the production runner's cadence
decision.  It invokes the same configured full-frame locator (and its
existing tile fallback) on every decoded source frame, then feeds those
candidates to a separate AthleteTracker.  Output is an inspectable JSON and
CSV; no production artifact or tracker state is written.
"""

import argparse
import csv
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RUNTIME = os.path.join(HERE, "..", "src", "lib", "biomechanics", "mediapipe", "runtime")
sys.path.insert(0, os.path.abspath(RUNTIME))

import cv2  # noqa: E402
import mediapipe as mp  # noqa: E402
from mediapipe.tasks import python as mp_python  # noqa: E402
from mediapipe.tasks.python import vision as mp_vision  # noqa: E402

import athlete_tracker as at  # noqa: E402
import mediapipe_pose_runner as runner  # noqa: E402


def candidate_json(candidate):
    if candidate is None:
        return None
    return {
        "cx": candidate.cx, "cy": candidate.cy, "w": candidate.w,
        "h": candidate.h, "completeness": candidate.completeness,
    }


def primary_plausible(candidates):
    return runner._primary_pass_has_plausible_candidate(candidates)


def box_state(frame):
    """Extract the closest persisted representation of the authoritative box."""
    box = frame.get("athleteBoundingBoxSource")
    if not box:
        return None
    return ((box["x0"] + box["x1"]) / 2, (box["y0"] + box["y1"]) / 2,
            box["x1"] - box["x0"], box["y1"] - box["y0"])


def locked_shadow(artifact_frames, lock_frame, direction, unreliable=False):
    """Build a shadow AthleteTracker from persisted, pre-failure facts only."""
    lock = artifact_frames[lock_frame]
    state = box_state(lock)
    if state is None:
        raise ValueError("lock frame has no athleteBoundingBoxSource")
    tracker = at.AthleteTracker(travel_direction=direction, fps=60.0)
    tracker.identity_state = "reacquiring" if unreliable else "tracked"
    tracker.state.center, tracker.state.height, tracker.state.time = state[:2], state[3], lock["tMs"] / 1000.0
    samples = []
    for frame in artifact_frames[max(0, lock_frame - 12):lock_frame + 1]:
        candidate_state = box_state(frame)
        if candidate_state is not None:
            samples.append((frame["tMs"] / 1000.0, candidate_state[:2]))
    speeds = []
    for (t0, p0), (t1, p1) in zip(samples, samples[1:]):
        if t1 > t0:
            speeds.append(((p1[0] - p0[0]) / (t1 - t0), (p1[1] - p0[1]) / (t1 - t0)))
    if speeds:
        tracker.state.velocity = speeds[-1]
        tracker.state.max_abs_velocity = max((vx * vx + vy * vy) ** 0.5 for vx, vy in speeds)
    return tracker, {
        "lockFrame": lock_frame, "lockTimestampMs": lock["tMs"],
        "center": {"x": state[0], "y": state[1]}, "width": state[2], "height": state[3],
        "trackingConfidence": lock.get("trackingConfidence"), "trackState": lock.get("trackState"),
        "boxOrigin": lock.get("boxOrigin"), "roi": lock.get("cropRect"),
        "velocity": {"x": tracker.state.velocity[0], "y": tracker.state.velocity[1]},
        "maxAbsVelocity": tracker.state.max_abs_velocity,
        "unreliableAt61": unreliable,
    }


def candidate_decisions(tracker, candidates, frame, timestamp_ms):
    """Run the unmodified production identity step and enrich its diagnostics."""
    state_before = tracker.identity_state
    before = tracker.state
    dt = max(0.0, timestamp_ms / 1000.0 - before.time) if before.time is not None else None
    predicted = None if before.center is None or dt is None else {
        "x": before.center[0] + before.velocity[0] * dt,
        "y": before.center[1] + before.velocity[1] * dt,
    }
    locked = None if before.center is None else {"x": before.center[0], "y": before.center[1]}
    decision = tracker.step(candidates, frame, timestamp_ms / 1000.0)
    detailed = []
    for index, candidate in enumerate(candidates):
        if candidate is None:
            detailed.append({"candidateIndex": index, "rejectionReason": "no_detection"})
            continue
        diag = dict((decision.get("candidates") or [{}])[index])
        distance_locked = None if locked is None else ((candidate.cx - locked["x"]) ** 2 + (candidate.cy - locked["y"]) ** 2) ** 0.5
        distance_predicted = None if predicted is None else ((candidate.cx - predicted["x"]) ** 2 + (candidate.cy - predicted["y"]) ** 2) ** 0.5
        detailed.append({
            "candidateIndex": index, "box": candidate_json(candidate),
            "distanceFromLockedPosition": distance_locked,
            "distanceFromPredictedPosition": distance_predicted,
            "visuallyCorrespondsToVanni": "NOT_AUTOMATICALLY_ADJUDICATED",
            **diag,
            "accepted": decision.get("selectedIndex") == index,
        })
    return decision, detailed, locked, predicted, state_before


def detect(frame_bgr, timestamp_ms, width, height, loc, tile_loc, model_path, hint_x):
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = loc.detect_for_video(image, int(round(timestamp_ms)))
    candidates = [
        at.candidate_from_landmarks(lm, width, height, runner.TRACKER_LANDMARK_NAMES)
        for lm in (result.pose_landmarks or [])
    ]
    source = "primary" if primary_plausible(candidates) else None
    fallback = "primary_accepted" if source else ("no_primary" if not any(candidates) else "below_plausibility_floor")
    if source or not runner.ROI_TILE_FALLBACK:
        return candidates, source, fallback, tile_loc, hint_x
    if tile_loc is None:
        tile_loc = mp_vision.PoseLandmarker.create_from_options(
            mp_vision.PoseLandmarkerOptions(
                base_options=mp_python.BaseOptions(model_asset_path=model_path, delegate=mp_python.BaseOptions.Delegate.CPU),
                running_mode=mp_vision.RunningMode.IMAGE, num_poses=1,
                min_pose_detection_confidence=max(0.2, runner.MIN_DETECTION_CONFIDENCE * 0.7),
                min_pose_presence_confidence=max(0.2, runner.MIN_PRESENCE_CONFIDENCE * 0.7),
                min_tracking_confidence=max(0.2, runner.MIN_TRACKING_CONFIDENCE * 0.7),
            )
        )
    tile_box, tile_confidence, tile_landmarks = runner.tiled_locate(
        frame_bgr, width, height, tile_loc, mp, mp.Image, cv2, hint_x=hint_x
    )
    for landmarks in (tile_landmarks or []):
        candidates.append(at.candidate_from_landmarks(landmarks, width, height, runner.TRACKER_LANDMARK_NAMES))
    if tile_landmarks:
        source = "tiled"
    if tile_box is not None:
        hint_x = tile_box[0]
    return candidates, source, fallback, tile_loc, hint_x


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--csv", required=True)
    ap.add_argument("--max-frames", type=int, default=None)
    ap.add_argument("--start-frame", type=int, default=0)
    ap.add_argument("--lock-artifact", help="authoritative pose artifact used to reconstruct the frame-60 lock")
    ap.add_argument("--lock-frame", type=int, default=60)
    ap.add_argument("--rotation-degrees", type=float, help="source rotation metadata when ffprobe is unavailable")
    ap.add_argument("--travel-direction", default="left_to_right", choices=("left_to_right", "right_to_left", "auto"))
    args = ap.parse_args()

    cap = cv2.VideoCapture(args.input)
    if not cap.isOpened():
        raise SystemExit("cannot open input video")
    fps = cap.get(cv2.CAP_PROP_FPS) or 60.0
    width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    rotation_degrees = args.rotation_degrees if args.rotation_degrees is not None else runner.probe_rotation_degrees(args.input)
    rotation = runner.rotation_code_for_angle(rotation_degrees, cv2)
    model_path = runner.ensure_model()
    # The worker's deployment can use its default delegate.  This offline,
    # read-only diagnostic must be runnable on a headless macOS host too.
    # CPU changes only execution delegate, never model or inference thresholds.
    options = runner.make_options(model_path, mp_python, mp_vision, num_poses=runner.TRACKER_NUM_CANDIDATES)
    options.base_options = mp_python.BaseOptions(
        model_asset_path=model_path, delegate=mp_python.BaseOptions.Delegate.CPU
    )
    loc = mp_vision.PoseLandmarker.create_from_options(options)
    artifact_frames = None
    current_shadow = unreliable_shadow = None
    lock_evidence = None
    if args.lock_artifact:
        with open(args.lock_artifact) as handle:
            artifact_frames = json.load(handle)["frames"]
        current_shadow, lock_evidence = locked_shadow(artifact_frames, args.lock_frame, args.travel_direction)
        unreliable_shadow, unreliable_lock_evidence = locked_shadow(artifact_frames, args.lock_frame, args.travel_direction, unreliable=True)
    identity = at.AthleteTracker(travel_direction=args.travel_direction, fps=fps)
    rows, tile_loc, hint_x, index, previous_ts = [], None, None, 0, None
    while True:
        if args.max_frames is not None and index >= args.max_frames:
            break
        ok, frame = cap.read()
        if not ok:
            break
        frame = runner.apply_rotation(frame, rotation, cv2)
        if index < args.start_frame:
            index += 1
            continue
        if index == 0:
            height, width = frame.shape[:2]
        ts = runner.monotonic_media_timestamp(cap.get(cv2.CAP_PROP_POS_MSEC), index, fps, previous_ts)
        previous_ts = ts
        candidates, source, fallback, tile_loc, hint_x = detect(frame, ts, width, height, loc, tile_loc, model_path, hint_x)
        decision = identity.step(candidates, index, ts / 1000.0)
        selected = decision.get("selectedIndex")
        diagnostics = decision.get("candidates", [])
        row = {
            "frame": index, "timestampMs": ts, "fullFrameDetectorInvoked": True,
            "searchSource": source, "primaryFallbackReason": fallback,
            "candidates": [candidate_json(c) for c in candidates],
            "candidateScores": diagnostics, "selectedCandidateIndex": selected,
            "candidateAccepted": selected is not None,
            "identityState": decision.get("identityState"),
            "reacquired": bool(decision.get("reacquired")),
            "selectedCandidate": candidate_json(candidates[selected]) if selected is not None else None,
        }
        if current_shadow is not None and index > args.lock_frame:
            current, current_candidates, current_locked, current_predicted, current_state = candidate_decisions(current_shadow, candidates, index, ts)
            unreliable, unreliable_candidates, unreliable_locked, unreliable_predicted, unreliable_state = candidate_decisions(unreliable_shadow, candidates, index, ts)
            row["lockedStateReplay"] = {
                "currentState": {"stateBefore": current_state, "lockedPositionBefore": current_locked, "predictedPositionBefore": current_predicted, "decision": current, "candidates": current_candidates},
                "unreliableAt61": {"stateBefore": unreliable_state, "lockedPositionBefore": unreliable_locked, "predictedPositionBefore": unreliable_predicted, "decision": unreliable, "candidates": unreliable_candidates},
            }
        rows.append(row)
        index += 1
    cap.release(); loc.close()
    if tile_loc is not None:
        tile_loc.close()
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w") as f:
        json.dump({"lockEvidence": lock_evidence, "rows": rows}, f, indent=2)
    with open(args.csv, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["frame", "timestampMs", "fullFrameDetectorInvoked", "searchSource", "primaryFallbackReason", "candidateCount", "bestCompleteness", "candidateAccepted", "identityState", "reacquired", "selectedCx", "selectedCy"])
        writer.writeheader()
        for row in rows:
            candidates = [c for c in row["candidates"] if c]
            selected = row["selectedCandidate"] or {}
            writer.writerow({"frame": row["frame"], "timestampMs": row["timestampMs"], "fullFrameDetectorInvoked": True, "searchSource": row["searchSource"], "primaryFallbackReason": row["primaryFallbackReason"], "candidateCount": len(candidates), "bestCompleteness": max((c["completeness"] for c in candidates), default=None), "candidateAccepted": row["candidateAccepted"], "identityState": row["identityState"], "reacquired": row["reacquired"], "selectedCx": selected.get("cx"), "selectedCy": selected.get("cy")})
    print(json.dumps({"frames": len(rows), "output": args.output, "csv": args.csv, "lockEvidence": lock_evidence}))


if __name__ == "__main__":
    main()
