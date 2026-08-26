"""Phase R3A Part B/U -- real source-frame contact sheets for visual
adjudication. Uses SEQUENTIAL cap.read() decoding (counting frames as
decoded, never CAP_PROP_POS_FRAMES/avg_frame_rate-based seeking) so results
do not depend on any FPS-metadata assumption -- the exact bug class this
task's instructions warn against. Read-only against the same established
source files prior phases (7.3A/9.1A) used.

  python3 scripts/phase-r3a-contact-sheets.py
"""
from pathlib import Path
import cv2
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tmp/phaseR3A/contact-sheets"
OUT.mkdir(parents=True, exist_ok=True)

JOBS = [
    # (label, source file, native fps for the label text, sorted target frame indices, columns)
    ("vanni240-frames-65-90-around-76", "vanni_fly_240.mov", 239.981,
     list(range(65, 91, 2)), 5),
    ("vanni240-frames-105-135-around-119-123", "vanni_fly_240.mov", 239.981,
     list(range(105, 136, 2)), 5),
    ("vanni240-frames-260-285-around-278", "vanni_fly_240.mov", 239.981,
     list(range(260, 286, 3)), 5),
    ("vanni60-frames-0-45-startup", "vanni_fly_60.mov", 60,
     list(range(0, 46, 2)), 6),
]

for label, filename, fps, indices, columns in JOBS:
    src = ROOT / "tmp/phase50e/sources" / filename
    cap = cv2.VideoCapture(str(src))
    cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
    wanted = set(indices)
    max_wanted = max(indices)
    thumbs_by_index = {}
    idx = 0
    while idx <= max_wanted:
        ok, bgr = cap.read()
        if not ok:
            print(f"WARNING: sequential decode ended early at index {idx} for {filename}")
            break
        if idx in wanted:
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            image = Image.fromarray(rgb)
            image.thumbnail((480, 270), Image.Resampling.LANCZOS)
            draw = ImageDraw.Draw(image)
            t_s = idx / fps
            text = f"src frame {idx} (seq-decoded) t={t_s:.4f}s"
            draw.rectangle((4, 4, 300, 28), fill=(0, 0, 0))
            draw.text((8, 8), text, fill=(255, 255, 0))
            thumbs_by_index[idx] = image
        idx += 1
    cap.release()
    thumbs = [thumbs_by_index[i] for i in indices if i in thumbs_by_index]
    if not thumbs:
        print(f"WARNING: no frames decoded for {label}")
        continue
    width = max(i.width for i in thumbs)
    height = max(i.height for i in thumbs)
    rows = (len(thumbs) + columns - 1) // columns
    sheet = Image.new("RGB", (width * columns, height * rows), (20, 20, 20))
    for i, thumb in enumerate(thumbs):
        x = (i % columns) * width
        y = (i // columns) * height
        sheet.paste(thumb, (x, y))
    out_path = OUT / f"{label}.png"
    sheet.save(out_path)
    print(f"Wrote {out_path} ({len(thumbs)} frames, sequential decode, indices {indices[0]}-{indices[-1]})")
