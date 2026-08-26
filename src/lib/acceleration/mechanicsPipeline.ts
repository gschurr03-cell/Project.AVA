/**
 * Acceleration Mechanics orchestrator (Phase 3, Parts 4/6-13/17).
 *
 * The single entry point that turns an already-computed `AccelerationAnalysis`
 * (Phase 1/2 — timing, contacts, steps, velocity/acceleration; never
 * re-measured here) plus the raw pose sequence into the full mechanics
 * result: per-contact observations, the four progression trends, the
 * strategy classification, the mechanics-aware asymmetry report, and the
 * mechanics-derived limiting factors — in the exact shape
 * `accelerationMechanicsSchema` (Part 17) persists.
 *
 * Returns `null` when there are no valid steps to build mechanics from
 * (Part 1/18: never fabricate a result the underlying data can't support).
 */

import type { PoseSequence } from "../biomechanics/pose";
import type { AccelerationAnalysis } from "./metrics";
import type { TravelDirection } from "./mechanicsDefinitions";
import { computeAllContactMechanics, type ContactMechanics } from "./mechanics";
import {
  analyzeTrunkProgression,
  analyzeShinProgression,
  analyzeTouchdownProgression,
  analyzePelvisProgression,
  type MechanicalProgression,
} from "./mechanicsProgression";
import { classifyAccelerationStrategy, type StrategyClassification } from "./strategyClassification";
import { buildMechanicalAsymmetryReport, type MechanicalAsymmetry } from "./mechanicsAsymmetry";
import { buildMechanicalLimitingFactors, combineAccelerationLimiters } from "./mechanicalLimitingFactors";
import type { AccelerationLimiter } from "./limitingFactors";
import type { LeftRightContribution } from "./progression";
import { ACCELERATION_MECHANICS_CONTRACT_VERSION } from "./schema";

const EMPTY_LEFT_RIGHT: LeftRightContribution = {
  leftContactTimeS: null,
  rightContactTimeS: null,
  leftStepTimeS: null,
  rightStepTimeS: null,
  stepTimeAsymmetryPct: null,
  contactTimeAsymmetryPct: null,
  leftVelocityContributionMps: 0,
  rightVelocityContributionMps: 0,
  meaningfulStepLengthAsymmetry: false,
  meaningfulStepTimeAsymmetry: false,
  meaningfulContactTimeAsymmetry: false,
};

export interface AccelerationMechanicsResult {
  version: typeof ACCELERATION_MECHANICS_CONTRACT_VERSION;
  contacts: ContactMechanics[];
  trunkProgression: MechanicalProgression;
  shinProgression: MechanicalProgression;
  touchdownProgression: MechanicalProgression;
  pelvisProgression: MechanicalProgression;
  strategyClassification: StrategyClassification;
  asymmetries: MechanicalAsymmetry[];
  quality: {
    contactsWithMechanics: number;
    contactsTotal: number;
    averageConfidence: number;
    warnings: string[];
  };
  provenance: "automatic" | "manual";
}

/**
 * Builds the full mechanics result. Never throws on missing/unstable pose
 * data — every observation independently degrades via `MechanicalObservation`
 * (Part 4), and `quality.warnings` surfaces what could not be measured.
 */
export function computeAccelerationMechanics(input: {
  analysis: AccelerationAnalysis;
  poseSequence: PoseSequence;
  travelDirection: TravelDirection;
  legLengthM: number | null;
}): AccelerationMechanicsResult | null {
  const { analysis, poseSequence, travelDirection, legLengthM } = input;
  if (!analysis.steps.length) return null;

  const scale = { metersPerNormalizedUnit: analysis.metersPerNormalizedUnit, legLengthM };
  const contacts = computeAllContactMechanics(poseSequence, analysis.steps, travelDirection, scale);

  const trunkProgression = analyzeTrunkProgression(contacts);
  const shinProgression = analyzeShinProgression(contacts);
  // Center-of-mass proxy (hip+shoulder midpoint) is the fuller body-relative
  // reference (Part 7: "relative to CoM/pelvis, not raw screen distance");
  // pelvis-only offset is still separately available on each `ContactMechanics`.
  const touchdownProgression = analyzeTouchdownProgression(contacts, true);
  const pelvisProgression = analyzePelvisProgression(contacts);

  const strategyClassification = classifyAccelerationStrategy({
    steps: analysis.steps,
    trunk: trunkProgression,
    touchdown: touchdownProgression,
    shin: shinProgression,
    pelvis: pelvisProgression,
  });

  const asymmetries = buildMechanicalAsymmetryReport({
    stepAsymmetry: analysis.asymmetries,
    leftRight: analysis.progression?.leftRight ?? EMPTY_LEFT_RIGHT,
    touchdown: touchdownProgression,
    trunk: trunkProgression,
    shin: shinProgression,
  });

  const observationFields = (c: ContactMechanics) => [
    c.trunkAngleTouchdownDeg,
    c.shinAngleTouchdownDeg,
    c.pelvisHeightNormalized,
    c.touchdownOffsetFromCenterOfMass,
  ];
  const withValues = contacts.filter((c) => observationFields(c).some((o) => o.value != null));
  const allConfidences = contacts.flatMap((c) => observationFields(c).map((o) => o.confidence)).filter((v) => v > 0);
  const averageConfidence = allConfidences.length ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length : 0;

  const warnings: string[] = [];
  if (analysis.metersPerNormalizedUnit == null) {
    warnings.push("No calibrated zone scale available — touchdown offsets are reported in normalized units only, not meters.");
  }
  if (withValues.length < contacts.length) {
    warnings.push(`${contacts.length - withValues.length} of ${contacts.length} contacts had no usable mechanical observations (missing or low-confidence landmarks).`);
  }

  return {
    version: ACCELERATION_MECHANICS_CONTRACT_VERSION,
    contacts,
    trunkProgression,
    shinProgression,
    touchdownProgression,
    pelvisProgression,
    strategyClassification,
    asymmetries,
    quality: { contactsWithMechanics: withValues.length, contactsTotal: contacts.length, averageConfidence, warnings },
    provenance: "automatic",
  };
}

/** Merges Phase 2 step-level limiters with Phase 3 mechanics-derived limiters into one ranked list. */
export function computeCombinedAccelerationLimiters(input: {
  stepLimiters: AccelerationLimiter[];
  mechanics: AccelerationMechanicsResult | null;
  steps: AccelerationAnalysis["steps"];
  progression: AccelerationAnalysis["progression"];
}): AccelerationLimiter[] {
  if (!input.mechanics) return input.stepLimiters;
  const mechanicalLimiters = buildMechanicalLimitingFactors({
    trunk: input.mechanics.trunkProgression,
    touchdown: input.mechanics.touchdownProgression,
    shin: input.mechanics.shinProgression,
    pelvis: input.mechanics.pelvisProgression,
    steps: input.steps,
    progression: input.progression,
    strategy: input.mechanics.strategyClassification,
    asymmetries: input.mechanics.asymmetries,
  });
  return combineAccelerationLimiters(input.stepLimiters, mechanicalLimiters);
}
