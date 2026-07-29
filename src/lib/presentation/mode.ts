/**
 * Coach Presentation Mode V1 — the pure rules for AVA's clean, show-ready view of a
 * completed fly session. No I/O, no metric math: it only decides whether presentation
 * mode may be used and which sections are visible, so the page and the tests share one
 * source of truth.
 *
 * Presentation mode is a PRESENTATION layer only — it never changes analysis, never
 * removes the normal full-analysis view (that renders whenever presentation mode is
 * off), and is URL-driven (`?view=presentation`) so it needs no client state.
 */

/** Every section the normal analysis view can render. */
export type SessionSection =
  // Kept in presentation mode (the story a coach/investor sees):
  | "video"
  | "keyMetrics"
  | "performanceScore"
  | "topLimitingFactor"
  | "topRecommendation"
  | "recommendedExercises"
  | "sessionPlan"
  | "progress"
  // Hidden in presentation mode (working / developer / noisy surfaces):
  | "analysisModeControls"
  | "experimentalEngineControls"
  | "rawCalibrationControls"
  | "experimentalMetricsPanel"
  | "detailedSystems"
  | "recordingQualityCard"
  | "debugTools"
  | "developerLabels"
  | "sessionAdmin"
  | "dangerZone";

/** Sections shown in presentation mode. */
export const PRESENTATION_VISIBLE_SECTIONS: readonly SessionSection[] = [
  "video",
  "keyMetrics",
  "performanceScore",
  "topLimitingFactor",
  "topRecommendation",
  "recommendedExercises",
  "sessionPlan",
  "progress",
];

/** Sections hidden in presentation mode (debug / raw controls / noisy secondary). */
export const PRESENTATION_HIDDEN_SECTIONS: readonly SessionSection[] = [
  "analysisModeControls",
  "experimentalEngineControls",
  "rawCalibrationControls",
  "experimentalMetricsPanel",
  "detailedSystems",
  "recordingQualityCard",
  "debugTools",
  "developerLabels",
  "sessionAdmin",
  "dangerZone",
];

const VISIBLE_SET = new Set<SessionSection>(PRESENTATION_VISIBLE_SECTIONS);

export interface SessionStateForPresentation {
  status: string;
  analysisType: string | null;
}

/**
 * Presentation mode is only available for a COMPLETED FLY session (requirement 7 —
 * an incomplete session can't enter it, and acceleration is out of scope).
 */
export function canUsePresentationMode(s: SessionStateForPresentation): boolean {
  return s.status === "complete" && s.analysisType === "fly";
}

/**
 * Resolve whether presentation mode is actually ON: requested via the URL AND allowed
 * for this session. A requested-but-not-allowed session falls back to the normal view.
 */
export function resolvePresentationMode(input: {
  requested: boolean;
  status: string;
  analysisType: string | null;
}): boolean {
  return input.requested && canUsePresentationMode(input);
}

/**
 * Is a section visible? In the normal view EVERYTHING is visible (the full analysis is
 * unchanged); in presentation mode only the curated set shows.
 */
export function isSectionVisible(section: SessionSection, presentationMode: boolean): boolean {
  if (!presentationMode) return true;
  return VISIBLE_SET.has(section);
}
