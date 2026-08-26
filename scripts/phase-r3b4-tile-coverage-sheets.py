#!/usr/bin/env python3
"""Phase R3B-4 Part C -- visual tile-coverage sheets for 3 representative
Vanni60 critical frames (a clean tile-search success, the frame-20 ranking
miss, and a frame-0/21/30-style primary-pass-suppression case), drawn
directly on the real, correctly-oriented source frame using the real tile
geometry/results already captured in tmp/phaseR3B4/candidate-traces/vanni60.json.

    python3 scripts/phase-r3b4-tile-coverage-sheets.py
"""
import sys, os, json
import cv2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME_DIR = os.path.join(ROOT, "src/lib/biomechanics/mediapipe/runtime")
OUT = os.path.join(ROOT, "tmp/phaseR3B4/tile-layouts")
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, RUNTIME_DIR)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ensure_ffprobe_on_path  # noqa: E402,F401 -- Phase R3C fix: must precede real ffprobe-dependent calls (see that module's own docstring for the exact bug this prevents)
import mediapipe_pose_runner as mpr  # noqa: E402

SRC = os.path.join(ROOT, "tmp/phase50e/sources/vanni_fly_60.mov")
TRACE = json.load(open(os.path.join(ROOT, "tmp/phaseR3B4/candidate-traces/vanni60.json")))

TARGETS = {6: "tile_search_success", 20: "candidate_ranking_miss", 21: "primary_pass_suppression"}


def draw_sheet(frame_bgr, record, label):
    img = frame_bgr.copy()
    width, height = record["width"], record["height"]
    hint_x = record["hintXBeforeThisFrame"]
    if hint_x is not None:
        cv2.line(img, (int(hint_x), 0), (int(hint_x), height), (255, 0, 255), 2)
        cv2.putText(img, "hint_x", (int(hint_x) + 6, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 0, 255), 2)

    sweep = record.get("tileSweepDiagnostic")
    if sweep:
        for t in sweep:
            tx, tw = t["tileX"], t["tileWidth"]
            detected = t.get("detected")
            color = (0, 200, 0) if detected else (0, 0, 200)
            cv2.rectangle(img, (tx, 0), (tx + tw, height), color, 3)
            if detected:
                conf = t.get("meanVisibilityConfidence", 0.0)
                cv2.putText(img, f"{conf:.2f}", (tx + 10, 90), cv2.FONT_HERSHEY_SIMPLEX, 1.1, color, 3)

    tf = record["tileFallback"]
    if tf["invoked"] and tf.get("resultBox"):
        bx, by, bw, bh = tf["resultBox"]
        x0, y0 = int(bx - bw / 2), int(by - bh / 2)
        cv2.rectangle(img, (x0, y0), (int(bx + bw / 2), int(by + bh / 2)), (0, 255, 255), 4)
        cv2.putText(img, "SELECTED (tile fallback)", (x0, max(20, y0 - 15)), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 255), 3)

    if record["primaryPassCandidates"]:
        for c in record["primaryPassCandidates"]:
            if c is None:
                continue
            cx, cy, w, h = c["cx"] * width, c["cy"] * height, c["w"] * width, c["h"] * height
            x0, y0 = int(cx - w / 2), int(cy - h / 2)
            color = (0, 165, 255)
            cv2.rectangle(img, (x0, y0), (int(cx + w / 2), int(cy + h / 2)), color, 4)
            cv2.putText(img, f"PRIMARY-PASS candidate (completeness {c['completeness']:.2f})", (x0, max(20, y0 - 15)), cv2.FONT_HERSHEY_SIMPLEX, 1.0, color, 3)

    cv2.putText(img, f"frame {record['sourceFrameIndex']} t={record['tMs']}ms -- {label}", (20, height - 40), cv2.FONT_HERSHEY_SIMPLEX, 1.3, (255, 255, 255), 3)
    return img


if __name__ == "__main__":
    rot_deg = mpr.probe_rotation_degrees(SRC)
    rot_code = mpr.rotation_code_for_angle(rot_deg, cv2)
    cap = cv2.VideoCapture(SRC)
    idx = 0
    by_frame = {r["sourceFrameIndex"]: r for r in TRACE}
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx in TARGETS:
            frame = mpr.apply_rotation(frame, rot_code, cv2)
            record = by_frame.get(idx)
            if record:
                sheet = draw_sheet(frame, record, TARGETS[idx])
                out_path = os.path.join(OUT, f"vanni60_frame{idx:03d}_{TARGETS[idx]}.jpg")
                cv2.imwrite(out_path, sheet)
                print(f"wrote {out_path}")
        idx += 1
        if idx > max(TARGETS) + 1:
            break
    cap.release()
