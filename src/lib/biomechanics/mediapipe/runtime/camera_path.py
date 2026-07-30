"""Offline global camera-path (keyframe graph) builder — Phase 1.

Replaces the browser's fragile *unbounded sequential chain* (walk every frame
0..T composing adjacent partial-affine transforms) with one deterministic
artifact computed ONCE, here, in the worker:

    global reference frame --(keyframeToGlobalMatrix)--> keyframe --(keyframeToFrameMatrix)--> frame

Every frame's `frameToGlobalMatrix`/`globalToFrameMatrix` is resolved HERE and
stored directly in `CameraFramePath`. The browser only ever does an O(1) array
lookup by frame index and applies ONE transform — it never composes a chain.

Two distinct ways a new keyframe is created:

  REBASE   — the local step into this frame is itself reliable, but the chain
             since the active keyframe has grown too long/drifted too far
             (bookkeeping/precision hygiene, Part 3). The new keyframe inherits
             global anchoring for free by composing the parent keyframe's own
             global anchor with the single reliable step — no matching needed,
             always succeeds.

  RELOCK   — the chain was genuinely LOST (a run of frames with no reliable
             local step). Once local tracking stabilizes again, the recovered
             frame becomes a relock CANDIDATE: real ORB descriptor matching
             (not optical flow — the candidate and any prior keyframe are not
             temporally adjacent, so optical flow cannot bridge them) is
             attempted against the global reference frame first, then a
             bounded set of prior anchored keyframes. Success re-anchors the
             segment to the global scene; failure leaves it `local_only`
             (world overlays stay hidden for that segment — never fabricated).

Matrix representation: every `*Matrix` field is the SAME decomposed-similarity
shape as the existing per-frame `Transform` (translationX/Y, rotationDeg,
scale, ...) — not a raw 3x3 array. A `partial_affine` fit (rotation + uniform
scale + translation) carries zero information loss through this decomposition
(RANSAC's `estimateAffinePartial2D` never returns shear/non-uniform scale), so
nothing is lost, and the browser can project through it with the SAME, already
-tested `applyForward`/`applyInverse` primitives (`zoneAnchors.ts`) it already
has — no new matrix math is introduced client-side. Internally, this module
composes/inverts using explicit 3x3 homogeneous pixel-space numpy matrices
(`*_np` helpers) and decomposes back to the stored shape at each boundary.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable, Optional

import numpy as np

CAMERA_PATH_VERSION_LEGACY_V1 = "ava-camera-path-v1"
# Phase 2 (Part 9): bumped because the schema now carries optional manual-
# repair provenance fields. Every field a v1 consumer relied on is unchanged;
# this is what the worker emits going forward. TS mirror: cameraPathSchema.ts.
CAMERA_PATH_VERSION = "ava-camera-path-v2"

# --- Keyframe-selection thresholds (Part 3). Conservative, documented, and
# deliberately reused from the existing browser-side tolerances where a direct
# analogue exists (MIN_BACKGROUND_FEATURES, MIN_SAFE_ANCHOR_* in zoneAnchors.ts)
# so the worker and the legacy browser fallback agree on what "reliable" means. ---

# A local step (frame i-1 -> i) below this confidence cannot extend a keyframe.
MIN_STEP_CONFIDENCE = 0.45
# Below this many tracked background features, a step is not trustworthy.
MIN_STEP_FEATURES = 12
# A step whose RANSAC residual exceeds this (px) cannot extend a keyframe.
MAX_STEP_RESIDUAL_PX = 4.0
# Consecutive unreliable steps tolerated before declaring the chain LOST
# (matches the browser's MAX_SAFE_ANCHOR_DEGRADED_FRAMES "bounded hold").
LOST_TOLERANCE_FRAMES = 6
# Consecutive RELIABLE steps required after a loss before the first of them is
# treated as a relock candidate — avoids relocking on one noisy fluke frame.
RELOCK_CANDIDATE_STABILITY_FRAMES = 3

# REBASE triggers (step itself reliable, but chain hygiene demands a fresh
# local origin). Any one trigger is sufficient.
MAX_KEYFRAME_SPAN_FRAMES = 45          # elapsed frames since the active keyframe
MAX_CUMULATIVE_TRANSLATION_NORM = 0.35  # normalized displacement since the active keyframe
MAX_CUMULATIVE_SCALE_DEVIATION = 0.25   # |scale - 1| since the active keyframe
MAX_CUMULATIVE_ROTATION_DEG = 8.0       # |rotation| since the active keyframe

# --- Relock (Part 6) — ORB descriptor matching, real RANSAC, real validation. ---
RELOCK_RATIO_TEST = 0.75
RELOCK_MIN_MATCHES = 20
RELOCK_MIN_INLIERS = 12
RELOCK_MIN_INLIER_RATIO = 0.35
# Inlier points (in the CANDIDATE frame) must span at least this fraction of
# min(width, height) on BOTH axes — rejects matches concentrated in one region
# (e.g. all on the athlete, or all in one static corner of the crowd).
RELOCK_MIN_SPATIAL_SPREAD = 0.20
RELOCK_MAX_RESIDUAL_PX = 4.0
RELOCK_RANSAC_REPROJ_THRESHOLD = 3.0
# Bounded search (Part 5 strategy C): try at most this many prior anchored
# keyframes (nearest-first) before strategy D (fail closed).
RELOCK_MAX_CANDIDATE_KEYFRAMES = 5

# Periodic ORB-snapshot stride (Part 6/8): computing ORB descriptors for every
# frame would be wasteful — snapshots are only needed at frames that might
# become relock candidates or relock targets. A snapshot is captured every
# ORB_SNAPSHOT_STRIDE frames (plus frame 0, always) DURING the worker's
# existing pass-1 decode — no extra video decode pass is introduced.
ORB_SNAPSHOT_STRIDE = 20
# Detector budget (not an acceptance threshold) — see capture_orb_snapshot.
ORB_FEATURE_COUNT = 6000


# ---------------------------------------------------------------------------
# Pixel-space homogeneous matrix helpers. Mirrors zoneAnchors.ts's
# applyForward/applyInverse semantics exactly (translation stored normalized,
# rotation+scale applied in pixel space) so decomposed output round-trips
# through the browser's existing primitives without any reinterpretation.
# ---------------------------------------------------------------------------

def identity_np() -> np.ndarray:
    return np.eye(3)


def similarity_to_np(rotation_deg: float, scale: float, tx_norm: float, ty_norm: float,
                      width: float, height: float) -> np.ndarray:
    theta = math.radians(rotation_deg)
    cos, sin = math.cos(theta) * scale, math.sin(theta) * scale
    return np.array([
        [cos, -sin, tx_norm * width],
        [sin, cos, ty_norm * height],
        [0.0, 0.0, 1.0],
    ])


def np_to_similarity(matrix: np.ndarray, width: float, height: float) -> dict:
    """Decompose a general 3x3 affine back to rotation+uniform-scale+translation
    (the same convention `estimate_background_transform` already uses: scale
    from the first column's norm, rotation from atan2 of that column)."""
    a, c = matrix[0, 0], matrix[1, 0]
    scale = float(math.hypot(a, c))
    rotation = float(math.degrees(math.atan2(c, a)))
    return {
        "rotationDeg": rotation,
        "scale": max(1e-6, scale),
        "translationX": float(matrix[0, 2] / width),
        "translationY": float(matrix[1, 2] / height),
    }


def invert_np(matrix: np.ndarray) -> np.ndarray:
    return np.linalg.inv(matrix)


def compose_np(later: np.ndarray, earlier: np.ndarray) -> np.ndarray:
    """`later` applied AFTER `earlier`: compose(B, A) maps a point through A then B."""
    return later @ earlier


def apply_point_np(matrix: np.ndarray, x_norm: float, y_norm: float,
                    width: float, height: float) -> tuple[float, float]:
    out = matrix @ np.array([x_norm * width, y_norm * height, 1.0])
    return float(out[0] / width), float(out[1] / height)


def matrix_dict(matrix: np.ndarray, width: float, height: float, confidence: float,
                 feature_count: int, inlier_count: int, inlier_ratio: float,
                 residual_px: Optional[float]) -> dict:
    """The stored `*Matrix` shape: a decomposed similarity transform, NOT a raw
    array — see module docstring. `transformType` is always partial_affine in
    Phase 1 (homography is explicitly out of scope, Part 3 preamble). Shaped
    identically to the existing per-frame `Transform` (`cameraTransformFrameSchema`
    in recordingMode.ts) so the browser can reuse `applyForward`/`applyInverse`
    directly. `frame` is a structural-compatibility filler (0) — consumers index
    by array position / `CameraFramePath.frameIndex`, never by this nested field."""
    decomposed = np_to_similarity(matrix, width, height)
    return {
        **decomposed,
        "frame": 0,
        "confidence": max(0.0, min(1.0, confidence)),
        "supportingFeatureCount": int(feature_count),
        "inlierRatio": max(0.0, min(1.0, inlier_ratio)),
        "residualPx": None if residual_px is None else float(residual_px),
        "transformType": "partial_affine",
    }


# ---------------------------------------------------------------------------
# ORB snapshot capture (called from pass 1 in mediapipe_pose_runner.py — reuses
# the grayscale frame it already decoded; no extra video read).
# ---------------------------------------------------------------------------

def should_capture_orb_snapshot(frame_index: int) -> bool:
    return frame_index == 0 or frame_index % ORB_SNAPSHOT_STRIDE == 0


def capture_orb_snapshot(gray, athlete_mask, cv2) -> Optional[dict]:
    """ORB keypoints+descriptors for one frame, athlete-masked (reuses the same
    mask helper as the adjacent-frame optical-flow path — the athlete must not
    dominate matching, Part 6). `ORB_FEATURE_COUNT` (not an acceptance
    threshold — a detector budget) was measured against the real Dave clip's
    3840x2160 stadium background: 2000 features yielded too few ratio-test
    survivors between distant frames (9-15 matches, below RELOCK_MIN_MATCHES);
    6000 consistently yields 20-60+. This is a legitimate detection-quality
    improvement, not a loosened acceptance bar — RANSAC/inlier/spatial/residual
    thresholds below are unchanged."""
    orb = cv2.ORB_create(nfeatures=ORB_FEATURE_COUNT)
    keypoints, descriptors = orb.detectAndCompute(gray, athlete_mask)
    if descriptors is None or len(keypoints) < RELOCK_MIN_MATCHES:
        return None
    return {
        "points": np.array([kp.pt for kp in keypoints], dtype=np.float32),
        "descriptors": descriptors,
    }


# ---------------------------------------------------------------------------
# Relock matching (Part 5/6). `matcher_fn` is injectable so the accept/reject
# decision logic is unit-testable without real images (scripts/camera-path-
# worker-sanity.py injects a synthetic matcher).
# ---------------------------------------------------------------------------

def default_matcher_fn(cv2):
    def match(descriptors_a, descriptors_b):
        bf = cv2.BFMatcher(cv2.NORM_HAMMING)
        pairs = bf.knnMatch(descriptors_a, descriptors_b, k=2)
        good = []
        for pair in pairs:
            if len(pair) < 2:
                continue
            m, n = pair
            if m.distance < RELOCK_RATIO_TEST * n.distance:
                good.append(m)
        return good
    return match


@dataclass
class RelockAttempt:
    candidate_frame: int
    target_keyframe_id: str
    matches: int
    inliers: int
    inlier_ratio: float
    spatial_coverage: float
    residual_px: Optional[float]
    accepted: bool
    rejection_reason: Optional[str]


def _spatial_coverage(points: np.ndarray, width: float, height: float) -> float:
    if len(points) == 0:
        return 0.0
    spread_x = (points[:, 0].max() - points[:, 0].min()) / max(1.0, width)
    spread_y = (points[:, 1].max() - points[:, 1].min()) / max(1.0, height)
    return float(min(spread_x, spread_y))


def attempt_relock(candidate_frame_index: int, candidate_snapshot: dict,
                    target_keyframe: dict, target_snapshot: dict,
                    width: float, height: float, cv2, matcher_fn) -> tuple[Optional[np.ndarray], RelockAttempt]:
    """One bounded attempt: candidate frame -> target (already-anchored) keyframe.
    Returns (candidateToGlobal matrix or None, diagnostic record)."""
    matches = matcher_fn(candidate_snapshot["descriptors"], target_snapshot["descriptors"])
    match_count = len(matches)
    if match_count < RELOCK_MIN_MATCHES:
        return None, RelockAttempt(candidate_frame_index, target_keyframe["keyframeId"], match_count,
                                    0, 0.0, 0.0, None, False, "insufficient_matches")

    src = np.array([candidate_snapshot["points"][m.queryIdx] for m in matches], dtype=np.float32)
    dst = np.array([target_snapshot["points"][m.trainIdx] for m in matches], dtype=np.float32)
    matrix2x3, inlier_mask = cv2.estimateAffinePartial2D(
        src, dst, method=cv2.RANSAC, ransacReprojThreshold=RELOCK_RANSAC_REPROJ_THRESHOLD,
        maxIters=2000, confidence=0.99,
    )
    if matrix2x3 is None or inlier_mask is None:
        return None, RelockAttempt(candidate_frame_index, target_keyframe["keyframeId"], match_count,
                                    0, 0.0, 0.0, None, False, "degenerate_transform")

    selected = inlier_mask.reshape(-1).astype(bool)
    inlier_count = int(selected.sum())
    inlier_ratio = inlier_count / float(max(1, match_count))
    inlier_points = src[selected]
    coverage = _spatial_coverage(inlier_points, width, height)
    predicted = cv2.transform(src.reshape(-1, 1, 2), matrix2x3).reshape(-1, 2)
    residuals = np.linalg.norm(predicted - dst, axis=1)
    residual_px = float(np.median(residuals[selected])) if inlier_count else None

    reason = None
    if inlier_count < RELOCK_MIN_INLIERS:
        reason = "insufficient_inliers"
    elif inlier_ratio < RELOCK_MIN_INLIER_RATIO:
        reason = "insufficient_inlier_ratio"
    elif coverage < RELOCK_MIN_SPATIAL_SPREAD:
        reason = "inliers_concentrated_in_one_region"
    elif residual_px is None or residual_px > RELOCK_MAX_RESIDUAL_PX:
        reason = "excessive_residual"

    record = RelockAttempt(candidate_frame_index, target_keyframe["keyframeId"], match_count,
                            inlier_count, inlier_ratio, coverage, residual_px,
                            accepted=reason is None, rejection_reason=reason)
    if reason is not None:
        return None, record

    candidate_to_target = np.vstack([matrix2x3, [0.0, 0.0, 1.0]])
    target_to_global = _matrix_dict_to_np(target_keyframe["keyframeToGlobalMatrix"], width, height)
    candidate_to_global = compose_np(target_to_global, candidate_to_target)
    return candidate_to_global, record


def _matrix_dict_to_np(matrix_dict_value: dict, width: float, height: float) -> np.ndarray:
    return similarity_to_np(matrix_dict_value["rotationDeg"], matrix_dict_value["scale"],
                             matrix_dict_value["translationX"], matrix_dict_value["translationY"],
                             width, height)


# ---------------------------------------------------------------------------
# Keyframe-graph construction (Part 3/4/5) — the single forward pass.
# ---------------------------------------------------------------------------

@dataclass
class _ActiveSegment:
    keyframe_id: str
    frame_index: int
    cumulative_np: np.ndarray
    cumulative_translation_norm: float = 0.0
    cumulative_rotation_deg: float = 0.0
    cumulative_scale_deviation: float = 0.0
    anchored: bool = False


def build_camera_path(camera_transforms: list[dict], orb_snapshots: dict[int, dict],
                       width: int, height: int, total_frames: int,
                       global_reference_frame_index: int, cv2,
                       matcher_fn: Optional[Callable] = None,
                       diagnostics_sink: Optional[Callable[[str, dict], None]] = None,
                       manual_repairs: Optional[dict[int, dict]] = None) -> dict:
    """Builds one `CameraPathArtifact`-shaped dict. Deterministic: depends only
    on `camera_transforms` (already computed per-frame, previous->current),
    `orb_snapshots` (already captured at a bounded set of frames), and
    `manual_repairs` (already-validated Phase 2 repairs, keyed by target frame
    index) — never on anything computed during a previous invocation, so
    re-running on the same inputs reproduces byte-identical output (Part
    12 test #9/#15's worker-side analogue).

    `manual_repairs[frame_index]` (Part 8/11): each entry carries
    `repairId` and `targetFrameToGlobalMatrix` (already validated+estimated
    upstream — this function does not re-derive it from point pairs, it only
    splices in the resulting anchor). Processed inline in frame order so
    everything BEFORE a repair's target frame is completely unaffected
    (Part 8: "must not move accepted earlier world anchors"), and everything
    after naturally rebases/extends/relocks from the new anchor exactly like
    an automatic relock success would."""
    if matcher_fn is None:
        matcher_fn = default_matcher_fn(cv2)
    log = diagnostics_sink or (lambda tag, payload: None)
    manual_repairs = manual_repairs or {}

    keyframes: dict[str, dict] = {}
    frame_paths: list[dict] = []
    relock_log: list[RelockAttempt] = []
    next_keyframe_seq = 0

    def new_keyframe_id() -> str:
        nonlocal next_keyframe_seq
        kid = "kf-%d" % next_keyframe_seq
        next_keyframe_seq += 1
        return kid

    ref = global_reference_frame_index
    root_id = new_keyframe_id()
    identity = identity_np()
    keyframes[root_id] = {
        "keyframeId": root_id, "frameIndex": ref,
        "keyframeToGlobalMatrix": matrix_dict(identity, width, height, 1.0, 0, 0, 1.0, 0.0),
        "globalToKeyframeMatrix": matrix_dict(identity, width, height, 1.0, 0, 0, 1.0, 0.0),
        "state": "anchored", "featureCount": 0, "inlierCount": 0, "inlierRatio": 1.0,
        "residualPx": 0.0, "confidence": 1.0, "parentKeyframeId": None,
        "origin": "automatic",
    }
    active = _ActiveSegment(root_id, ref, identity.copy(), anchored=True)

    bad_run = 0
    good_run = 0
    unresolved_relock_pending = False

    def emit_frame_path(frame_index: int, keyframe: dict, local_np: np.ndarray,
                         confidence: float, feature_count: int, inlier_ratio: float,
                         residual_px: Optional[float], state: str) -> None:
        local_dict = matrix_dict(local_np, width, height, confidence, feature_count, 0, inlier_ratio, residual_px)
        inverse_local_dict = matrix_dict(invert_np(local_np), width, height, confidence, feature_count, 0, inlier_ratio, residual_px)
        entry = {
            "frameIndex": frame_index, "keyframeId": keyframe["keyframeId"],
            "keyframeToFrameMatrix": local_dict, "frameToKeyframeMatrix": inverse_local_dict,
            "state": state, "confidence": confidence, "featureCount": feature_count,
            "inlierCount": 0, "inlierRatio": inlier_ratio, "residualPx": residual_px,
            "globalToFrameMatrix": None, "frameToGlobalMatrix": None,
        }
        if keyframe["state"] == "anchored":
            kf_to_global = _matrix_dict_to_np(keyframe["keyframeToGlobalMatrix"], width, height)
            frame_to_global = compose_np(kf_to_global, local_np)
            entry["frameToGlobalMatrix"] = matrix_dict(frame_to_global, width, height, confidence,
                                                        feature_count, 0, inlier_ratio, residual_px)
            entry["globalToFrameMatrix"] = matrix_dict(invert_np(frame_to_global), width, height, confidence,
                                                        feature_count, 0, inlier_ratio, residual_px)
            entry["state"] = "anchored" if state != "unavailable" else "unavailable"
        frame_paths.append(entry)

    emit_frame_path(ref, keyframes[root_id], identity, 1.0, 0, 1.0, 0.0, "anchored")

    # Process strictly increasing from the reference frame forward; Phase 1's
    # fixture (and the worker's own decode order) is always forward-sequential,
    # so this is the only order `camera_transforms` supports.
    def try_relock(frame_index: int, step: dict) -> tuple[str, bool]:
        """Attempt to anchor a brand-new keyframe at `frame_index` to the global
        scene (Part 5 strategies A/B/C, bounded; D = fail closed). Used both when
        recovering from a genuine loss AND when a still-unanchored `local_only`
        segment hits a rebase threshold — Part 5 requires CONTINUING to scan for
        a viable relock, not just once at the moment tracking first recovers.
        Returns (new_keyframe_id, anchored)."""
        new_id = new_keyframe_id()
        candidate_snapshot = orb_snapshots.get(frame_index)
        global_matrix, accepted_target = None, None
        attempts_left = RELOCK_MAX_CANDIDATE_KEYFRAMES
        if candidate_snapshot is not None:
            for target_id in _relock_candidate_order(keyframes, ref):
                if attempts_left <= 0:
                    break
                target_kf = keyframes[target_id]
                target_snapshot = orb_snapshots.get(target_kf["frameIndex"])
                if target_snapshot is None:
                    continue
                attempts_left -= 1
                result_matrix, record = attempt_relock(
                    frame_index, candidate_snapshot, target_kf, target_snapshot, width, height, cv2, matcher_fn,
                )
                relock_log.append(record)
                log("[camera-path-relock]", {
                    "candidateFrame": record.candidate_frame, "targetPriorKeyframe": record.target_keyframe_id,
                    "descriptorMatches": record.matches, "inliers": record.inliers,
                    "inlierRatio": record.inlier_ratio, "spatialCoverage": record.spatial_coverage,
                    "residualPx": record.residual_px, "accepted": record.accepted,
                    "rejectionReason": record.rejection_reason,
                })
                if result_matrix is not None:
                    global_matrix, accepted_target = result_matrix, target_kf
                    break
        feature_count = len(candidate_snapshot["points"]) if candidate_snapshot is not None else 0
        if global_matrix is not None:
            keyframes[new_id] = {
                "keyframeId": new_id, "frameIndex": frame_index,
                "keyframeToGlobalMatrix": matrix_dict(global_matrix, width, height, step["confidence"],
                                                       feature_count, 0, step["inlierRatio"], step.get("residualPx")),
                "globalToKeyframeMatrix": matrix_dict(invert_np(global_matrix), width, height, step["confidence"],
                                                       feature_count, 0, step["inlierRatio"], step.get("residualPx")),
                "state": "anchored", "featureCount": feature_count, "inlierCount": 0,
                "inlierRatio": step["inlierRatio"], "residualPx": step.get("residualPx"),
                "confidence": step["confidence"], "parentKeyframeId": accepted_target["keyframeId"],
                "relockEvent": True, "origin": "automatic",
            }
            log("[camera-path-build]", {"frame": frame_index, "activeKeyframe": new_id, "state": "anchored",
                                         "localMatches": None, "localInliers": None, "localResidual": None,
                                         "newKeyframeReason": "relock_succeeded"})
        else:
            keyframes[new_id] = {
                "keyframeId": new_id, "frameIndex": frame_index,
                "keyframeToGlobalMatrix": None, "globalToKeyframeMatrix": None,
                "state": "local_only", "featureCount": feature_count, "inlierCount": 0,
                "inlierRatio": step["inlierRatio"], "residualPx": step.get("residualPx"),
                "confidence": step["confidence"], "parentKeyframeId": None, "relockEvent": True,
                "origin": "automatic",
            }
            log("[camera-path-build]", {"frame": frame_index, "activeKeyframe": new_id, "state": "local_only",
                                         "localMatches": None, "localInliers": None, "localResidual": None,
                                         "newKeyframeReason": "relock_failed_fail_closed"})
        return new_id, global_matrix is not None

    for frame_index in range(ref + 1, total_frames):
        if frame_index in manual_repairs:
            # Part 8/11: splice in a confirmed manual repair as a brand-new,
            # unconditionally anchored keyframe — bypassing rebase/relock
            # entirely for this one frame. Every frame BEFORE this one was
            # already emitted above and is untouched; every frame AFTER
            # naturally rebases/extends/relocks from this anchor via the
            # normal loop logic below, exactly like an automatic relock
            # success. `targetFrameToGlobalMatrix` was already estimated and
            # validated upstream (browser preview + worker re-estimation from
            # the same point pairs) — this function only splices in the result.
            repair = manual_repairs[frame_index]
            new_id = new_keyframe_id()
            global_matrix = _matrix_dict_to_np(repair["targetFrameToGlobalMatrix"], width, height)
            keyframes[new_id] = {
                "keyframeId": new_id, "frameIndex": frame_index,
                "keyframeToGlobalMatrix": repair["targetFrameToGlobalMatrix"],
                "globalToKeyframeMatrix": matrix_dict(invert_np(global_matrix), width, height, 1.0,
                                                       len(repair["pointPairs"]), len(repair["pointPairs"]), 1.0,
                                                       repair.get("meanErrorPx")),
                "state": "anchored", "featureCount": len(repair["pointPairs"]),
                "inlierCount": len(repair["pointPairs"]), "inlierRatio": 1.0,
                "residualPx": repair.get("meanErrorPx"), "confidence": 1.0, "parentKeyframeId": None,
                "origin": "manual", "repairId": repair["repairId"],
            }
            log("[world-lock-repair-apply]", {
                "repairId": repair["repairId"], "repairedKeyframe": new_id,
                "referenceFrameIndex": repair.get("referenceFrameIndex"), "targetFrameIndex": frame_index,
            })
            active = _ActiveSegment(new_id, frame_index, identity_np(), anchored=True)
            bad_run = 0
            good_run = 0
            unresolved_relock_pending = False
            emit_frame_path(frame_index, keyframes[new_id], identity_np(), 1.0, len(repair["pointPairs"]),
                             1.0, repair.get("meanErrorPx"), "anchored")
            continue

        step = camera_transforms[frame_index] if frame_index < len(camera_transforms) else None
        step_ok = bool(
            step is not None
            and step.get("confidence", 0.0) >= MIN_STEP_CONFIDENCE
            and step.get("supportingFeatureCount", 0) >= MIN_STEP_FEATURES
            and (step.get("residualPx") is None or step["residualPx"] <= MAX_STEP_RESIDUAL_PX)
        )

        if not step_ok:
            bad_run += 1
            good_run = 0
            reason = "missing_transform" if step is None else (
                "low_confidence" if step.get("confidence", 0.0) < MIN_STEP_CONFIDENCE
                else "insufficient_features" if step.get("supportingFeatureCount", 0) < MIN_STEP_FEATURES
                else "excessive_residual"
            )
            log("[camera-path-build]", {
                "frame": frame_index, "activeKeyframe": active.keyframe_id, "state": "unavailable",
                "localMatches": None, "localInliers": None, "localResidual": step.get("residualPx") if step else None,
                "newKeyframeReason": None, "rejectionReason": reason,
            })
            emit_frame_path(frame_index, keyframes[active.keyframe_id], active.cumulative_np,
                             0.0, step.get("supportingFeatureCount", 0) if step else 0, 0.0, None, "unavailable")
            if bad_run > LOST_TOLERANCE_FRAMES:
                unresolved_relock_pending = True
            continue

        # A reliable step exists. Extend the cumulative local transform first —
        # every decision below is relative to the POST-step state (Part 4: a
        # frame's projection must resolve through global -> keyframe -> frame,
        # never from the previous RENDERED position; this is the worker's own
        # analogue — compose from the immutable active-keyframe origin, not
        # from an accumulated running total that forgets its own baseline).
        step_np = similarity_to_np(step["rotationDeg"], step["scale"], step["translationX"], step["translationY"], width, height)
        candidate_cumulative = compose_np(step_np, active.cumulative_np)
        decomposed = np_to_similarity(candidate_cumulative, width, height)
        cumulative_translation_norm = math.hypot(decomposed["translationX"], decomposed["translationY"])
        cumulative_scale_deviation = abs(decomposed["scale"] - 1.0)
        cumulative_rotation = abs(decomposed["rotationDeg"])
        good_run += 1

        was_lost = bad_run > LOST_TOLERANCE_FRAMES
        needs_new_keyframe = was_lost or (
            frame_index - active.frame_index > MAX_KEYFRAME_SPAN_FRAMES
            or cumulative_translation_norm > MAX_CUMULATIVE_TRANSLATION_NORM
            or cumulative_scale_deviation > MAX_CUMULATIVE_SCALE_DEVIATION
            or cumulative_rotation > MAX_CUMULATIVE_ROTATION_DEG
        )

        if was_lost and unresolved_relock_pending and good_run < RELOCK_CANDIDATE_STABILITY_FRAMES:
            # Tracking looks reliable again but not yet for long enough to trust
            # as a relock candidate — stays unavailable one more beat.
            log("[camera-path-build]", {
                "frame": frame_index, "activeKeyframe": active.keyframe_id, "state": "unavailable",
                "localMatches": None, "localInliers": None, "localResidual": step.get("residualPx"),
                "newKeyframeReason": None, "rejectionReason": "awaiting_relock_stability",
            })
            emit_frame_path(frame_index, keyframes[active.keyframe_id], active.cumulative_np,
                             step["confidence"], step["supportingFeatureCount"], step["inlierRatio"],
                             step.get("residualPx"), "unavailable")
            continue

        active_kf = keyframes[active.keyframe_id]
        # Two distinct roads to a NEW keyframe (Part 3 vs Part 5): if the active
        # segment is already anchored, span/drift/scale/rotation thresholds only
        # need a cheap REBASE (compose forward — always succeeds, no matching).
        # If the active segment is NOT anchored (recovering from a loss, or a
        # still-unresolved local_only run that just hit its own rebase
        # threshold), every new keyframe is a fresh RELOCK attempt — "continue
        # scanning later frames for a viable relock" (Part 5), not a one-shot.
        if needs_new_keyframe and not was_lost and active_kf["state"] == "anchored":
            new_id = new_keyframe_id()
            parent_to_global = _matrix_dict_to_np(active_kf["keyframeToGlobalMatrix"], width, height)
            new_global = compose_np(parent_to_global, candidate_cumulative)
            keyframes[new_id] = {
                "keyframeId": new_id, "frameIndex": frame_index,
                "keyframeToGlobalMatrix": matrix_dict(new_global, width, height, step["confidence"],
                                                       step["supportingFeatureCount"], 0, step["inlierRatio"], step.get("residualPx")),
                "globalToKeyframeMatrix": matrix_dict(invert_np(new_global), width, height, step["confidence"],
                                                       step["supportingFeatureCount"], 0, step["inlierRatio"], step.get("residualPx")),
                "state": "anchored", "featureCount": step["supportingFeatureCount"], "inlierCount": 0,
                "inlierRatio": step["inlierRatio"], "residualPx": step.get("residualPx"),
                "confidence": step["confidence"], "parentKeyframeId": active.keyframe_id,
                "origin": "automatic",
            }
            log("[camera-path-build]", {
                "frame": frame_index, "activeKeyframe": new_id, "state": "anchored",
                "localMatches": None, "localInliers": None, "localResidual": step.get("residualPx"),
                "newKeyframeReason": "rebase_" + (
                    "span" if frame_index - active.frame_index > MAX_KEYFRAME_SPAN_FRAMES
                    else "displacement" if cumulative_translation_norm > MAX_CUMULATIVE_TRANSLATION_NORM
                    else "scale" if cumulative_scale_deviation > MAX_CUMULATIVE_SCALE_DEVIATION
                    else "rotation"
                ),
            })
            active = _ActiveSegment(new_id, frame_index, identity_np(), anchored=True)
            emit_frame_path(frame_index, keyframes[new_id], identity_np(), step["confidence"],
                             step["supportingFeatureCount"], step["inlierRatio"], step.get("residualPx"), "anchored")
            bad_run = 0
            unresolved_relock_pending = False
            continue

        if needs_new_keyframe and (was_lost or active_kf["state"] != "anchored"):
            new_id, anchored = try_relock(frame_index, step)
            active = _ActiveSegment(new_id, frame_index, identity_np(), anchored=anchored)
            bad_run = 0
            unresolved_relock_pending = False
            emit_frame_path(frame_index, keyframes[new_id], identity_np(), step["confidence"],
                             step["supportingFeatureCount"], step["inlierRatio"], step.get("residualPx"),
                             "anchored" if anchored else "local_only")
            continue

        # Ordinary extension: no new keyframe needed.
        active.cumulative_np = candidate_cumulative
        active.cumulative_translation_norm = cumulative_translation_norm
        bad_run = 0
        log("[camera-path-build]", {
            "frame": frame_index, "activeKeyframe": active.keyframe_id, "state": active_kf["state"],
            "localMatches": None, "localInliers": None, "localResidual": step.get("residualPx"),
            "newKeyframeReason": None,
        })
        emit_frame_path(frame_index, active_kf, active.cumulative_np, step["confidence"],
                         step["supportingFeatureCount"], step["inlierRatio"], step.get("residualPx"),
                         active_kf["state"])

    frame_paths.sort(key=lambda entry: entry["frameIndex"])
    anchored_frames = [entry for entry in frame_paths if entry["state"] == "anchored"]
    relock_events = [record for record in relock_log if record.accepted]
    unavailable_ranges = _ranges([entry["frameIndex"] for entry in frame_paths if entry["state"] != "anchored"])

    # Frames whose active keyframe descends (via parentKeyframeId, forward
    # rebase chains included) from a manual repair — "repaired coverage".
    children_of: dict[str, list[str]] = {}
    for kf in keyframes.values():
        parent = kf.get("parentKeyframeId")
        if parent:
            children_of.setdefault(parent, []).append(kf["keyframeId"])
    manual_rooted: set[str] = set()
    stack = [kf["keyframeId"] for kf in keyframes.values() if kf.get("origin") == "manual"]
    while stack:
        kid = stack.pop()
        if kid in manual_rooted:
            continue
        manual_rooted.add(kid)
        stack.extend(children_of.get(kid, []))
    # Only frames actually ANCHORED (genuinely benefiting from the repair) —
    # a frame can be assigned kf-4 (descended from a repair) and still be
    # "unavailable" if local tracking fails again immediately afterward; that
    # must not be reported as repaired coverage.
    repaired_frame_indices = [entry["frameIndex"] for entry in frame_paths
                               if entry["keyframeId"] in manual_rooted and entry["state"] == "anchored"]
    repaired_ranges = _ranges(repaired_frame_indices)
    manual_keyframe_count = sum(1 for kf in keyframes.values() if kf.get("origin") == "manual")

    return {
        "version": CAMERA_PATH_VERSION,
        "sourceWidth": width, "sourceHeight": height, "sourceFps": None, "totalFrames": total_frames,
        "globalReferenceFrameIndex": ref,
        "keyframes": list(keyframes.values()),
        "framePaths": frame_paths,
        "diagnostics": {
            "keyframeCount": len(keyframes),
            "relockAttemptCount": len(relock_log),
            "relockSuccessCount": len(relock_events),
            "globallyCoveredFrameCount": len(anchored_frames),
            "unavailableFrameRanges": unavailable_ranges,
            "meanConfidence": float(np.mean([entry["confidence"] for entry in frame_paths])) if frame_paths else 0.0,
            "manualKeyframeCount": manual_keyframe_count,
            "repairCount": len(manual_repairs),
            "repairedFrameRanges": repaired_ranges,
        },
    }


def _relock_candidate_order(keyframes: dict[str, dict], global_reference_frame_index: int) -> list[str]:
    """Bounded search order (Part 5): global reference first (strategy A), then
    prior ANCHORED keyframes nearest-first (strategies B/C)."""
    anchored = [kf for kf in keyframes.values() if kf["state"] == "anchored"]
    anchored.sort(key=lambda kf: kf["frameIndex"])
    ordered_ids = []
    root = next((kf["keyframeId"] for kf in anchored if kf["frameIndex"] == global_reference_frame_index), None)
    if root is not None:
        ordered_ids.append(root)
    for kf in reversed(anchored):
        if kf["keyframeId"] not in ordered_ids:
            ordered_ids.append(kf["keyframeId"])
    return ordered_ids


def _ranges(indices: list[int]) -> list[dict]:
    if not indices:
        return []
    indices = sorted(indices)
    out = []
    start = prev = indices[0]
    for value in indices[1:]:
        if value != prev + 1:
            out.append({"startFrame": start, "endFrame": prev})
            start = value
        prev = value
    out.append({"startFrame": start, "endFrame": prev})
    return out
