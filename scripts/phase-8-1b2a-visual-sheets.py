#!/usr/bin/env python3
"""Phase 8.1B-2A -- visual evidence sheets for Vanni 240 / Vanni 60, same
convention as scripts/phase-8-1b1-visual-sheets.py. Read-only, standalone.

    .venv/bin/python scripts/phase-8-1b2a-visual-sheets.py <vanni240|vanni60>
"""
import json
import math
import sys
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tmp/phase81b2a/sheets"
OUT.mkdir(parents=True, exist_ok=True)

VIDEOS = {
    "vanni240": ROOT / "tmp/phase50e/sources/vanni_fly_240.mov",
    "vanni60": ROOT / "tmp/phase50e/sources/vanni_fly_60.mov",
}
REPRESENTATIVE = {
    "vanni240": {"A_early": 700, "B_mid": 957, "C_peak": 1007, "D_late": 1019},
    "vanni60": {"A_early": 180, "B_mid": 210, "C_peak": 232},
}


def apply_similarity(x, y, tx, ty, rot_deg, scale):
    theta = math.radians(rot_deg)
    cos, sin = math.cos(theta) * scale, math.sin(theta) * scale
    return cos * x - sin * y + tx, sin * x + cos * y + ty


def main():
    label = sys.argv[1]
    data = json.loads((ROOT / f"tmp/phase81b2a/{label}-adjudication.json").read_text())
    comparison_by_frame = {row["frameIndex"]: row for row in data["comparison"]}
    manual = data["manualAnchorTracks"]

    video = VIDEOS[label]
    reps = REPRESENTATIVE[label]
    target_indices = set(reps.values())
    cap = cv2.VideoCapture(str(video))
    idx = 0
    frames = {}
    while idx <= max(target_indices):
        ok, frame = cap.read()
        if not ok:
            break
        if idx in target_indices:
            frames[idx] = cv2.rotate(frame, cv2.ROTATE_180)
        idx += 1
    cap.release()

    for rep_label, frame_idx in reps.items():
        img = frames[frame_idx].copy()
        row = comparison_by_frame.get(frame_idx)
        ava = row["avaCumulative"] if row else None
        sf = row["sparseFlowCumulative"] if row else None

        for name, track in manual.items():
            ref_x, ref_y = track["referenceXY"]
            actual = next((r for r in track["trajectory"] if r["frameIndex"] == frame_idx), None)
            if actual is None or actual["x"] is None:
                continue
            ax, ay = actual["x"], actual["y"]
            cv2.rectangle(img, (ax - 22, ay - 22), (ax + 22, ay + 22), (0, 255, 0), 2)
            cv2.putText(img, name, (ax - 22, ay - 28), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1, cv2.LINE_AA)
            if ava:
                px, py = apply_similarity(ref_x, ref_y, ava["x"], ava["y"], ava["rot"], 1.0)
                cv2.circle(img, (int(px), int(py)), 6, (0, 0, 255), 2)
                cv2.line(img, (ax, ay), (int(px), int(py)), (0, 0, 255), 1)
            if sf:
                qx, qy = apply_similarity(ref_x, ref_y, sf["x"], sf["y"], sf["rot"], 1.0)
                cv2.circle(img, (int(qx), int(qy)), 6, (255, 128, 0), 2)
                cv2.line(img, (ax, ay), (int(qx), int(qy)), (255, 128, 0), 1)

        legend = [
            f"{label} frame {frame_idx}  ({rep_label})",
            "GREEN box = actual tracked manual-anchor position",
            "RED circle = AVA-predicted position (cameraPath)",
            "ORANGE circle = independent sparse-flow-predicted position",
            f"AVA cumulative: {ava}" if ava else "AVA: n/a",
        ]
        for i, text in enumerate(legend):
            cv2.putText(img, text, (20, 30 + i * 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 3, cv2.LINE_AA)
            cv2.putText(img, text, (20, 30 + i * 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)

        out_path = OUT / f"{label}_{rep_label}_frame{frame_idx}.png"
        cv2.imwrite(str(out_path), img)
        print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
