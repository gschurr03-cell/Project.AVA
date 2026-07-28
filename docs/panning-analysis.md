# AVA panning-analysis foundation

Status: implementation audit and production-foundation plan  
Governing standard: [AVA Accuracy Manifesto](./accuracy-manifesto.md)

## Audit before implementation

The repository already contains useful panning-related work, but it is split between
presentation, pose inference, measurement, and recording-quality layers. The existing
systems must be extended rather than rebuilt.

| Component | Exists and used | Readiness | Decision | Dependencies, assumptions, and debt |
| --- | --- | --- | --- | --- |
| Pose inference ROI | Yes. The production worker enables MediaPipe's two-pass ROI path by default. | Partial | Harden and preserve. | Pass one detects a single pose and pass two uses a square crop. Missing boxes are replaced by a whole-clip linear extrapolation. Crop boxes, confidence, loss ranges, and transforms are not emitted. Long gaps can silently use an unsupported extrapolation. |
| Crop-to-source mapping | Yes. Crop landmarks are mapped back into normalized full-frame coordinates. | Good foundation | Preserve and add provenance. | The affine scale/offset is deterministic and preserves overlay alignment. The transform is not persisted, so the mapping cannot currently be audited per frame. |
| Athlete identity/tracking | Partial. MediaPipe is configured for one pose and maintains its internal video track. | Incomplete | Add explicit evidence and fail-closed ranges. | No selected-athlete identity token, appearance embedding, multi-person ambiguity signal, bounding-box continuity test, or persisted loss ranges. Temporary loss is hidden by crop extrapolation. Production must not claim re-identification through another person. |
| Athlete bounding boxes | Yes internally in ROI pass one. | Partial | Persist normalized boxes and confidence. | Boxes currently exist only as transient `(cx, cy, height)` values and are discarded. They do not include crop/full-body clipping flags. |
| Display auto-follow | Yes in `lib/video/follow.ts`, used by the video UI. | Production-ready for presentation | Leave separate. | It is CSS-only, keeps video and overlay in one transformed wrapper, and does not affect analysis. It must never become the detection crop or a biomechanical coordinate transform. |
| Pose-based camera compensation | Yes in `lib/video/camera.ts`, used by calibrated fly measurements and gate rendering. | Validation-limited | Preserve for legacy/static results; do not promote as the new classifier. | It estimates translation from the least-moving foot, supports reversible frame/world mapping, and has a static guard. It has no background evidence, rotation, scale, zoom, or perspective model. Synthetic tests exist. Static-vs-pan inference can fail when athlete traversal is atypical. |
| Background feature tracking | No. | Missing/blocking | Add to the MediaPipe video pass. | OpenCV is already a production dependency. Athlete masking, feature support, RANSAC inliers, residuals, and failure behavior are required. Summary evidence should be persisted without storing raw imagery. |
| Zoom/rotation/shake detection | No production implementation. | Missing/blocking | Add conservative transform evidence and classification. | Pose size changes cannot alone distinguish zoom from depth movement. Background affine scale/rotation is required; ambiguous scale must reduce trust. |
| Recording-mode classification | Fragmented. Recording quality accepts a caller-supplied static boolean; provenance says `unknown`. | Missing/blocking | Create one versioned classifier. | Manual session mode is intent only. The classifier must consume background motion, tracking, crop, zoom, and stability evidence. UI-only labels are insufficient. |
| Ground calibration | Yes: known-distance points/gates and camera-offset propagation. | Good for static; conditional for translation-only pans | Preserve and gate. | One scalar metres-per-pixel assumes constant scale and perspective. Gate points can follow translation, but zoom or poor transform evidence invalidates absolute distance. Camera compensation is not calibration. |
| Overlay coordinate mapping | Yes. Pose artifacts are converted back to MediaPipe-indexed source coordinates and rendered with the original video. | Good foundation | Preserve; add transform regression tests. | Crop metadata is absent. RTMPose remains a visual comparison and must not enter metrics. |
| Recording quality | Yes and used in the session UI. | Partial | Route through the central classifier/trust policy. | Current logic can label compensated panning spatial metrics as certified using pose-foot compensation alone. It combines zone time and step frequency with spatial metrics even though their dependencies differ. |
| Metric availability contract | Yes in the versioned explainable result. | Good foundation, incomplete camera enforcement | Extend centrally. | Results support null/status/confidence/reason codes, but worker provenance has `cameraMode: unknown` and measurement availability is based mostly on frame coverage. Page-derived trusted metrics can bypass persisted camera evidence. |
| Camera persistence | Only generic provenance fields. | Missing/blocking | Add additive columns and structured provenance. | Recording mode, algorithm versions, transform summary, zoom, crop/tracking confidence, and unstable/loss ranges are not stored independently. |
| Camera tests | Synthetic translation, mapping, static guard, display follow, overlay alignment, calibration, quality, and metric trust exist. | Useful but incomplete | Preserve and add dedicated panning tests. | No background-feature, zoom, shake, crop provenance, identity-loss, or persisted-classification tests. Synthetic coverage is not real-world validation. |
| Real panning fixture | The Calab benchmark behaves as a panning clip and artifacts exist locally. | Usable diagnostic evidence, not a validated panning ground truth | Run end to end and report limitations. | It can prove processing and artifact alignment, not true world-coordinate velocity accuracy without independent transform/calibration ground truth. |

## Production-foundation architecture

The foundation uses explicit mode routing:

1. Preserve the original video and source metadata.
2. During MediaPipe pass one, detect the athlete and track background features outside the
   athlete mask.
