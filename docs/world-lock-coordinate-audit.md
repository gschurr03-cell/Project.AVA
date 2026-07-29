# AVA overlay coordinate authority

## Coordinate spaces

1. **Source pixels** — immutable decoded video dimensions (`PoseSequence.width/height`).
2. **Pose ROI pixels** — inference-only crop; the Python runner maps landmarks back to source pixels before serialization.
3. **Pose normalized source** — stored landmark `x/y`, normalized by source dimensions.
4. **Canonical world/reference** — `ava-world-reference-v1`; normalized coordinates in immutable source frame 0.
5. **Camera projection** — `ava-background-world-v2`; masked-background RANSAC homography, with explicit partial-affine fallback.
6. **Current source normalized** — canonical geometry projected into the requested source frame.
7. **Picture/display pixels** — letterbox-aware `projectLandmark` mapping.
8. **Athlete-follow viewport** — final CSS transform shared by video and canvas; never analytical authority.

## Overlay authority map

| Overlay | Canonical input | Rendering chain |
| --- | --- | --- |
| Pose, angles, foot labels | Current pose frame, normalized source | source → picture → shared follow viewport |
| Start/Finish gates | Persisted source line + setup source frame | canonical reference → current source → picture → shared follow viewport |
| Timing-zone identity | Persisted independent Start/Finish anchors | same projection as each gate; identities never derive from athlete motion |
| Contact/step dots | Event-frame foot evidence + source frame index | canonical reference → current source → picture → shared follow viewport |
| COM/athlete trail | Pose-frame anatomy (athlete-relative visualization) | current source → picture → shared follow viewport |
| Calibration handles | Pointer inverse through picture/follow transform, captured once with source frame | captured source → canonical reference; preview projects forward |

Legacy midpoint-only calibrations have neither a source-frame line nor transform provenance. They are not reinterpreted as canonical world data; the UI requests a rerun and gate confirmation.

## Root cause and corrected chain

The prior contact renderer estimated camera motion from the athlete’s stance foot. Gates had separate background-affine and athlete-derived fallback paths. This mixed athlete motion, camera motion, and viewport motion, producing sliding and jumbled environmental overlays.

Before:

`event frame coordinate → athlete-derived accumulated offset → canvas`, with separate gate fallbacks.

After:

`immutable reference-world geometry → frame-specific background projection → source frame → shared picture projection → shared follow viewport`.

Every frame recomputes from immutable canonical input. Rendered coordinates are never written back or used as the next frame’s authority.
