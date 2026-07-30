import { z } from "zod";
import { calibrationCameraTypeSchema } from "./gates";

export const TIMING_WORKSPACE_VERSION = "ava-timing-workspace-v1" as const;
const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
const line = z.object({ c1: point, c2: point });

export const timingWorkspaceSchema = z.object({
  schemaVersion: z.literal(TIMING_WORKSPACE_VERSION),
  cameraType: calibrationCameraTypeSchema.default("stationary"),
  // The MVP calibration concept the coach chooses. Optional so legacy saved workspaces
  // (which only have `goal`) still parse; the UI derives it from `goal` when absent.
  // `goal`/`setupMode` are retained internally for backward compatibility and always
  // resolve to the manual marked-zone workflow.
  zoneType: z.enum(["acceleration", "timed_zone", "split_timing"]).optional(),
  goal: z.enum(["technique", "fly", "split", "custom"]),
  setupMode: z.enum(["marked_zone", "fixed_landmarks", "manual_crossing"]),
  distanceM: z.number().positive().nullable(),
  bodyReference: z.enum(["torso", "pelvis", "com", "front_foot", "rear_foot"]),
  overlays: z.object({
    pose: z.boolean(), skeleton: z.boolean(), gates: z.boolean(), landmarks: z.boolean(),
    confidence: z.boolean(), searchWindow: z.boolean(), tracking: z.boolean(), plane: z.boolean(),
    opacity: z.number().min(0).max(1),
  }),
  gates: z.object({
    start: line.nullable(), finish: line.nullable(),
  }),
  gateReview: z.object({
    start: z.object({ accepted: z.boolean(), locked: z.boolean() }),
    finish: z.object({ accepted: z.boolean(), locked: z.boolean() }),
  }),
  gateEvidence: z.object({
    start: z.object({
      source: z.enum(["unconfirmed", "manual_physical_line", "automatic_candidate"]),
      referenceType: z.enum(["white_tape", "painted_transverse_line", "unknown"]),
      userConfirmed: z.boolean(), frame: z.number().int().nonnegative().nullable(),
      automaticCandidate: line.nullable(), manualAdjustment: line.nullable(), finalLine: line.nullable(),
    }),
    finish: z.object({
      source: z.enum(["unconfirmed", "manual_physical_line", "automatic_candidate"]),
      referenceType: z.enum(["white_tape", "painted_transverse_line", "unknown"]),
      userConfirmed: z.boolean(), frame: z.number().int().nonnegative().nullable(),
      automaticCandidate: line.nullable(), manualAdjustment: line.nullable(), finalLine: line.nullable(),
    }),
  }),
  keyframes: z.array(z.object({
    id: z.string().min(1), gate: z.enum(["start", "finish"]), frame: z.number().int().nonnegative(),
    line, confidenceOverride: z.number().min(0).max(1).nullable(),
  })),
  manual: z.object({
    startBefore: z.number().int().nonnegative().nullable(),
    startAfter: z.number().int().nonnegative().nullable(),
    finishBefore: z.number().int().nonnegative().nullable(),
    finishAfter: z.number().int().nonnegative().nullable(),
    startInterpolation: z.number().min(0).max(1),
    finishInterpolation: z.number().min(0).max(1),
  }),
  timelineZoom: z.number().min(1).max(8),
  selectedGate: z.enum(["start", "finish"]),
});
export type TimingWorkspaceState = z.infer<typeof timingWorkspaceSchema>;

/**
 * The one readiness predicate for the user-authored Timing Workspace calibration.
 * A zone is ready to lock as soon as both complete gate lines and a positive known
 * distance exist. Gate review flags are presentation state; the authoritative save
 * stamps both gates confirmed/locked after this predicate passes.
 */
export function isTimingWorkspaceCalibrationComplete(
  state: Pick<TimingWorkspaceState, "gates" | "distanceM">,
): boolean {
  return Boolean(
    state.gates.start &&
      state.gates.finish &&
      state.distanceM != null &&
      Number.isFinite(state.distanceM) &&
      state.distanceM > 0,
  );
}

export const DEFAULT_TIMING_WORKSPACE: TimingWorkspaceState = {
  schemaVersion: TIMING_WORKSPACE_VERSION, cameraType: "stationary",
  zoneType: "timed_zone", goal: "fly", setupMode: "marked_zone",
  distanceM: 30, bodyReference: "torso",
  overlays: { pose: true, skeleton: true, gates: true, landmarks: false, confidence: true,
    searchWindow: false, tracking: true, plane: false, opacity: .9 },
  gates: { start: null, finish: null },
  gateReview: {
    start: { accepted: false, locked: false },
    finish: { accepted: false, locked: false },
  },
  gateEvidence: {
    start: { source: "unconfirmed", referenceType: "unknown", userConfirmed: false,
      frame: null, automaticCandidate: null, manualAdjustment: null, finalLine: null },
    finish: { source: "unconfirmed", referenceType: "unknown", userConfirmed: false,
      frame: null, automaticCandidate: null, manualAdjustment: null, finalLine: null },
  },
  keyframes: [],
  manual: { startBefore: null, startAfter: null, finishBefore: null, finishAfter: null,
    startInterpolation: .5, finishInterpolation: .5 },
  timelineZoom: 1, selectedGate: "start",
};

export type TimingWorkspaceExtension =
  | { kind: "line_detection"; frame: number; near: z.infer<typeof point> }
  | { kind: "gate_suggestion"; frame: number }
  | { kind: "crossing_validation"; gate: "start" | "finish" }
  | { kind: "hardware_timing"; provider: string };
