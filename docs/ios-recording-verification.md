# Recording verification

Requested capture configuration and verified output are separate contracts. Requested
data records protocol, format, FPS, codec, stabilization, and orientation. Verified data
records dimensions, nominal/measured FPS, timing variation, duration, frame estimate,
codec, orientation, size, audio presence, readability, and creation time.

The deterministic verifier returns preferred, acceptable, reduced confidence,
unsupported, corrupt, or incomplete plus explicit reason codes and independent upload/
analysis permissions. Captures and imports use this same classifier. `VerifiedMediaInspector`
reads the transformed and natural dimensions, audio presence, creation time and codec, and
samples up to 300 presentation timestamps to estimate measured FPS, minimum frame duration
and interval variation without decoding the entire asset. This iOS-only path remains
uncompiled by full Xcode and device-unvalidated. Audio is unnecessary: native capture has
no audio input and requests no microphone.
Imported audio is tolerated; server-side stripping needs a privacy/performance decision.
