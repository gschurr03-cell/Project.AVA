"""Phase 9.2A Part D (zoomed, CORRECTED) -- same real source-pixel + stored-
landmark overlay as before, but using SEQUENTIAL frame decoding (count frames
as read, in order, from the start) rather than cv2.CAP_PROP_POS_FRAMES
seeking. This phase's own first attempt at this script used POS_FRAMES
seeking and produced a materially WRONG visual (skeleton appearing detached
from the athlete on Vanni 240 mid-clip frames) -- proven, by direct
timestamp cross-check against the pose artifact's own real per-frame
`tMs`, to be an artifact of POS_FRAMES seeking using the container's
unreliable `avg_frame_rate` tag on this VFR file (the EXACT metadata
unreliability Phase 1 already documented -- 223.926 tagged vs 239.981 real
fps for Vanni 240). Sequential decoding matches the artifact's own
timestamps exactly (verified: 317.1/1377.9/1565.8/1849.6ms, all exact
matches) and is used throughout this corrected version. Read-only.

  python3 scripts/phase-9-2a-zoomed-overlay.py
"""
import json
from pathlib import Path
import cv2
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tmp/phase92a/visual-sheets"
OUT.mkdir(parents=True, exist_ok=True)

BONES = [
    ("left_shoulder", "right_shoulder"), ("left_shoulder", "left_elbow"), ("left_elbow", "left_wrist"),
    ("right_shoulder", "right_elbow"), ("right_elbow", "right_wrist"), ("left_shoulder", "left_hip"),
    ("right_shoulder", "right_hip"), ("left_hip", "right_hip"), ("left_hip", "left_knee"),
    ("left_knee", "left_ankle"), ("left_ankle", "left_toe"), ("right_hip", "right_knee"),
    ("right_knee", "right_ankle"), ("right_ankle", "right_toe"),
]
JOINT_COLORS = {
    "nose": (255, 255, 0),
    "left_shoulder": (0, 200, 255), "right_shoulder": (255, 100, 0),
    "left_elbow": (0, 200, 255), "right_elbow": (255, 100, 0),
    "left_wrist": (0, 200, 255), "right_wrist": (255, 100, 0),
    "left_hip": (0, 200, 255), "right_hip": (255, 100, 0),
    "left_knee": (0, 200, 255), "right_knee": (255, 100, 0),
    "left_ankle": (0, 200, 255), "right_ankle": (255, 100, 0),
    "left_heel": (0, 255, 100), "right_heel": (255, 0, 255),
    "left_toe": (0, 255, 100), "right_toe": (255, 0, 255),
}

BENCHMARKS = {
    "vanni240": {"source": "vanni_fly_240.mov", "pose": ROOT / "tmp/phase80a/vanni240.pose.json",
                 "frames": [76, 100, 108, 330, 375, 443, 540, 566, 583]},
    "vanni120": {"source": "vanni_fly_120.mov", "pose": ROOT / "tmp/phase80a/vanni120.pose.json",
                 "frames": [77, 98, 126, 148, 178, 197, 232, 240, 249]},
    "vanni60": {"source": "vanni_fly_60.mov", "pose": ROOT / "tmp/phase80a/vanni60.pose.json",
                "frames": [47, 62, 73, 83, 99, 109, 119, 122, 137]},
    "gav": {"source": "gav_stationary_reference.mov", "pose": ROOT / "tmp/phase80a/gav.pose.json",
            "frames": [19, 31, 44, 56, 70, 83, 93, 106, 118]},
}
SOURCE_DIR = ROOT / "tmp/phase50e/sources"
ZOOM_PAD = 0.6
UPSCALE = 3


def draw_overlay(image, keypoints, w, h):
    img = image.copy()
    draw = ImageDraw.Draw(img)
    pts = {}
    for name, kp in keypoints.items():
        if kp is None:
            continue
        pts[name] = (kp["x"] * w, kp["y"] * h)
    for a, b in BONES:
        if a in pts and b in pts:
            draw.line([pts[a], pts[b]], fill=(255, 255, 255), width=1)
    for name, (x, y) in pts.items():
        color = JOINT_COLORS.get(name, (255, 0, 0))
        r = 3
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color, outline=(0, 0, 0))
    return img, pts


def decode_frames_sequential(path, targets):
    """Read every frame in order, returning a dict {index: bgr} for exactly
    the requested target indices -- accurate for VFR sources where
    CAP_PROP_POS_FRAMES seeking (container avg_frame_rate-based) disagrees
    with the artifact's own real per-frame timestamps."""
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

    thumbs = []
    for idx in cfg["frames"]:
        pf = frames_by_index.get(idx)
        bgr = decoded.get(idx)
        if pf is None or bgr is None:
            print(f"WARNING: {label} frame {idx} unavailable -- skipping")
            continue
        h, w = bgr.shape[:2]
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        image = Image.fromarray(rgb)
        overlay_img, pts = draw_overlay(image, pf["keypoints"], w, h)
        if not pts:
            continue
        xs = [p[0] for p in pts.values()]
        ys = [p[1] for p in pts.values()]
        bw, bh = max(xs) - min(xs), max(ys) - min(ys)
        cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
        half = max(bw, bh) * (1 + ZOOM_PAD) / 2
        x0, y0 = max(0, cx - half), max(0, cy - half)
        x1, y1 = min(w, cx + half), min(h, cy + half)
        crop = overlay_img.crop((int(x0), int(y0), int(x1), int(y1)))
        crop = crop.resize((crop.width * UPSCALE, crop.height * UPSCALE), Image.Resampling.LANCZOS)
        draw = ImageDraw.Draw(crop)
        tag = f"{label} frame {idx}"
        draw.rectangle((2, 2, 2 + 9 * len(tag), 18), fill=(0, 0, 0))
        draw.text((4, 4), tag, fill=(255, 255, 0))
        thumbs.append(crop)
    if not thumbs:
        continue
    columns = 3
    tw, th_ = max(t.width for t in thumbs), max(t.height for t in thumbs)
    rows = (len(thumbs) + columns - 1) // columns
    sheet = Image.new("RGB", (tw * columns, th_ * rows), (20, 20, 20))
    for i, t in enumerate(thumbs):
        sheet.paste(t, ((i % columns) * tw, (i // columns) * th_))
    out_path = OUT / f"{label}-zoomed-overlay.png"
    sheet.save(out_path)
    print(f"Wrote {out_path} ({len(thumbs)} frames)")
