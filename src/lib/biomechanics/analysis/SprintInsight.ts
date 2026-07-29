import type { RealSprintMetrics, SprintAnalysisResult } from "./SprintMetrics";

export type SprintInsightSeverity = "strength" | "watch" | "priority";

export interface SprintInsight {
  title: string;
  message: string;
  severity: SprintInsightSeverity;
}

export interface SprintInsightReport {
  summary: string;
  strengths: SprintInsight[];
  watchItems: SprintInsight[];
  priorities: SprintInsight[];
  confidence: number;
}

const round = (value: number, decimals = 1): string => value.toFixed(decimals);

export function generateSprintInsightReport(
  analysis: SprintAnalysisResult,
): SprintInsightReport {
  const metrics: RealSprintMetrics = analysis.metrics;
  const strengths: SprintInsight[] = [];
  const watchItems: SprintInsight[] = [];
  const priorities: SprintInsight[] = [];

  if (metrics.stepFrequencyHz != null) {
    if (metrics.stepFrequencyHz >= 4.8) {
      strengths.push({
        title: "Elite step rhythm",
        message: `Step frequency is strong at ${round(metrics.stepFrequencyHz, 2)} Hz.`,
        severity: "strength",
      });
    } else if (metrics.stepFrequencyHz < 4.4) {
      priorities.push({
        title: "Improve rhythm",
        message: `Step frequency is ${round(metrics.stepFrequencyHz, 2)} Hz. Sharpening front-side mechanics and ground return should be a priority.`,
        severity: "priority",
      });
    } else {
      watchItems.push({
        title: "Rhythm is developing",
        message: `Step frequency is ${round(metrics.stepFrequencyHz, 2)} Hz. This is usable, but there may be room to improve turnover.`,
        severity: "watch",
      });
    }
  }

  if (metrics.avgGroundContactMs != null) {
    if (metrics.avgGroundContactMs <= 90) {
      strengths.push({
        title: "Fast ground contact",
        message: `Average ground contact is excellent at ${round(metrics.avgGroundContactMs, 0)} ms.`,
        severity: "strength",
      });
    } else if (metrics.avgGroundContactMs > 110) {
      priorities.push({
        title: "Reduce ground contact",
        message: `Average ground contact is ${round(metrics.avgGroundContactMs, 0)} ms. The athlete may be spending too long on the ground.`,
        severity: "priority",
      });
    } else {
      watchItems.push({
        title: "Ground contact is acceptable",
        message: `Average ground contact is ${round(metrics.avgGroundContactMs, 0)} ms. Keep monitoring this as speed increases.`,
        severity: "watch",
      });
    }
  }

  if (metrics.avgFlightTimeMs != null) {
    if (metrics.avgFlightTimeMs >= 115 && metrics.avgFlightTimeMs <= 140) {
      strengths.push({
        title: "Balanced flight phase",
        message: `Average flight time is ${round(metrics.avgFlightTimeMs, 0)} ms, suggesting a usable balance between projection and rhythm.`,
        severity: "strength",
      });
    } else if (metrics.avgFlightTimeMs < 105) {
      watchItems.push({
        title: "Low flight time",
        message: `Average flight time is ${round(metrics.avgFlightTimeMs, 0)} ms. The athlete may need more projection without increasing ground contact.`,
        severity: "watch",
      });
    } else {
      watchItems.push({
        title: "High flight time",
        message: `Average flight time is ${round(metrics.avgFlightTimeMs, 0)} ms. Watch for over-bounding or excessive backside recovery.`,
        severity: "watch",
      });
    }
  }

  if (metrics.leftRightStepTimeAsymmetryPct != null) {
    if (metrics.leftRightStepTimeAsymmetryPct <= 3) {
      strengths.push({
        title: "Good left-right symmetry",
        message: `Step-time asymmetry is low at ${round(metrics.leftRightStepTimeAsymmetryPct, 1)}%.`,
        severity: "strength",
      });
    } else if (metrics.leftRightStepTimeAsymmetryPct >= 8) {
      priorities.push({
        title: "Address asymmetry",
        message: `Step-time asymmetry is ${round(metrics.leftRightStepTimeAsymmetryPct, 1)}%. Review left-right mechanics and possible fatigue or injury compensation.`,
        severity: "priority",
      });
    } else {
      watchItems.push({
        title: "Monitor asymmetry",
        message: `Step-time asymmetry is ${round(metrics.leftRightStepTimeAsymmetryPct, 1)}%. Not alarming, but worth tracking.`,
        severity: "watch",
      });
    }
  }

  const warningPenalty = Math.min(0.2, analysis.warnings.length * 0.03);
  const confidence = Math.max(
    0.55,
    Math.min(
      0.98,
      0.78 +
        strengths.length * 0.04 -
        priorities.length * 0.04 -
        watchItems.length * 0.01 -
        warningPenalty,
    ),
  );

  const summary =
    priorities.length > 0
      ? `AVA found ${strengths.length} strength${strengths.length === 1 ? "" : "s"} and ${priorities.length} main priorit${priorities.length === 1 ? "y" : "ies"}.`
      : `AVA found ${strengths.length} strength${strengths.length === 1 ? "" : "s"} with no major red flags.`;

  return {
    summary,
    strengths,
    watchItems,
    priorities,
    confidence,
  };
}