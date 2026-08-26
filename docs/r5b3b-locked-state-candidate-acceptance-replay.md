# R5B.3b — Locked-State Candidate Acceptance Replay (IMG_4848)

## Result

**RESULT A — EXISTING ACCEPTANCE WORKS. R5B.4 is justified.**

AVA does not lose Vanni because it cannot see him. Starting with the closest
available reconstruction of AVA's actual frame-60 lock, the unchanged
full-frame detector and existing `AthleteTracker` accept the visually
confirmed Vanni candidate on the very next frame (61). No threshold, score,
model, or production state-machine behaviour was changed.

## Frame-60 reconstructed lock

Source: `tmp/phaseR5/r5b1/img4848-pose-artifact.json`, the authoritative
persisted production artifact. The shadow state uses only persisted data:

| Field | Value |
| --- | --- |
| Frame / time | 60 / 990.0 ms |
| State / origin | `tracking` / `tracked` |
| Confidence | 0.8570 |
| Centre | (0.33910, 0.60784) |
| Box (w × h) | 0.01841 × 0.10154 |
| Last-13-frame velocity | (0.34727, 0.10648) frame-widths/s |
| Maximum observed speed in that window | 1.41427 frame-widths/s |
| ROI | x=0.15172–0.35050, y=0.42224–0.77559 |

Not reconstructible from the persisted artifact: original raw candidate
landmarks, the exact in-memory optical-flow points, and the original
`AthleteTracker` object. Those fields are not inputs to its post-lock
candidate scorer; the replay uses the persisted box/position/scale/time and
measured recent velocity that are its closest available equivalents.

## Locked-state replay, frames 61–105

The replay calls the existing heavy full-frame locator and existing tile
fallback on every frame, after applying the source's documented 180°
orientation correction. Every candidate is passed to the unmodified
`AthleteTracker.step()` scorer. Output is a JSON and CSV under `/private/tmp`
from the command below; no production output is changed.

The frame-61 candidate is Vanni by visual comparison with the source frame:
centre (0.341, 0.601), completeness 0.909, only 0.007 frame-widths from the
frame-60 lock. Existing logic accepts it with score **0.954**. This is the
first possible and actual shadow recovery: **0 frames / 0 ms after the
frame-61 escalation point**.

Frames 61–105 contain 35 accepted detections. The shadow identity remains
`tracked` throughout; it records zero identity switches and zero immediate
reacquisition/loss cycles. Some individual detector frames are rejected for
their existing valid reasons (`insufficient_landmark_completeness`,
`scale_discontinuity`, or `opposes_configured_direction`), but the accepted
neighbouring evidence keeps the track stable across the original 61–104
production failure window.

### Explicit review of R5B.3 frames 91–98

| Frame | Vanni candidate | Existing decision | Score / reason |
| ---: | --- | --- | --- |
| 91 | candidate 0, completeness 1.000 | accepted | 0.982 |
| 92 | candidate 0, completeness 1.000 | accepted | 0.991 |
| 93 | no sufficient Vanni candidate | rejected | `insufficient_landmark_completeness` |
| 94 | no sufficient Vanni candidate | rejected | `insufficient_landmark_completeness` |
| 95 | no sufficient Vanni candidate | rejected | `insufficient_landmark_completeness` |
| 96 | candidate 0, completeness 0.727 | accepted | 0.876 |
| 97 | no sufficient Vanni candidate | rejected | `insufficient_landmark_completeness` |
| 98 | candidate 0, completeness 0.606 | accepted | 0.878 |

The first accepted candidate at frame 61 prevents stale evidence from
accumulating. At frames 91–98 the accepted Vanni centres remain 0.004–0.039
frame-widths from the immediately prior accepted lock. None is rejected for
stale/frozen position.

## Failure-state consequence

Two isolated clones were compared.

| Shadow policy | Frame-61 state | First acceptance | Outcome |
| --- | --- | --- | --- |
| A: current locked state | `tracked` | 61, score 0.954 | stable through 105 |
| B: immediate unreliable state | `reacquiring` with the frame-60 state frozen | 61, score 0.954 | stable through 105 |

The initial candidate is within the existing reacquisition search radius, so
both paths immediately restore `tracked`. Therefore stale-state handling is
not an acceptance blocker when detection is escalated at the actual first
failure signal. It is still the reason production fails operationally: the
real system never makes that prompt detector call and continues optical-flow
tracking instead.

## Gav regression

The shadow trigger remains `pose missing AND trackingConfidence == 0 AND
previously verified`. The known-good Gav artifact has 0 confidence-zero
frames across 142 frames, therefore has **0 unreliable transitions, 0
reacquisition attempts, 0 candidate identity changes, and 0 tracking
regressions** under this shadow policy.

## Recommendation

Proceed to **R5B.4** with the narrow behavioural change only:

`TRACKING -> TRACKING_UNRELIABLE -> REACQUIRING`

On the existing failure signal, stop trusting flow-only continuation,
preserve the last verified identity state, and run the unchanged full-frame
detector every frame until the unchanged candidate rules accept an identity.
Then return to normal cadence. Do not change detector/model/candidate
thresholds or metric logic.

## Files changed and validation

- `scripts/r5b3-shadow-tracking-failure-counterfactual.py` — adds authoritative
  frame-lock reconstruction, current/unreliable shadow clones, per-candidate
  scorer diagnostics, and an explicit rotation override for source parity.
- `docs/r5b3b-locked-state-candidate-acceptance-replay.md` — this report.

Commands passed:

```sh
.venv/bin/python -m py_compile scripts/r5b3-shadow-tracking-failure-counterfactual.py
MPLCONFIGDIR=/tmp/ava-r5b3-mpl .venv/bin/python -u \
  scripts/r5b3-shadow-tracking-failure-counterfactual.py \
  --input tmp/phaseR5/source-videos/IMG_4848.mov \
  --lock-artifact tmp/phaseR5/r5b1/img4848-pose-artifact.json \
  --lock-frame 60 --rotation-degrees 180 --travel-direction left_to_right \
  --start-frame 61 --max-frames 122 \
  --output /private/tmp/r5b3b-locked-61-121.json \
  --csv /private/tmp/r5b3b-locked-61-121.csv
```

**Phase:** P0 — Athlete Tracking Reliability  
**Phase completion:** 4.57%  
**Core MVP completion:** unchanged  
**Launch readiness:** unchanged  
**Overall AVA Sprint launch completion:** unchanged
