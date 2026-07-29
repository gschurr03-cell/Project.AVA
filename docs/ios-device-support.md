# iOS device support

Initial policy is iOS 17 on an iPhone with a rear camera that reports an H.264 or HEVC
format at 60 FPS and at least 1280×720. Preferred capture is 1920×1080 at 60 FPS.
30 FPS is not an automatic fallback and is unsupported for the production pipeline.
Devices are evaluated through AVFoundation at runtime; no marketing-model allowlist is
used. Unsupported devices may import a verified conforming recording but cannot capture.

At least 1.5 GB free blocks capture, below 2 GB is critical, and below 4 GB warns.
Wi-Fi-only is the safe large-upload default. Low Data Mode pauses automatic transfer.
Thermal pressure, low battery, storage, available rear cameras, formats, FPS ranges,
resolution, stabilization/HDR exposure, and device model category enter diagnostics.
Exact codec/format behavior and minimum iPhone generation require physical-device results.

