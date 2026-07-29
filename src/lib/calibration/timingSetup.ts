import { z } from "zod";
import { reportTimeSeconds } from "../measurement/timingPolicy";

export const TIMING_SETUP_SCHEMA_VERSION = "ava-timing-setup-v1" as const;
export const MANUAL_TIMING_MODEL_VERSION = "ava-manual-crossing-v1" as const;
export const LANDMARK_PLANE_MODEL_VERSION = "ava-landmark-plane-v1" as const;

export const timingSetupModeSchema = z.enum([
  "marked_zone",
  "fixed_landmarks",
  "manual_crossing",
  "technique_only",
]);
export type TimingSetupMode = z.infer<typeof timingSetupModeSchema>;

export const distanceStatusSchema = z.enum([
  "surveyed",
  "verified_track_marking",
  "hardware_defined",
  "user_measured",
  "user_asserted",
  "unknown",
]);

const pointSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
const lineSchema = z.object({ c1: pointSchema, c2: pointSchema }).refine(
  ({ c1, c2 }) => c1.x !== c2.x || c1.y !== c2.y,
  "A timing plane requires two different points.",
);
const readinessSchema = z.enum(["ready", "needs_confirmation", "limited", "lost", "unsupported"]);

const distanceEvidenceSchema = z.object({
  distanceM: z.number().positive().nullable(),
  status: distanceStatusSchema,
  measurementMethod: z.string().max(240).nullable(),
  uncertaintyM: z.number().nonnegative().nullable(),
  evidence: z.string().max(500).nullable(),
  confirmedAt: z.string().datetime().nullable(),
}).superRefine((value, context) => {
  if (value.status !== "unknown" && value.distanceM == null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Known distance status requires a distance." });
  }
});

const manualBracketSchema = z.object({
  beforeFrame: z.number().int().nonnegative(),
  beforeTimestampS: z.number().nonnegative(),
  afterFrame: z.number().int().nonnegative().nullable(),
  afterTimestampS: z.number().nonnegative().nullable(),
  interpolation: z.number().min(0).max(1).nullable(),
}).superRefine((value, context) => {
  const hasAfter = value.afterFrame != null || value.afterTimestampS != null;
  if (hasAfter && (value.afterFrame == null || value.afterTimestampS == null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "After frame and timestamp must be set together." });
  }
  if (value.afterFrame != null && value.afterFrame <= value.beforeFrame) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "After frame must follow before frame." });
  }
  if (value.afterTimestampS != null && value.afterTimestampS <= value.beforeTimestampS) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "After timestamp must follow before timestamp." });
  }
  if (value.afterFrame == null && value.interpolation != null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Interpolation requires two bracketing frames." });
  }
});

const common = {
  schemaVersion: z.literal(TIMING_SETUP_SCHEMA_VERSION),
  setupVersion: z.number().int().positive(),
  distance: distanceEvidenceSchema,
  bodyReference: z.enum(["torso", "hips", "head"]),
  validationStatus: z.enum(["draft", "pending_validation", "eligible", "experimental_ready", "unsupported"]),
};

const markedSetupSchema = z.object({
  ...common,
  setupMode: z.literal("marked_zone"),
  start: z.object({ confirmed: z.boolean(), readiness: readinessSchema, line: lineSchema.nullable() }),
  finish: z.object({ confirmed: z.boolean(), readiness: readinessSchema, line: lineSchema.nullable() }),
});

const landmarkDefinitionSchema = z.object({
  construction: z.enum(["full_transverse_line", "two_fixed_points", "point_plus_lane_normal", "timing_gate_pair", "surveyed_line"]),
  referenceType: z.string().min(1),
  points: z.array(pointSchema).max(2),
  laneOrientationDeg: z.number().min(-180).max(180).nullable(),
  analyticalPlane: lineSchema.nullable(),
  physicalEvidence: z.string().min(1),
  confidence: z.number().min(0).max(1),
  confirmed: z.boolean(),
  readiness: readinessSchema,
}).superRefine((value, context) => {
  const needsTwo = ["full_transverse_line", "two_fixed_points", "timing_gate_pair", "surveyed_line"].includes(value.construction);
  if (needsTwo && value.points.length !== 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "This landmark construction requires two fixed points." });
  }
  if (value.construction === "point_plus_lane_normal" && (value.points.length !== 1 || value.laneOrientationDeg == null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "One point requires an explicit lane orientation." });
  }
});

const landmarkSetupSchema = z.object({
  ...common,
  setupMode: z.literal("fixed_landmarks"),
  modelVersion: z.literal(LANDMARK_PLANE_MODEL_VERSION),
  laneIdentity: z.string().min(1),
  start: landmarkDefinitionSchema,
  finish: landmarkDefinitionSchema,
});

const manualSetupSchema = z.object({
  ...common,
  setupMode: z.literal("manual_crossing"),
  modelVersion: z.literal(MANUAL_TIMING_MODEL_VERSION),
  start: manualBracketSchema,
  finish: manualBracketSchema,
  notes: z.string().max(1000).nullable(),
});

const techniqueSetupSchema = z.object({
  ...common,
  setupMode: z.literal("technique_only"),
  validationStatus: z.literal("eligible"),
});

