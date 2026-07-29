# Local physical gate lock stabilization

Audit date: 2026-07-16
Status: fail-closed stabilization implemented; crossing validation still blocked

## Current-system audit

| Stage | Current behavior | Production finding |
| --- | --- | --- |
| Selection | Session editor persists two normalized source-frame endpoint pairs and setup frames. | No appearance patch, local ROI, object mask, descriptor, or correction keyframe is persisted. |
| Compensated anchor | Each endpoint is mapped to frame zero using composed previous→current partial-affine evidence. | Mathematically consistent but inherits global-scene approximation and accumulated error. |
| Forward/backward propagation | Endpoints are independently transformed through every intervening global affine; backward propagation explicitly inverts each transform. | Direction and inversion are correct. Weak transforms are integrated without local re-registration, so endpoint noise becomes position, angle, and scale drift. |
| Pivot/geometry | Full endpoints are propagated; no midpoint-only reconstruction occurs. Rotation is around the affine coordinate origin as encoded by OpenCV. | No midpoint or stale-endpoint defect. A locally wrong prediction remains a rigid but incorrectly located segment. |
| Evidence | Global features are background-filtered but represent the whole scene. Confidence, support, residual, and unstable ranges are available. | Moving athletes, railings, field geometry, perspective, and scene-depth differences can contaminate a single global model. Partial affine cannot represent the full projective track surface over the pan. |
| Overlay | The consumer propagates the source segment, hides it when the short segment does not intersect the viewport, and otherwise renders a solid authoritative gate. | No local-lock state exists; low-quality predictions can appear authoritative. The analytical extension is not normally drawn, but predicted short segments can still be misleading. |
| Crossing | Production uses the same propagated endpoint geometry and signed infinite plane as rendering. Unsafe global intervals reset detection. | Geometry consumption is consistent, but global safety is insufficient proof that the selected physical paint is locally locked. |
| History | Gate changes queue immutable analysis versions. Existing experimental timing remains immutable. | No explicit invalidation/exclusion envelope exists for the failed 2.24 result. |

The real fixture confirms approximately 15 px stable start offset plus frame-scale global
motion noise. The prior forensic audit also demonstrated high body-reference sensitivity
against the predicted plane. Smoothing would not establish physical alignment.

## Implementation plan

1. Add an immutable validation/invalidation record and mark the existing three repeatability
   analyses `invalid_gate_propagation`, excluded from every downstream consumer while
   preserving their evidence.
2. Define a versioned local-gate-lock contract: setup patch metadata, local ROI, appearance
   descriptor, masks, keyframes, per-frame corrected rigid segment, evidence, stability,
   and `locked`/`limited`/`lost` state.
3. Implement an independent OpenCV tracker per gate. Use global affine only as the search
   prediction; locally score line/edge/contrast/appearance candidates, enforce identity and
   continuity bounds, and fail closed without local evidence.
4. Evaluate partial affine, planar homography, local-only, and hybrid correction against
   independent source-pixel annotations. Select by measured crossing-near alignment rather
   than model complexity.
5. Make overlay and crossing consumers accept only the same locally locked geometry. Hide
   offscreen/lost gates and render limited evidence dashed. Do not recompute performance
   timing in this pass.
6. Add fixture, stability, exclusion, static, and validated-60 regressions; generate a
   diagnostic video or frame sequence with prediction, detection, fusion, confidence, and
   state.

## Implemented stabilization

- Added `ava-local-gate-tracker-v1` with independent start/finish instances, local ROIs,
  athlete masking, bidirectional pyramidal optical flow, forward/backward rejection, local
  line-segment/brightness/contrast evidence, RANSAC, bounded rigid fusion, correction-jump
  rejection, and offscreen/lost hiding. Yellow cones are never an input.
- Added `ava-start-line-lock-v1` and `ava-finish-line-lock-v1` contracts plus immutable
  setup-patch, descriptor, exclusion-mask, ROI, and correction-keyframe schema support.
- Added typed `locked`/`limited`/`lost` frame evidence. Only `locked` and timing-eligible
  geometry can be returned to a timing consumer; lost gates must have no rendered line.
- Added migration 0031. The three immutable `237392ec` results are now
  `invalid_gate_propagation` and excluded from history trends, benchmarks, predictions,
  and recommendations. Their original payloads remain unchanged. The result card withholds
  time/velocity and displays the invalidation reason.
- Added an annotated diagnostic MP4 and source-frame strips showing global prediction,
  local candidate, fused short segment, confidence, appearance score, and state.

## Model comparison

Ten independent annotations produced these aggregate errors:

| Model | Mean midpoint | Mean endpoint | Maximum angle |
| --- | ---: | ---: | ---: |
| Partial affine | 7.40 px | 9.10 px | 1.22° |
| Direct full homography | 8.36 px | 9.59 px | 1.36° |
| Local optical prediction alone | 11.18 px over six supported annotations | 12.16 px | 1.64° |
| Hybrid global/local lock | **2.41 px** | **5.13 px** | 1.64° |

Homography was not adopted: it was less accurate than the existing partial affine on this
fixture and substantially worse than hybrid local correction. The remaining start angular
error requires a trusted correction keyframe, not a more complex global warp.

## Real-fixture status

The finish annotations currently measure 1.23 px mean / 2.52 px maximum midpoint error,
1.23 px mean endpoint error, and 0.32° maximum angular error after trusted keyframes. The
tracker nevertheless marks the current interval limited when correction continuity is not
proven, which is the intended fail-closed behavior.

Start annotations improve from approximately 14.9 px global offset to 3.93 px mean, but
the maximum remains 7.58 px and maximum angular error is 1.64°. More importantly, no
independently trusted start keyframe exists in the actual crossing neighborhood. Attempts
to infer one automatically were rejected because nearby white lane markings are ambiguous.
Start frames 95–103 therefore remain `limited`; no timing can be produced.

This pass raises physical gate-lock engineering stability from approximately 35% to an
estimated **70%**, not the requested 90%. A subsequent source-frame review found no valid
transverse start reference in this fixture, so no human-confirmed start keyframe or V2 was
created. See `docs/human-confirmed-start-gate-investigation.md`. Reaching 90% requires a
replacement fixture with a visible transverse start line, one finish verification keyframe,
a new zone version, and the same fixture regression. Overall MVP completion remains 83%.
