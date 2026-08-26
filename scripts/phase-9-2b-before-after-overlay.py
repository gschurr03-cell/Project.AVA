"""Phase 9.2B Part J -- BEFORE/AFTER visual style comparison, using the exact
real, correctly-decoded (sequential-decode, Phase 9.2A's own corrected
method) source frames and stored production landmarks. Draws the OLD style
(2.25px plain line, 1px 70%-alpha dot) and the NEW style (3.5px line + dark
halo, 3px solid dot -- the exact constants now in VideoOverlay.tsx) side by
side on the identical pixels/coordinates, so any visual difference is
provably style-only. Read-only.

  python3 scripts/phase-9-2b-before-after-overlay.py
"""
import json
from pathlib import Path
import cv2
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tmp/phase92b/visual-sheets"
OUT.mkdir(parents=True, exist_ok=True)

BONES = [
    ("left_shoulder", "right_shoulder"), ("left_shoulder", "left_elbow"), ("left_elbow", "left_wrist"),
    ("right_shoulder", "right_elbow"), ("right_elbow", "right_wrist"), ("left_shoulder", "left_hip"),
    ("right_shoulder", "right_hip"), ("left_hip", "right_hip"), ("left_hip", "left_knee"),
    ("left_knee", "left_ankle"), ("left_ankle", "left_toe"), ("right_hip", "right_knee"),
    ("right_knee", "right_ankle"), ("right_ankle", "right_toe"),
]
BONE_COLOR = (245, 247, 251)  # COLORS.bone
HALO_COLOR = (6, 10, 18)  # COLORS.boneHalo (alpha applied via layered draw)
JOINT_FILL = (248, 250, 252)  # COLORS.jointFill
JOINT_STROKE = (15, 23, 42)  # COLORS.jointStroke
JOINT_FILL_SOFT = (248, 250, 252)
JOINT_STROKE_SOFT = (15, 23, 42)

# Same 9.2A frame selection (entering frame, upright sprint, front/back leg,
# touchdown, flight, arm swing, recovered 9.1B frames).
BENCHMARKS = {
    "vanni240": {"source": "vanni_fly_240.mov", "pose": ROOT / "tmp/phase80a/vanni240.pose.json",
                 "frames": [76, 100, 330, 375, 443, 540, 566, 583]},
    "vanni120": {"source": "vanni_fly_120.mov", "pose": ROOT / "tmp/phase80a/vanni120.pose.json",
                 "frames": [77, 98, 148, 178, 232, 240, 249]},
    "vanni60": {"source": "vanni_fly_60.mov", "pose": ROOT / "tmp/phase80a/vanni60.pose.json",
                "frames": [47, 62, 83, 99, 119, 122, 137]},
    "gav": {"source": "gav_stationary_reference.mov", "pose": ROOT / "tmp/phase80a/gav.pose.json",
            "frames": [19, 31, 56, 70, 93, 118]},
}
SOURCE_DIR = ROOT / "tmp/phase50e/sources"
ZOOM_PAD = 0.6
UPSCALE = 3


def draw_old_style(image, keypoints, w, h):
    img = image.copy()
    draw = ImageDraw.Draw(img, "RGBA")
    pts = {name: (kp["x"] * w, kp["y"] * h) for name, kp in keypoints.items() if kp}
    for a, b in BONES:
        if a in pts and b in pts:
            draw.line([pts[a], pts[b]], fill=BONE_COLOR + (255,), width=round(2.25 * UPSCALE / 3))
    for x, y in pts.values():
        r = 1 * UPSCALE / 3
        draw.ellipse([x - r, y - r, x + r, y + r], fill=JOINT_FILL_SOFT + (178,), outline=JOINT_STROKE_SOFT + (115,))
    return img


def draw_new_style(image, keypoints, w, h):
    img = image.copy()
    draw = ImageDraw.Draw(img, "RGBA")
    pts = {name: (kp["x"] * w, kp["y"] * h) for name, kp in keypoints.items() if kp}
    bone_w = 3.5 * UPSCALE / 3
    halo_w = bone_w + 2 * UPSCALE / 3
    for a, b in BONES:
        if a in pts and b in pts:
            draw.line([pts[a], pts[b]], fill=HALO_COLOR + (140,), width=round(halo_w))
    for a, b in BONES:
        if a in pts and b in pts:
            draw.line([pts[a], pts[b]], fill=BONE_COLOR + (255,), width=round(bone_w))
    for x, y in pts.values():
        r = 3 * UPSCALE / 3
        draw.ellipse([x - r, y - r, x + r, y + r], fill=JOINT_FILL + (255,), outline=JOINT_STROKE + (255,), width=round(1.25 * UPSCALE / 3))
    return img


def decode_frames_sequential(path, targets):
    cap = cv2.VideoCapture(str(path))
    cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
    want = set(targets)
    out = {}
    i = 0
    max_target = max(targets)
    while i <= max_target and want:
        ok, frame = cap.read()
        if not ok:
            break
        if i in want:
            out[i] = frame.copy()
            want.discard(i)
        i += 1
    cap.release()
    return out


for label, cfg in BENCHMARKS.items():
    pose_data = json.loads(cfg["pose"].read_text())
    frames_by_index = {f["sourceFrameIndex"]: f for f in pose_data["frames"]}
    decoded = decode_frames_sequential(SOURCE_DIR / cfg["source"], cfg["frames"])

    rows = []
    for idx in cfg["frames"]:
        pf = frames_by_index.get(idx)
        bgr = decoded.get(idx)
        if pf is None or bgr is None:
            continue
        h, w = bgr.shape[:2]
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        image = Image.fromarray(rgb)
        pts_all = {name: (kp["x"] * w, kp["y"] * h) for name, kp in pf["keypoints"].items() if kp}
        if not pts_all:
            continue
        xs = [p[0] for p in pts_all.values()]
        ys = [p[1] for p in pts_all.values()]
        bw, bh = max(xs) - min(xs), max(ys) - min(ys)
        cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
        half = max(bw, bh) * (1 + ZOOM_PAD) / 2
        x0, y0 = max(0, cx - half), max(0, cy - half)
        x1, y1 = min(w, cx + half), min(h, cy + half)

        before = draw_old_style(image, pf["keypoints"], w, h).crop((int(x0), int(y0), int(x1), int(y1)))
        after = draw_new_style(image, pf["keypoints"], w, h).crop((int(x0), int(y0), int(x1), int(y1)))
        before = before.resize((before.width * UPSCALE, before.height * UPSCALE), Image.Resampling.LANCZOS)
        after = after.resize((after.width * UPSCALE, after.height * UPSCALE), Image.Resampling.LANCZOS)

        pair = Image.new("RGB", (before.width + after.width + 10, max(before.height, after.height)), (20, 20, 20))
        pair.paste(before, (0, 0))
        pair.paste(after, (before.width + 10, 0))
        d = ImageDraw.Draw(pair)
        tag = f"{label} frame {idx}  |  BEFORE (left) vs AFTER (right)"
        d.rectangle((2, 2, 2 + 9 * len(tag), 18), fill=(0, 0, 0))
        d.text((4, 4), tag, fill=(255, 255, 0))
        rows.append(pair)

    if not rows:
        continue
    tw = max(r.width for r in rows)
    th_ = sum(r.height for r in rows) + 6 * len(rows)
    sheet = Image.new("RGB", (tw, th_), (20, 20, 20))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height + 6
    out_path = OUT / f"{label}-before-after.png"
    sheet.save(out_path)
    print(f"Wrote {out_path} ({len(rows)} frame pairs)")