export const timingSetupSchema = z.discriminatedUnion("setupMode", [
  markedSetupSchema,
  landmarkSetupSchema,
  manualSetupSchema,
  techniqueSetupSchema,
]);
export type TimingSetup = z.infer<typeof timingSetupSchema>;

export type TimingTrust = {
  category: "automatic_highest_available" | "automatic_conditional" | "experimental_manual" | "no_timing";
  timingEligible: boolean;
  buttonState: "Ready" | "Needs setup" | "Experimental ready" | "Technique only" | "Unsupported";
  reasonCodes: string[];
  compatibilityGroup: string;
};

function fpsSuffix(analysisFps: 30 | 60): "validated-60" | "experimental-30" {
  return analysisFps === 60 ? "validated-60" : "experimental-30";
}

export function timingTrust(setup: TimingSetup, analysisFps: 30 | 60): TimingTrust {
  if (setup.setupMode === "technique_only") {
    return { category: "no_timing", timingEligible: false, buttonState: "Technique only", reasonCodes: ["technique_only"], compatibilityGroup: "technique-only" };
  }
  if (setup.setupMode === "manual_crossing") {
    const complete = Boolean(setup.distance.distanceM && setup.start.beforeFrame >= 0 && setup.finish.beforeFrame >= 0);
    return {
      category: "experimental_manual", timingEligible: complete,
      buttonState: complete ? "Experimental ready" : "Needs setup",
      reasonCodes: complete ? ["manual_crossings_user_defined"] : ["manual_crossings_incomplete"],
      compatibilityGroup: "manual-crossing-experimental-v1",
    };
  }
  const boundaries = [setup.start, setup.finish];
  const ready = boundaries.every((boundary) => boundary.confirmed && boundary.readiness === "ready");
  const unsupported = boundaries.some((boundary) => boundary.readiness === "unsupported");
  const distanceKnown = setup.distance.distanceM != null && setup.distance.status !== "unknown";
  const prefix = setup.setupMode === "marked_zone" ? "marked-zone" : "landmark-defined";
  return {
    category: setup.setupMode === "marked_zone" ? "automatic_highest_available" : "automatic_conditional",
    timingEligible: ready && distanceKnown,
    buttonState: unsupported ? "Unsupported" : ready && distanceKnown ? "Ready" : "Needs setup",
    reasonCodes: [
      ...(!ready ? ["crossing_boundaries_not_ready"] : []),
      ...(!distanceKnown ? ["distance_evidence_missing"] : []),
    ],
    compatibilityGroup: `${prefix}-${fpsSuffix(analysisFps)}-v1`,
  };
}

export function manualCrossingTimestamp(
  bracket: z.infer<typeof manualBracketSchema>,
  frameIntervalS: number,
): { rawTimestampS: number; uncertaintyS: number; method: "user_interpolated" | "conservative_frame_boundary" } {
  const parsed = manualBracketSchema.parse(bracket);
  if (parsed.afterTimestampS != null && parsed.interpolation != null) {
    return {
      rawTimestampS: parsed.beforeTimestampS + (parsed.afterTimestampS - parsed.beforeTimestampS) * parsed.interpolation,
      uncertaintyS: (parsed.afterTimestampS - parsed.beforeTimestampS) / 2,
      method: "user_interpolated",
    };
  }
  return {
    rawTimestampS: parsed.afterTimestampS ?? parsed.beforeTimestampS + frameIntervalS,
    uncertaintyS: frameIntervalS,
    method: "conservative_frame_boundary",
  };
}

export function calculateManualTiming(
  setup: Extract<TimingSetup, { setupMode: "manual_crossing" }>,
  frameIntervalS: number,
): {
  rawTimeS: number;
  reportedTimeS: number;
  reportedVelocityMps: number;
  uncertaintyS: number;
  label: "Experimental manual video timing";
} {
  const start = manualCrossingTimestamp(setup.start, frameIntervalS);
  const finish = manualCrossingTimestamp(setup.finish, frameIntervalS);
  const rawTimeS = finish.rawTimestampS - start.rawTimestampS;
  if (!(rawTimeS > 0) || setup.distance.distanceM == null) {
    throw new Error("Manual timing requires ordered crossings and a physical distance.");
  }
  const reportedTimeS = reportTimeSeconds(rawTimeS);
  return {
    rawTimeS,
    reportedTimeS,
    reportedVelocityMps: setup.distance.distanceM / reportedTimeS,
    uncertaintyS: start.uncertaintyS + finish.uncertaintyS,
    label: "Experimental manual video timing",
  };
}

export type LineSnapCandidate = {
  line: z.infer<typeof lineSchema>;
  contrast: number;
  straightness: number;
  orientation: number;
  continuity: number;
  proximity: number;
};

export function rankLineSnapCandidates(candidates: LineSnapCandidate[]): Array<LineSnapCandidate & { score: number; requiresConfirmation: true }> {
  return candidates.map((candidate) => ({
    ...candidate,
    score: 0.3 * candidate.contrast + 0.2 * candidate.straightness + 0.2 * candidate.orientation
      + 0.15 * candidate.continuity + 0.15 * candidate.proximity,
    requiresConfirmation: true as const,
  })).sort((a, b) => b.score - a.score);
}
