"""Extract deterministic, labelled source-pixel contact sheets for Phase 7.3A."""
from pathlib import Path
import cv2
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tmp/phase73a/contact-sheets"
OUT.mkdir(parents=True, exist_ok=True)
SHEETS = [
    ("vanni240-gap01", "vanni_fly_240.mov", range(0, 131, 10), 7),
    ("vanni240-gap02", "vanni_fly_240.mov", range(110, 286, 10), 6),
    ("vanni240-gap03", "vanni_fly_240.mov", range(365, 486, 8), 4),
    ("vanni240-gap03-candidates", "vanni_fly_240.mov", [397, 410, 418, 423, 443, 453, 464], 4),
    ("vanni120-gap01", "vanni_fly_120.mov", range(140, 206, 4), 6),
    ("vanni120-gap02", "vanni_fly_120.mov", range(190, 256, 4), 6),
]

for label, filename, indices, columns in SHEETS:
    cap = cv2.VideoCapture(str(ROOT / "tmp/phase50e/sources" / filename))
    fps = cap.get(cv2.CAP_PROP_FPS)
    # Honour the MOV display matrix; raw decoded pixels in these clips are 180°.
    cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
    thumbs = []
    for frame_index in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
        ok, bgr = cap.read()
        if not ok:
            raise RuntimeError(f"Could not decode {filename} frame {frame_index}")
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        image = Image.fromarray(rgb)
        image.thumbnail((480, 270), Image.Resampling.LANCZOS)
        draw = ImageDraw.Draw(image)
        text = f"source frame {frame_index}"
        draw.rectangle((4, 4, 230, 28), fill=(0, 0, 0))
        draw.text((8, 8), text, fill=(255, 255, 0))
        thumbs.append(image)
    cap.release()
    width = max(i.width for i in thumbs)
    height = max(i.height for i in thumbs)
    rows = (len(thumbs) + columns - 1) // columns
    sheet = Image.new("RGB", (width * columns, height * rows), "black")
    for i, image in enumerate(thumbs):
        sheet.paste(image, ((i % columns) * width, (i // columns) * height))
    sheet.save(OUT / f"{label}.jpg", quality=94)
    print(f"{label}: {len(thumbs)} source frames at {fps:.6f} fps")
