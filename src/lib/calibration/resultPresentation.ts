/**
 * Result-presentation model (Part 1 §10). A pure mapping from calibration result
 * status → how the UI must present metrics + coaching recommendations, so the
 * "never show a stale/superseded result as current" rule is one testable function
 * rather than scattered JSX conditionals. Consumed by the session page and asserted
 * both by a sanity test and (via data-attributes) by the browser test.
 */

import type { CalibrationResultStatus } from "./lifecycle";

export interface ResultPresentation {
  /** Banner copy shown above the metrics, or null when current. */
  banner: string | null;
  /** How the trusted metric cards should render. */
  metrics: "normal" | "muted_previous" | "pending";
  /** Whether coaching recommendations may be presented as current guidance. */
  recommendationsCurrent: boolean;
  /** Whether a retry affordance should be offered. */
  retry: boolean;
}

export function resultPresentation(status: CalibrationResultStatus | "failed"): ResultPresentation {
  switch (status) {
    case "current":
      return { banner: null, metrics: "normal", recommendationsCurrent: true, retry: false };
    case "pending":
      return {
        banner:
          "Recalculation pending — these metrics are being recomputed against the current timing zone.",
        metrics: "pending",
        recommendationsCurrent: false,
        retry: false,
      };
    case "superseded":
      return {
        banner:
          "Previous result — this analysis was produced against an earlier timing zone (superseded). Rerun to refresh.",
        metrics: "muted_previous",
        recommendationsCurrent: false,
        retry: false,
      };
    case "failed":
      return {
        banner: "Recalculation failed — the timing zone changed but the recompute did not finish.",
        metrics: "pending",
        recommendationsCurrent: false,
        retry: true,
      };
  }
}
