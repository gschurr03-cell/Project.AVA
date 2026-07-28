# iOS internal TestFlight plan

## Setup

Use a staging build, authorized non-production account, Wi-Fi, controlled test runner/video,
and the supported side-view protocol. Never place passwords or athlete-identifying data in
feedback.

1. Install TestFlight and sign in.
2. Review guidance and capture/import a controlled sprint.
3. Confirm verified FPS, resolution, quality, and warnings.
4. Upload on Wi-Fi, background/reopen, and confirm recovery.
5. Submit analysis, track public status, and open the activated report.
6. Enable airplane mode, relaunch, and open the immutable cached report.
7. Export redacted diagnostics and report build/environment/device, safe correlation ID,
   stage, expected/actual result, reproduction steps, and screenshots without personal data.

Known blockers are absent signing/TestFlight configuration, undeployed mobile endpoints,
and incomplete review/diagnostics UI. Test credentials are distributed through an approved
secret channel, never this repository.
