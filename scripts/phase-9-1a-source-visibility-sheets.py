"""Phase 9.1A Part M -- real source-frame contact sheets for the disputed Vanni
240 skeleton-dropout intervals, proving/disproving athlete visibility
independent of AVA's own pose pipeline. Reuses the established, working
orientation-auto pattern from scripts/phase-7-3a-contact-sheets.py. Read-only.

  python3 scripts/phase-9-1a-source-visibility-sheets.py
"""
from pathlib import Path
import cv2
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tmp/phase91a/contact-sheets"
OUT.mkdir(parents=True, exist_ok=True)

# Representative frames from each real dropout interval this phase found
# (tmp/phase91a/vanni240-dropout-intervals.json), plus one known-good frame
# immediately before/after each, for direct comparison.
SHEETS = [
    ("vanni240-interval2-render-divergent", "vanni_fly_240.mov",
     [95, 96, 110, 130, 150, 175, 200, 225, 250, 253], 5),
    ("vanni240-interval3-render-divergent", "vanni_fly_240.mov",
     [527, 530, 540, 550, 560, 567, 568], 4),
    ("vanni240-interval4-genuine-gap", "vanni_fly_240.mov",
     [667, 700, 750, 800, 850, 900, 950, 989, 990], 5),
]

for label, filename, indices, columns in SHEETS:
    cap = cv2.VideoCapture(str(ROOT / "tmp/phase50e/sources" / filename))
    cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
    thumbs = []
    for frame_index in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
        ok, bgr = cap.read()
        if not ok:
            print(f"WARNING: could not decode {filename} frame {frame_index} -- skipping")
            continue
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        image = Image.fromarray(rgb)
        image.thumbnail((480, 270), Image.Resampling.LANCZOS)
        draw = ImageDraw.Draw(image)
        text = f"source frame {frame_index}"
        draw.rectangle((4, 4, 230, 28), fill=(0, 0, 0))
        draw.text((8, 8), text, fill=(255, 255, 0))
        thumbs.append(image)
    cap.release()
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
    print(f"Wrote {out_path} ({len(thumbs)} frames)")
