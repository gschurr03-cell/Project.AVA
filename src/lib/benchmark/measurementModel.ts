/**
 * Phase R4B — versioned scientific measurement model (Day: canonical
 * longitudinal activation). Mirrors the existing small-constants-file
 * pattern already used for `CONSERVATIVE_TIMING_POLICY_V1`
 * (`@/lib/measurement/timingPolicy`) and `ZONE_STEP_MEASUREMENT_VERSION`
 * (`@/lib/video/zoneStepAnalysis`) rather than inventing new architecture.
 *
 * LEGACY_2D — the model every analysis has used until now: step length is
 * full 2D Euclidean contact-to-contact displacement (`hypot(dx,dy)`), and
 * Peak Velocity's distance term is the same 2D Euclidean stride
 * displacement, regardless of step-length path.
 *
 * CANONICAL_LONGITUDINAL — step length and Peak Velocity's distance term
 * both use the SAME longitudinal coordinate `s(P) = dot(P-S,u) × scale`
 * already implemented in `zoneStepAnalysis.ts`'s `analyzeZoneSteps`
 * (previously only reachable for panning cameras, via `cameraEvidence`).
 * Average Velocity, Step Frequency, zone-crossing timing, contacts, and
 * calibration are UNCHANGED by this version — see
 * docs/phase-r4b-versioned-canonical-longitudinal-measurement.md.
 *
 * Default is LEGACY_2D everywhere a caller omits the field, so every
 * existing call site and every historical artifact replays byte-identical
 * scientific output until a caller explicitly opts in.
 */
export const MEASUREMENT_MODEL_LEGACY_2D = "LEGACY_2D" as const;
export const MEASUREMENT_MODEL_CANONICAL_LONGITUDINAL = "CANONICAL_LONGITUDINAL" as const;

export type MeasurementModelVersion =
  | typeof MEASUREMENT_MODEL_LEGACY_2D
  | typeof MEASUREMENT_MODEL_CANONICAL_LONGITUDINAL;

export const DEFAULT_MEASUREMENT_MODEL_VERSION: MeasurementModelVersion = MEASUREMENT_MODEL_LEGACY_2D;
