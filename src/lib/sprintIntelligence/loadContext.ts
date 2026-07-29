import "server-only";
import { loadIntelligenceContext, type IntelligenceContext } from "@/lib/limitingFactors/loadContext";
import { buildSprintIntelligence } from "./build";
import type { SprintIntelligenceReport } from "./types";
import type { LimitingFactorsResult } from "@/lib/limitingFactors";

const relPct = (l: number | null, r: number | null): number | null =>
  l != null && r != null && l + r > 0 ? (Math.abs(l - r) / ((l + r) / 2)) * 100 : null;

/**
 * Read-only Sprint Intelligence loader. Reuses the SAME authoritative measurement +
 * Limiting Factors computation as the Limiting Factors page (via loadIntelligenceContext) and
 * feeds it to the deterministic builder. It never measures anything itself.
 *
 * Historical-baseline and coach-target comparisons are reported as unavailable — AVA has no
 * validated model for them yet, and the builder discloses that honestly rather than inventing
 * a target.
 */
export async function loadSprintIntelligence(
  sessionId: string,
  suppliedContext?: IntelligenceContext,
): Promise<{
  report: SprintIntelligenceReport | null;
  limitingFactors: LimitingFactorsResult | null;
  sessionName: string | null;
  found: boolean;
  analysisType: string | null;
}> {
  const ctx = suppliedContext ?? await loadIntelligenceContext(sessionId);
  if (!ctx.found || !ctx.result) {
    return { report: null, limitingFactors: ctx.result, sessionName: ctx.sessionName, found: ctx.found, analysisType: ctx.analysisType };
  }

  const m = ctx.measurements;
  const t = ctx.trusted;

  const report = buildSprintIntelligence({
    analysisId: ctx.currentAnalysisId ?? sessionId,
    sessionId,
    generatedAt: new Date().toISOString(),
    limitingFactors: ctx.result,
    context: {
      analysisType: ctx.analysisType,
      calibrationConfirmed: ctx.calibrationConfirmed,
      spatialAvailable: ctx.spatialAvailable,
      measurementConfidence: m?.stepLengthConfidence ?? null,
      zoneDistanceM: ctx.zoneDistanceM,
      validStepCount: m?.validContacts ?? null,
      metrics: {
        avgStepLengthM: t?.avgStrideLengthM ?? m?.avgIndividualStepLengthM ?? null,
        peakStepLengthM: t?.peakStrideLengthM ?? m?.peakStrideLengthM ?? null,
        stepFrequencyHz: t?.frequencyHz ?? m?.combinedStepFrequencyHz ?? null,
        avgVelocityMps: t?.avgVelocityMps ?? m?.zoneVelocityMps ?? null,
        peakVelocityMps: t?.topSpeedMps ?? m?.maxVelocityMps ?? null,
      },
      athlete: ctx.athlete
        ? {
            heightCm: ctx.athlete.heightCm,
            legLengthCm: ctx.athlete.legLengthCm,
            trochanterHeightM: ctx.athlete.trochanterHeightM,
            weightKg: ctx.athlete.weightKg,
            // No validated event field/model wired yet — surfaced as a missing input.
            event: null,
          }
        : null,
      // No validated historical-baseline or coach-target comparison exists yet.
      historicalBaselineAvailable: false,
      coachTargetAvailable: false,
      symmetry: ctx.spatialAvailable
        ? {
            stepLengthDiffPct: relPct(m?.leftStepLengthM ?? null, m?.rightStepLengthM ?? null),
            stepFrequencyDiffPct: relPct(m?.leftStepFrequencyHz ?? null, m?.rightStepFrequencyHz ?? null),
            minSideSamples: Math.min(m?.validLeftContacts ?? 0, m?.validRightContacts ?? 0),
          }
        : null,
    },
  });

  return { report, limitingFactors: ctx.result, sessionName: ctx.sessionName, found: true, analysisType: ctx.analysisType };
}
