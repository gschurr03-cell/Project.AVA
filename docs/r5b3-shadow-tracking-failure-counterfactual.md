# R5B.3 — Shadow Tracking-Failure Escalation Counterfactual (IMG_4848)

## A. Result

**PARTIAL — Result B (candidate/continuity limitation); R5B.4 is not yet justified.**

The verified production artifact establishes that AVA should have recognized the failure at frame 61. A read-only, full-frame-every-frame replay shows that the current locator emits plausible candidates during the outage. It does not establish that the existing locked-identity acceptance path would have reacquired Vanni, because the authoritative artifact does not retain candidate identity/rejection evidence or serializable frame-60 tracker state.

## B. Vanni failure timeline

Authoritative artifact: `tmp/phaseR5/r5b1/img4848-pose-artifact.json` (163 decoded frames, 60 FPS).

| Event | Frame | Timestamp |
| --- | ---: | ---: |
| Last clearly correct pose / track | 60 | 990.0 ms |
| First pose-unreliable frame; confidence falls to 0 | 61 | 1006.7 ms |
| ROI becomes stale | 61 | 1006.7 ms |
| Retroactive `frozen_suspect` provenance begins | 70 | 1156.7 ms |
| First returned pose | 105 | 1740.0 ms |

`trackState` stays `tracking` through frames 61–104. The signal-to-pose-return gap is 44 frames / 733.3 ms (43 inter-frame intervals / 716.7 ms).

## C. Earliest reliable failure signal

At frame 61 pose is absent and `trackingConfidence` collapses from 0.857 to 0.000 after a verified track. The stale ROI then barely moves while the last reliable motion was about 0.0059 frame-widths/frame. Shadow condition: `pose missing AND trackingConfidence == 0 AND previously verified`.

## D. Counterfactual detector results

`scripts/r5b3-shadow-tracking-failure-counterfactual.py` invokes the existing heavy MediaPipe full-frame locator, its existing tile fallback, and current thresholds once per decoded frame; it writes JSON/CSV only.

The frame-55–105 replay generated a candidate on 50/51 frames (only frame 65 had none). Completeness was intermittent, but frames 91–96 produced 0.939–1.000, frame 98 produced 1.000, and frame 103 produced 0.667. Thus the detector was not uniformly blind during the loss.

The exact existing `AthleteTracker`, started independently at frame 55, accepts no candidate by frame 105 because it has no valid pre-existing lock. That is not a valid substitute for the missing frame-60 lock, so it cannot prove counterfactual acceptance.

## E. Reacquisition result

**Not proven.** No valid first reacquisition frame, latency, or continuity result can be claimed. The smallest follow-up is an env-gated shadow clone of the actual frame-60 locked state, receiving every-frame candidates from frame 61 and logging its existing rejection reason/score. The clone must not feed production tracking, ROI, pose, or final output.

## F. Gav regression

Against `tmp/phase50c-final-gav.pose.json` (142 frames), the proposed condition has **0 false escalation events**: no Gav frame has `trackingConfidence == 0`. Vanni has confidence-zero events at 0, 61, 110, and 121; only 61 follows a verified track and is relevant.

## G–H. Conclusion and recommendation

Real-time failure recognition is defective: the confidence/pose cliff does not exit `tracking`, leaving scheduled cadence in force. But cadence is not proven as the sole bottleneck. Existing detector evidence appears mid-gap, while existing acceptance from the frozen lock has not been demonstrated. Do **not** proceed to R5B.4 until the narrow shadow-clone experiment identifies whether existing continuity rules accept or block recovery.

If that clone succeeds and continues stably, R5B.4 can be the small transition `TRACKING -> TRACKING_UNRELIABLE -> REACQUIRING`, with full-frame detection every frame only during `REACQUIRING`.

## I. Files changed

- `scripts/r5b3-shadow-tracking-failure-counterfactual.py` — read-only candidate replay and JSON/CSV generator.
- `docs/r5b3-shadow-tracking-failure-counterfactual.md` — evidence report.

## J. Validation

- `python -m py_compile scripts/r5b3-shadow-tracking-failure-counterfactual.py` — passed.
- Rotation-corrected, read-only IMG_4848 replay, frames 55–105 — passed; 51 JSON/CSV rows.
- Gav/Vanni persisted-artifact signal check — Gav 0 confidence-zero frames; Vanni events 0, 61, 110, 121.

**Phase:** P0 — Athlete Tracking Reliability  
**Phase completion:** 4.06%  
**Core MVP completion:** unchanged  
**Launch readiness:** unchanged  
**Overall AVA Sprint launch completion:** unchanged
