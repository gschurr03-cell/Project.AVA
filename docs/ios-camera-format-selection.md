# Camera format selection

`CaptureFormatSelector` filters runtime formats by minimum 60 FPS, 1280×720, permitted
codec, and required stabilization. It then deterministically prefers 1920×1080 or better,
then higher resolution, higher available FPS, and finally stable format identifier order.

Results are `preferred`, `lowerResolution`, or `unsupported`. Lower FPS is never selected
silently. A lower-resolution 60 FPS selection remains eligible but must be shown with the
requested mode, selected mode, reason, and recording-confidence impact. Runtime capability
collection is in `CaptureImport.swift`; pure selection is unit tested.

