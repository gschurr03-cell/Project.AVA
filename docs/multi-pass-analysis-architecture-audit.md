# Multi-Pass Analysis / Measurement Reliability Audit

## A. Current architecture

AVA already uses purposeful staged analysis rather than five identical runs:

1. **Decode / source normalization** — `mediapipe_pose_runner.py` probes FPS,
   corrects rotation, decodes source frames, and emits source timestamps.
2. **Athlete discovery and track** — ROI mode runs the full-frame locator only
   when `AthleteBoxTracker.wants_detector_frame()` requests it. Candidates are
   constructed by `athlete_tracker.py`; the identity tracker and box tracker
   retain the selected identity, box, velocity, verification provenance, and
   R5B.4 reacquisition state.
3. **Pose refinement** — the same runner plans a crop from that trajectory,
   runs pose per crop, maps landmarks back to source coordinates, and records
   crop/box provenance. It then performs bounded pose-localization feedback,
   short-interval adjudication, and contact-critical foot recovery.
4. **Contacts and steps** — the worker converts the canonical `PoseSequence`
   into overlay/acceleration frames and runs the existing temporal foot-contact
   and step logic. `stepIntegrity.ts` rejects missing-intermediate-contact
   intervals instead of inventing a step.
5. **Metrics and validation** — calibration-aware acceleration/fly metrics,
   zone timing, step/interval reconciliation, mechanics, and result-contract
   validation run in `analysis-worker.mjs` after the pose sequence exists.
6. **Presentation** — `presentationCamera.ts` derives a display-only camera
   path from verified pose envelopes; it does not mutate the pose sequence or
   measurement trajectory.

## B. Gap analysis

| Requested pass | Existing implementation | Gap |
| --- | --- | --- |
| Discovery | Candidate + identity state machine | Already present; initial lock is retained in tracker state. |
| Full track | `AthleteBoxTracker` records box/provenance per frame | Already present; R5B.4 adds failure-aware reacquisition. |
| Pose refinement | ROI crop, pose feedback, foot-critical retry | Already present and trajectory-attached. |
| Contact refinement | Temporal step/contact logic plus integrity guard | Missing-contact **recovery** is intentionally not implemented: current system withholds uncertain evidence rather than fabricating contacts. |
| Metrics/reconciliation | Worker-side calibrated analysis and integrity checks | Already present; confidence/result gating is distributed across metric availability reasons rather than one top-level status. |

## C–F. Implementation decision

No tracker, detector, pose, contact, metric, or presentation code is changed
by this audit. The smallest safe architecture action is to preserve the
existing pass boundaries and make them explicit in operational documentation,
not introduce a second pipeline or duplicate expensive inference.

The persisted `PoseSequence` is the reusable handoff artifact: its per-frame
box origin/state, identity confidence, crop provenance, landmark state,
tracking debug, source timestamps, and camera evidence already let every
downstream consumer reuse the trajectory without rediscovering the athlete.

## G–H. Ground contacts and missing-contact recovery

Current contact detection is temporal: it smooths foot trajectories, selects
local contact peaks, and measures stance/flight from neighbouring frames.
`stepIntegrity.ts` detects same-foot adjacency and implausibly long gaps,
marks them unavailable, and prevents merged intervals from becoming precise
step-length metrics. This is the correct current safeguard against fabricated
contacts. A future recovery pass must use local foot evidence and emit an
explicit uncertain/recovered provenance; it should not be added without a
real missing-contact regression and ground truth.

## I–J. Metrics and confidence gate

Metrics already fail closed through tracking provenance, calibration checks,
contact integrity, timing availability reasons, and steps status. The smallest
future consolidation is a result-level derived status (`high_confidence`,
`review`, `failed`) built from those existing reasons. It is intentionally not
implemented here because no consumer contract/UI change was authorized.

## K. Auto Follow

Measurement and presentation are already separated. Measurement uses source
coordinate landmarks/trajectory. `presentationCamera.ts` consumes verified
pose torso/envelope observations and applies display-only deadbands, bounded
velocity/acceleration, anticipation, hold/reacquiring states, and independent
zoom smoothing. Jitter arises when pose observations are missing/noisy or
their envelope changes, not from a presentation transform altering metrics.
No further change is warranted in this architecture task.

## L. Performance

The expensive work is pass-1 full-frame/tile discovery and pass-2 pose
inference. Downstream stages reuse their outputs; they do not redetect the
athlete. R5B.4 increases full-frame calls only while reacquiring. The existing
R5B.4V pass-1 validation mode remains the appropriate fast tracker-only
profiling path. Avoid adding repeat whole-video passes; use bounded local
retries only where current pose/contact evidence already identifies a defect.

## M. Regression

No production behaviour changed in this audit. Existing relevant checks remain
the R5B.4 box-tracker suite and TypeScript compilation.

## N–O. Outstanding validation

R5B.4V remains mandatory: run Vanni through frame 105 and compare a fresh Gav
artifact on a MediaPipe-capable host. Do not mark R5B.4 closed here.

## P. Next recommendation

Run the existing host-capable Vanni/Gav production validation pair, then run
the immediate four-clip P0 matrix: Vanni 60/120/240 plus Gav stationary.

**Phase:** Multi-Pass Analysis / Measurement Reliability  
**Phase completion:** unchanged — audit only  
**Core MVP completion:** unchanged  
**Launch readiness:** unchanged  
**Overall AVA Performance launch completion:** unchanged