3. Estimate a robust partial-affine background transform for each frame pair and retain
   translation, rotation, scale, feature support, inlier ratio, residual, and confidence.
4. Plan a deterministic square detection crop. Persist the source bounding box, crop box,
   mapping transform, and whether the crop came from direct detection or bounded gap fill.
5. Map pose landmarks back to original-frame normalized coordinates before any metric code.
6. Classify recording mode from measured evidence using one versioned policy.
7. Apply one metric-trust policy to the result contract. Camera compensation never creates
   scale; absolute spatial metrics require compatible calibration and reliable transforms.
8. Persist summaries and unsafe frame ranges. Raw video and raw source-coordinate pose data
   remain unchanged.

Static recordings retain the existing source-coordinate path. Detection cropping may improve
pose visibility, but its inverse mapping must make downstream coordinates equivalent within
test tolerance. No camera transform is applied to static measurements.

## Coordinate systems

- **Crop coordinates:** normalized coordinates inside the MediaPipe detection crop. Internal
  inference evidence only.
- **Original image coordinates:** normalized coordinates in the unchanged source frame. Pose
  artifacts and consumer overlays use this space.
- **Camera-compensated coordinates:** original image coordinates transformed by accumulated
  background motion. This removes supported camera motion but has no physical unit.
- **Ground-calibrated coordinates:** compensated image positions mapped using an explicitly
  valid calibration model. Only this space may support absolute spatial metrics.

Every crop transform is reversible. Camera compensation is never described as metres or as a
ground-plane calibration.

## Implementation plan for this pass

1. Add versioned schemas for recording classification, athlete/crop evidence, affine camera
   evidence, zoom classification, unsafe ranges, and summary confidence.
2. Extend the existing OpenCV/MediaPipe pass rather than creating another decoder.
3. Centralize mode classification and metric eligibility outside the UI.
4. Persist the assessment additively and include it in pose and explainability provenance.
5. Route recording-quality presentation through the assessment using user-safe language.
6. Add deterministic static, pan, shake, zoom, tracking-loss, crop-mapping, and trust tests.
7. Run the existing static benchmark unchanged, then run the real panning recording through
   the production worker. Do not claim validated panning velocity from that run.

## Validation boundary

This pass can establish reliable classification, traceable cropping, conservative metric
withholding, and a reproducible translation/zoom evidence foundation. It cannot establish
perfect panning world coordinates, perspective-aware ground homography, multi-person
re-identification, rolling-shutter correction, or validated panning acceleration without
real ground-truth fixtures. Those capabilities remain future work and must not be implied by
successful processing alone.

## Implementation and validation status

Implemented foundation versions:

- recording classifier: `ava-recording-mode-v1`;
- background motion: `ava-background-affine-v1`;
- dynamic crop: `ava-mediapipe-roi-v1`;
- athlete tracking evidence: `ava-single-pose-continuity-v1`.

The existing MediaPipe location pass now masks the athlete, detects background corners,
tracks them with pyramidal optical flow, and uses RANSAC partial-affine estimation. Each
interval records normalized translation, rotation, scale, feature count, inlier ratio,
residual, and confidence. This is evidence about image motion, not world distance.

The ROI path retains direct detector boxes, bounded interpolated crops, confidence, crop
source, limb-edge flags, and loss ranges. Pose landmarks continue to be mapped back to the
unchanged original frame before they enter AVA's canonical pose schema. The normal overlay
therefore remains in source-video coordinates.

The central trust policy currently behaves conservatively:

| Metric family | Static precision | Static usable | Smooth pan | Zoom/unstable/lost |
| --- | --- | --- | --- | --- |
| Image-relative joint geometry | Available with reliable athlete tracking | Available with reduced tracking confidence | Available with reliable athlete tracking | Withheld when tracking is unreliable |
| Cadence and event timing | Available only with reliable foot events | Same | Same | Withheld when foot events are unreliable |
| Absolute length, velocity, acceleration, displacement | Requires calibration | Requires calibration and confidence | **Withheld pending validated moving ground calibration** | Withheld |

The local real-video inventory contains two uploaded recordings. One fails the established
capture gate because it is genuinely below the 60 FPS class. The supported 59.x FPS fixture
completed end to end and independently classified `static_precision`, with camera confidence
`0.9884`, athlete-tracking confidence `0.8021`, no meaningful zoom, no final-pass tracking
loss ranges, and eligible static
spatial routing. It completed in `24.60 s` for 142 analyzed frames and produced a `597,879`
byte pose artifact. The immediately preceding same-video run completed in `20.86 s`, so the
observed background-tracking overhead was `3.74 s` (about 18%) on this machine. Peak memory
was not instrumented and is not claimed.

No genuine supported panning source exists in the local fixture set. Synthetic translation,
zoom, shake, low-feature, and tracking-loss tests pass, but synthetic transforms do not prove
real-world accuracy. Consequently, the panning foundation is implemented but the MVP
completion rule requiring a real panning video is unmet. Panning velocity, acceleration,
perspective-aware calibration, multi-person re-identification, rolling-shutter detection,
and a visual feature-match diagnostics renderer remain incomplete.

The rejected source has now been identified as the product-owner panning fixture and is
documented in [Real-world panning validation](./panning-real-world-validation.md). `ffprobe`
reports 197 frames over 6.566667 seconds with both average and nominal rates at exactly 30
FPS. It is preserved as protected validation evidence, but it cannot validate the production
panning path. The 2.77-second external value remains incomplete and non-comparable.
