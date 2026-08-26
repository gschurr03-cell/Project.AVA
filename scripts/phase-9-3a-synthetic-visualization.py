"""Phase 9.3A Part T -- SYNTHETIC transform visualization, NOT a source-video
capture. Headless Chromium in this sandbox cannot decode real video pixels
for these benchmark files (Part D/R, tmp/phase93a/display-cadence.json), so
a real human-visible screen recording of the actual composed video+overlay
scene cannot be produced here (established since Phase 8.0B, disclosed
again in this phase rather than fabricated).

What this script DOES do, honestly: replays the REAL final composed
screen-space athlete-anchor trajectory (tmp/phase93a/final-transform-trace.json
-- itself computed by calling the real, unmodified production functions
`resolveDisplayCameraState`/`stabilizationCorrection`/`buildPresentationCameraPath`
against real pose/cameraPath data, sampled at the real measured display Hz)
as a moving marker on a FIXED, plain scene -- so a human reviewer can look at
the ACTUAL final-tick-to-tick motion cadence this phase measured, without any
video pixels involved. Every marker position plotted is a real number from
that real data, not fabricated or hand-drawn.

Clearly labeled SYNTHETIC in every output file's own title/filename.

  python3 scripts/phase-9-3a-synthetic-visualization.py
"""
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tmp/phase93a/plots"
OUT.mkdir(parents=True, exist_ok=True)

trace = json.loads((ROOT / "tmp/phase93a/final-transform-trace.json").read_text())
REPR_W = 1280

BENCHMARKS = ["gav", "vanni60", "vanni120", "vanni240"]
MODE_LABELS = {"raw_afOff": "RAW + Auto Follow OFF", "raw_afOn": "RAW + Auto Follow ON", "stab_afOff": "STABILIZED + Auto Follow OFF", "stab_afOn": "STABILIZED + Auto Follow ON (default)"}

# --- Figure 1: per-benchmark 2x2 grid, all 4 view modes, first 40 real display ticks ---
for label in BENCHMARKS:
    fig, axes = plt.subplots(2, 2, figsize=(11, 9))
    fig.suptitle(f"SYNTHETIC transform visualization -- {label} -- NOT a source-video capture\n(real final composed athlete-anchor position, real measured display ticks)", fontsize=10)
    for ax, (mode, mlabel) in zip(axes.flat, MODE_LABELS.items()):
        rows = trace[label][mode]
        xs = [r["x"] for r in rows]
        ys = [r["y"] for r in rows]
        ax.plot(xs, ys, "-", color="#888", linewidth=1, zorder=1)
        ax.scatter(xs, ys, c=range(len(xs)), cmap="viridis", s=28, zorder=2)
        ax.scatter([xs[0]], [ys[0]], marker="s", s=80, facecolors="none", edgecolors="red", zorder=3, label="first tick")
        ax.set_title(mlabel, fontsize=9)
        ax.set_xlabel("representative CSS px (x)")
        ax.set_ylabel("representative CSS px (y)")
        ax.invert_yaxis()
        ax.legend(fontsize=7, loc="upper right")
    plt.tight_layout(rect=[0, 0, 1, 0.94])
    out_path = OUT / f"synthetic-{label}-trajectory.png"
    plt.savefig(out_path, dpi=110)
    plt.close(fig)
    print(f"Wrote {out_path}")

# --- Figure 2: per-tick X position over time, all 4 benchmarks, stab_afOn --
# (the real production default view) -- shows the actual tick-to-tick step
# cadence directly, the clearest single visual for "is the motion evenly
# spaced or bursty."
fig, axes = plt.subplots(4, 1, figsize=(11, 10), sharex=False)
fig.suptitle("SYNTHETIC -- final composed X position per real display tick (STABILIZED + Auto Follow ON)\nEvenly-spaced dots along the curve = evenly-paced visible motion; clustered jumps = visible skip", fontsize=10)
for ax, label in zip(axes, BENCHMARKS):
    rows = trace[label]["stab_afOn"]
    ts = [r["t"] for r in rows]
    xs = [r["x"] for r in rows]
    ax.plot(ts, xs, "-o", color="#2f80ed", markersize=3, linewidth=1)
    ax.set_title(label, fontsize=9, loc="left")
    ax.set_ylabel("x (px)")
plt.xlabel("source time (s)")
plt.tight_layout(rect=[0, 0, 1, 0.93])
out_path2 = OUT / "synthetic-cross-benchmark-x-vs-time.png"
plt.savefig(out_path2, dpi=110)
plt.close(fig)
print(f"Wrote {out_path2}")

print("\nAll outputs are SYNTHETIC transform replays of real measured data -- not a source-video capture (see this file's own docstring).")
