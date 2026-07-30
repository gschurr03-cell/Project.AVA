"""Phase 2 — Manual World-Lock Repair: worker-side mirror of
`src/lib/video/worldLockRepair.ts`.

This module intentionally duplicates the browser's linear-least-squares
partial-affine fit ARITHMETIC EXACTLY (same normal-equation construction, same
4x4 Gaussian-elimination solve) rather than sharing code across languages, so
the worker's authoritative rebuild-on-rerun agrees with the browser's live
preview to floating-point precision. `scripts/world-lock-repair-sanity.mjs`
cross-checks both implementations against the same synthetic input.

No numpy dependency: this file is deliberately pure-Python arithmetic so it
can be unit-tested without cv2/numpy being importable, and because a 4x4
solve gains nothing from numpy at this scale.
"""
from __future__ import annotations

import math
from typing import Optional

REPAIR_TRANSFORM_MODEL = "partial_affine"

REPAIR_MIN_PAIRS = 2
REPAIR_PREFERRED_PAIRS = 3
REPAIR_MAX_MEAN_ERROR_PX = 4
REPAIR_MAX_MAX_ERROR_PX = 8
REPAIR_MIN_SCALE = 0.5
REPAIR_MAX_SCALE = 2.0
REPAIR_MAX_ROTATION_DEG = 25
REPAIR_MIN_POINT_SEPARATION = 0.01
REPAIR_MIN_SPREAD_AREA = 0.0015


def _solve4x4(matrix, vector) -> Optional[list]:
    m = [row[:] for row in matrix]
    v = vector[:]
    n = 4
    for col in range(n):
        pivot_row, pivot_value = col, abs(m[col][col])
        for row in range(col + 1, n):
            if abs(m[row][col]) > pivot_value:
                pivot_value, pivot_row = abs(m[row][col]), row
        if pivot_value < 1e-12:
            return None
        if pivot_row != col:
            m[col], m[pivot_row] = m[pivot_row], m[col]
            v[col], v[pivot_row] = v[pivot_row], v[col]
        for row in range(col + 1, n):
            factor = m[row][col] / m[col][col]
            for k in range(col, n):
                m[row][k] -= factor * m[col][k]
            v[row] -= factor * v[col]
    x = [0.0] * n
    for row in range(n - 1, -1, -1):
        total = v[row]
        for k in range(row + 1, n):
            total -= m[row][k] * x[k]
        x[row] = total / m[row][row]
    return x


def fit_partial_affine(pairs) -> Optional[dict]:
    """`pairs`: list of {"target": {"x","y"}, "reference": {"x","y"}} in PIXEL
    space. Returns {"a","b","tx","ty"} mapping target pixel -> reference pixel,
    or None iff the normal-equations matrix is singular."""
    if len(pairs) < 2:
        return None
    s = sx = sy = sxr = syr = srx = sry = 0.0
    n = len(pairs)
    for pair in pairs:
        t, r = pair["target"], pair["reference"]
        s += t["x"] * t["x"] + t["y"] * t["y"]
        sx += t["x"]
        sy += t["y"]
        sxr += t["x"] * r["x"] + t["y"] * r["y"]
        syr += -t["y"] * r["x"] + t["x"] * r["y"]
        srx += r["x"]
        sry += r["y"]
    matrix = [
        [s, 0, sx, sy],
        [0, s, -sy, sx],
        [sx, -sy, n, 0],
        [sy, sx, 0, n],
    ]
    vector = [sxr, syr, srx, sry]
    solved = _solve4x4(matrix, vector)
    if solved is None:
        return None
    a, b, tx, ty = solved
    return {"a": a, "b": b, "tx": tx, "ty": ty}


def affine_to_decomposed_similarity(fit: dict) -> dict:
    scale = math.hypot(fit["a"], fit["b"])
    rotation_deg = math.degrees(math.atan2(fit["b"], fit["a"]))
    return {"rotationDeg": rotation_deg, "scale": max(1e-6, scale),
            "translationX": fit["tx"], "translationY": fit["ty"]}


def apply_fitted_affine(fit: dict, point: dict) -> dict:
    return {
        "x": fit["a"] * point["x"] - fit["b"] * point["y"] + fit["tx"],
        "y": fit["b"] * point["x"] + fit["a"] * point["y"] + fit["ty"],
    }


def compose_fitted_affine(later: dict, earlier: dict) -> dict:
    """Mirrors composeFittedAffine in worldLockRepair.ts exactly (complex-
    multiplication closed form): apply `earlier` first, then `later`."""
    return {
        "a": earlier["a"] * later["a"] - earlier["b"] * later["b"],
        "b": earlier["a"] * later["b"] + earlier["b"] * later["a"],
        "tx": later["a"] * earlier["tx"] - later["b"] * earlier["ty"] + later["tx"],
        "ty": later["b"] * earlier["tx"] + later["a"] * earlier["ty"] + later["ty"],
    }


