# Metric validation registry

The executable registry is
`src/lib/scientificValidation/registry.ts`. Each entry records measurement class,
definition, unit, computation, dependencies, recording conditions, FPS support, current
expected-error statement, confidence policy, reference method, evidence status, visibility,
review triggers and limitations.

Initial policy:

- Step frequency may be visible only with its trust/confidence warning.
- Zone time, average velocity, step length and 2D kinematics are coach-only.
- Ground-contact and flight time are experimental.
- Peak velocity is hidden until definition/reference agreement is established.
- Root Cause is coach-only and association-based.
- Projections are experimental; precise PB/race-time synthesis is unsupported.

Unknown or unsupported FPS, insufficient confidence, calibration/tracking ambiguity and
manual-review triggers fail toward hiding or coach review.

