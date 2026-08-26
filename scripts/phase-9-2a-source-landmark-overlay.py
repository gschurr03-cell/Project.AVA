"""Phase 9.2A Part D -- the single most decisive spatial-fidelity test: draw
the STORED pose landmarks (exactly as persisted in the production artifact,
no browser/presentation transform applied) directly onto correctly-oriented
ORIGINAL SOURCE PIXELS. If the stored source-space landmarks are already
visibly off the athlete here, browser rendering cannot be the cause -- the
error is upstream (crop remap, rotation, or pose inference itself). If they
are correct here, the error (if any) is downstream, in presentation.

Reuses the established, working cv2.CAP_PROP_ORIENTATION_AUTO pattern from
Phase 7.3A/9.1A. Read-only.

  python3 scripts/phase-9-2a-source-landmark-overlay.py
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
    "vanni240": {
        "source": "vanni_fly_240.mov",
        "pose": ROOT / "tmp/phase80a/vanni240.pose.json",
        # normal trusted frames (spread across the run) + Phase 9.1B recovered frames.
        "frames": [10, 76, 100, 108, 200, 330, 375, 443, 475, 540, 550, 566, 583, 632],
        "recovered": {96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 109, 110, 111, 112, 114, 115, 116, 117, 119, 121, 123, 124, 125, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 140, 141, 538, 539, 540, 541, 542, 543, 544, 545, 546, 547, 548, 549, 550, 551, 552, 553, 554, 555, 556, 557, 558, 559, 560, 561, 562, 563, 566},
    },
    "vanni120": {
        "source": "vanni_fly_120.mov",
        "pose": ROOT / "tmp/phase80a/vanni120.pose.json",
        "frames": [27, 51, 77, 98, 126, 148, 178, 197, 227, 232, 240, 249, 283, 304],
        "recovered": {232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246},
    },
    "vanni60": {
        "source": "vanni_fly_60.mov",
        "pose": ROOT / "tmp/phase80a/vanni60.pose.json",
        "frames": [37, 47, 62, 73, 83, 99, 109, 119, 122, 128, 137, 152],
        "recovered": {119, 120, 121, 122, 123, 124, 125},
    },
    "gav": {
        "source": "gav_stationary_reference.mov",
        "pose": ROOT / "tmp/phase80a/gav.pose.json",
        "frames": [10, 19, 31, 44, 56, 70, 83, 93, 106, 118, 131, 139],
        "recovered": set(),
    },
}

SOURCE_DIR = ROOT / "tmp/phase50e/sources"


def draw_overlay(image, keypoints, w, h):
    img = image.copy()
    draw = ImageDraw.Draw(img)
    pts = {}
    for name, kp in keypoints.items():
        if kp is None:
            continue
        x, y = kp["x"] * w, kp["y"] * h
        pts[name] = (x, y)
    for a, b in BONES:
        if a in pts and b in pts:
            draw.line([pts[a], pts[b]], fill=(255, 255, 255), width=2)
    for name, (x, y) in pts.items():
        color = JOINT_COLORS.get(name, (255, 0, 0))
        r = 4
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color, outline=(0, 0, 0))
    return img


for label, cfg in BENCHMARKS.items():
    pose_data = json.loads(cfg["pose"].read_text())
    frames_by_index = {f["sourceFrameIndex"]: f for f in pose_data["frames"]}
    source_path = SOURCE_DIR / cfg["source"]
    cap = cv2.VideoCapture(str(source_path))
    cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)

    thumbs = []
    manifest = []
    for idx in cfg["frames"]:
        pf = frames_by_index.get(idx)
        if pf is None:
            print(f"WARNING: {label} frame {idx} not in pose artifact -- skipping")
            continue
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, bgr = cap.read()
        if not ok:
            print(f"WARNING: could not decode {label} frame {idx} -- skipping")
            continue
        h, w = bgr.shape[:2]
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        image = Image.fromarray(rgb)
        overlay_img = draw_overlay(image, pf["keypoints"], w, h)
        is_recovered = idx in cfg["recovered"]
        thumb = overlay_img.copy()
        thumb.thumbnail((480, 270), Image.Resampling.LANCZOS)
        draw = ImageDraw.Draw(thumb)
        tag = f"frame {idx}" + (" [RECOVERED 9.1B]" if is_recovered else "")
        draw.rectangle((4, 4, 4 + 9 * len(tag), 24), fill=(0, 0, 0))
        draw.text((8, 8), tag, fill=(0, 255, 0) if is_recovered else (255, 255, 0))
        thumbs.append(thumb)
        manifest.append({
            "sourceFrameIndex": idx, "recovered": is_recovered,
            "boxOrigin": pf.get("boxOrigin"), "trackState": pf.get("trackState"),
            "independentLocalizationState": pf.get("independentLocalizationState"),
            "landmarkCount": sum(1 for v in pf["keypoints"].values() if v),
            "sourceWidth": w, "sourceHeight": h,
        })
    cap.release()
    if not thumbs:
        continue
    columns = 5
    tw, th_ = max(t.width for t in thumbs), max(t.height for t in thumbs)
    rows = (len(thumbs) + columns - 1) // columns
    sheet = Image.new("RGB", (tw * columns, th_ * rows), (20, 20, 20))
    for i, t in enumerate(thumbs):
        sheet.paste(t, ((i % columns) * tw, (i // columns) * th_))
    out_path = OUT / f"{label}-landmark-overlay.png"
    sheet.save(out_path)
    (ROOT / f"tmp/phase92a/{label}-overlay-manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"Wrote {out_path} ({len(thumbs)} frames)")
