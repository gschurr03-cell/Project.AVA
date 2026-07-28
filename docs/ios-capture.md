# iOS capture and import

`SprintCaptureController` uses the rear AVFoundation camera, omits audio, requests a
supported 60 FPS format, handles camera permission, and writes a private temporary movie.
Requested FPS is never treated as measured FPS. `MediaMetadataInspector` reads duration,
nominal frame rate, dimensions, codec-facing metadata, size, and source type for server
provenance.

Capture guidance is deterministic: landscape framing, visible calibration area, stable
camera, adequate light, unobstructed athlete, and 60 FPS or higher. Import is designed
for PhotosUI/file-provider selection followed by a protected application-owned copy;
provider URLs are never upload sources. Final PhotosPicker UI, orientation/interruption
handling, low-storage UX, preview/discard UI, device-format validation, duplicate hashing,
and physical-device verification are scaffolded or deferred.

