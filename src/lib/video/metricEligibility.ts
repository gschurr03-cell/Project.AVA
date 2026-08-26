/**
 * FPS-driven metric eligibility policy (variable-frame-rate audit).
 *
 * Deliberately separate from `analysisFps.ts`'s source-acceptance/classification
 * logic: a video can be accepted, stored, and reviewed at any supported band —
 * whether every *metric* is trustworthy at that rate is a distinct question,
 * answered here. Never fabricates a value AVA can't support at the source rate;
 * instead it says so, with a reason a coach can act on.
 */

import { classifyFpsBand, MINIMUM_60_FPS_CLASS, type FpsBand } from "./analysisFps";

export type MetricEligibilityReasonCode =
  | "unsupported_source_fps"
  | "insufficient_source_fps_for_acceleration_contacts";

export interface MetricEligibility {
  available: boolean;
  reasonCode: MetricEligibilityReasonCode | null;
  explanation: string | null;
}

const ELIGIBLE: MetricEligibility = { available: true, reasonCode: null, explanation: null };

function unsupportedFile(band: FpsBand): MetricEligibility {
  return {
    available: false,
    reasonCode: "unsupported_source_fps",
    explanation:
      band === "unsupported"
        ? "The recording's frame rate is outside the range AVA can read (roughly 24-300 FPS)."
        : "The recording's frame rate could not be determined.",
  };
}

/** Can the file be uploaded, stored, and opened for review at all? */
export function videoReviewEligibility(fpsExact: number | null | undefined): MetricEligibility {
  const band = classifyFpsBand(fpsExact);
  return band === "unsupported" ? unsupportedFile(band) : ELIGIBLE;
}

/** Can AVA run pose estimation and show broad mechanics review for this source? */
export function poseReviewEligibility(fpsExact: number | null | undefined): MetricEligibility {
  return videoReviewEligibility(fpsExact);
}

/**
 * Ground-contact-time / step-timing precision for acceleration analysis. This is
 * the one place low-fps content is turned away from a *measurement* (not the
 * file itself) — below the validated-60 threshold (~59 FPS) cannot resolve a
 * stance phase that lasts on the order of 100 ms without materially
 * understating it. Capability-based on the exact detected rate, not a
 * classification allowlist: a native 75/90/144/165 FPS source qualifies exactly
 * the same way a validated 59.94/60 FPS source does, purely because its real
 * rate clears the threshold — no hardcoded per-rate window needed.
 */
export function accelerationContactEligibility(fpsExact: number | null | undefined): MetricEligibility {
  if (typeof fpsExact === "number" && Number.isFinite(fpsExact) && fpsExact >= MINIMUM_60_FPS_CLASS) return ELIGIBLE;
  return {
    available: false,
    reasonCode: "insufficient_source_fps_for_acceleration_contacts",
    explanation:
      "The recording does not contain enough frames per second for precise " +
      "acceleration contact-time and step-timing measurements. Record at 60 FPS " +
      "or higher for these metrics; broader video review and mechanics remain available.",
  };
}

/** Alias for the same gate — contact-time IS the high-resolution step-timing metric today. */
export const preciseContactTimeEligibility = accelerationContactEligibility;
