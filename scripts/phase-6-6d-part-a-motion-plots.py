"""Render deterministic Phase 6.6D Part A camera trajectories."""

import argparse
import json
from pathlib import Path

import matplotlib.pyplot as plt


PARSER = argparse.ArgumentParser()
PARSER.add_argument("--part-b", action="store_true")
ARGS = PARSER.parse_args()
ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "tmp" / ("phase66d-part-b" if ARGS.part_b else "phase66d-part-a")


def series(records, accessor):
    return [accessor(record) for record in records]


for benchmark in (("gav", "vanni240", "vanni120", "vanni60") if ARGS.part_b else ("vanni240", "vanni120", "vanni60")):
    payload = json.loads((EVIDENCE / f"{benchmark}-camera-trace.json").read_text())
    records = payload["records"]
    time = series(records, lambda record: record["presentationTimestampS"])

    figure, axes = plt.subplots(4, 1, figsize=(12, 10), sharex=True)
    axes[0].plot(time, series(records, lambda r: (r.get("athleteSourceAnchor") or {}).get("x")), label="athlete anchor x", linewidth=1)
    axes[0].plot(time, series(records, lambda r: r["cameraTarget"]["x"]), label="camera target x", linewidth=1)
    axes[0].plot(time, series(records, lambda r: r["actualCamera"]["cx"]), label="actual camera x", linewidth=1.5)
    axes[0].set_ylabel("source x")
    axes[0].legend(loc="best", ncols=3)

    axes[1].plot(time, series(records, lambda r: r["jumpPx"]), label="actual transform jump")
    axes[1].plot(time, series(records, lambda r: r["panOnlyJumpPx"]), label="pan component", alpha=.8)
    axes[1].plot(time, series(records, lambda r: r["zoomOnlyJumpPx"]), label="zoom component", alpha=.8)
    axes[1].set_ylim(0, 120)
    axes[1].set_ylabel("px / display frame")
    axes[1].legend(loc="best", ncols=3)

    axes[2].plot(time, series(records, lambda r: r["cameraZoom"]), label="zoom", color="tab:purple")
    axes[2].set_ylabel("scale")
    state_names = sorted(set(series(records, lambda r: r["actualCamera"]["state"])))
    state_index = {name: index for index, name in enumerate(state_names)}
    state_axis = axes[2].twinx()
    state_axis.step(time, series(records, lambda r: state_index[r["actualCamera"]["state"]]), where="post", color="0.5", alpha=.5)
    state_axis.set_yticks(range(len(state_names)), state_names)

    axes[3].plot(time, series(records, lambda r: r["targetJumpPx"]), label="target jump", color="tab:orange")
    axes[3].plot(time, series(records, lambda r: min(r["cameraJerk"]["x"] ** 2 + r["cameraJerk"]["y"] ** 2, 1e14) ** .5), label="transform jerk", color="tab:red", alpha=.65)
    axes[3].set_yscale("symlog", linthresh=1)
    axes[3].set_ylabel("px-derived motion")
    axes[3].set_xlabel("presented media time (s)")
    axes[3].legend(loc="best", ncols=2)

    figure.suptitle(f"Phase 6.6D {'Part B' if ARGS.part_b else 'Part A'} — {benchmark} Auto Follow trajectory")
    figure.tight_layout()
    figure.savefig(EVIDENCE / f"{benchmark}-camera-trajectory.png", dpi=160)
    plt.close(figure)
