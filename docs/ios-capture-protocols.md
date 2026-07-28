# Capture protocols

`ava.side-view-sprint` version 1 is the only enabled protocol. It specifies lateral side
view, landscape, nominal 60 FPS class, minimum/preferred resolution, H.264/HEVC, visible
physical calibration gates, 2–60 second duration, 1.5 GB maximum, deterministic guidance,
and backend compatibility `ava-mobile-v1`.

The protocol ID and version are stored with local media and must accompany analysis
submission. The backend supplies/approves protocols; the client may cache signed/versioned
configuration but cannot invent analysis types. Front/rear views and reduced-FPS modes are
not presented as supported.