def invert_fitted_affine(fit: dict) -> Optional[dict]:
    det = fit["a"] * fit["a"] + fit["b"] * fit["b"]
    if det < 1e-12:
        return None
    ia, ib = fit["a"] / det, -fit["b"] / det
    itx = -(ia * fit["tx"] - ib * fit["ty"])
    ity = -(ib * fit["tx"] + ia * fit["ty"])
    return {"a": ia, "b": ib, "tx": itx, "ty": ity}


def _point_distance(a, b) -> float:
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"])


def _spread_area(points) -> float:
    if len(points) < 3:
        return 0.0
    area = 0.0
    n = len(points)
    for i in range(n):
        p, q = points[i], points[(i + 1) % n]
        area += p["x"] * q["y"] - q["x"] * p["y"]
    return abs(area) / 2.0


def _has_duplicate_points(points) -> bool:
    for i in range(len(points)):
        for j in range(i + 1, len(points)):
            if _point_distance(points[i], points[j]) < REPAIR_MIN_POINT_SEPARATION:
                return True
    return False


def validate_repair_candidate(pairs, source_width: float, source_height: float) -> dict:
    """`pairs`: list of {"id","targetPoint":{"x","y" normalized},"referencePoint":{...}}.
    Mirrors validateRepairCandidate in worldLockRepair.ts exactly."""
    reasons = []
    pair_count = len(pairs)
    if pair_count < REPAIR_MIN_PAIRS:
        reasons.append("insufficient_pairs")

    target_points = [p["targetPoint"] for p in pairs]
    reference_points = [p["referencePoint"] for p in pairs]
    if _has_duplicate_points(target_points) or _has_duplicate_points(reference_points):
        reasons.append("duplicate_points")
    target_area = _spread_area(target_points)
    if pair_count >= 3 and target_area < REPAIR_MIN_SPREAD_AREA:
        reasons.append("collinear_points")

    if pair_count < REPAIR_MIN_PAIRS or "duplicate_points" in reasons:
        return {"pairCount": pair_count, "meanErrorPx": float("inf"), "maxErrorPx": float("inf"),
                "scale": 0, "rotationDeg": 0, "translationX": 0, "translationY": 0,
                "spatialSpreadArea": target_area, "invertible": False,
                "accepted": False, "rejectionReasons": reasons}

    pixel_pairs = [{
        "target": {"x": p["targetPoint"]["x"] * source_width, "y": p["targetPoint"]["y"] * source_height},
        "reference": {"x": p["referencePoint"]["x"] * source_width, "y": p["referencePoint"]["y"] * source_height},
    } for p in pairs]
    fit = fit_partial_affine(pixel_pairs)
    if fit is None:
        reasons.append("non_invertible")
        return {"pairCount": pair_count, "meanErrorPx": float("inf"), "maxErrorPx": float("inf"),
                "scale": 0, "rotationDeg": 0, "translationX": 0, "translationY": 0,
                "spatialSpreadArea": target_area, "invertible": False,
                "accepted": False, "rejectionReasons": reasons}
    inverse = invert_fitted_affine(fit)
    if inverse is None:
        reasons.append("non_invertible")

    errors = [_point_distance(apply_fitted_affine(fit, pp["target"]), pp["reference"]) for pp in pixel_pairs]
    mean_error_px = sum(errors) / len(errors)
    max_error_px = max(errors)
    if mean_error_px > REPAIR_MAX_MEAN_ERROR_PX:
        reasons.append("excessive_mean_error")
    if max_error_px > REPAIR_MAX_MAX_ERROR_PX:
        reasons.append("excessive_max_error")

    decomposed = affine_to_decomposed_similarity(fit)
    if decomposed["scale"] < REPAIR_MIN_SCALE or decomposed["scale"] > REPAIR_MAX_SCALE:
        reasons.append("implausible_scale")
    normalized_rotation = abs(((decomposed["rotationDeg"] + 180) % 360) - 180)
    if normalized_rotation > REPAIR_MAX_ROTATION_DEG:
        reasons.append("implausible_rotation")

    return {
        "pairCount": pair_count, "meanErrorPx": mean_error_px, "maxErrorPx": max_error_px,
        "scale": decomposed["scale"], "rotationDeg": decomposed["rotationDeg"],
        "translationX": decomposed["translationX"] / source_width,
        "translationY": decomposed["translationY"] / source_height,
        "spatialSpreadArea": target_area, "invertible": inverse is not None,
        "accepted": len(reasons) == 0, "rejectionReasons": reasons,
    }
