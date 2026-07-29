import { z } from "zod";
import { sourceLineIntersectsViewport, type SourcePoint } from "./zoneAnchors";

export const LOCAL_GATE_TRACKER_VERSION = "ava-local-gate-tracker-v1" as const;
export const localGateStateSchema = z.enum(["locked", "limited", "lost"]);
const pointSchema = z.object({ x: z.number(), y: z.number() });
const lineSchema = z.object({ c1: pointSchema, c2: pointSchema });
export const localGateFrameSchema = z.object({
  frameIndex: z.number().int().nonnegative(), state: localGateStateSchema,
  finalLine: lineSchema.nullable(), confidence: z.number().min(0).max(1),
  appearanceScore: z.number().min(0).max(1), forwardBackwardErrorPx: z.number().nonnegative(),
  correctionResidualPx: z.number().nonnegative(), midpointVelocityPx: z.number().nonnegative(),
  angularVelocityDeg: z.number().nonnegative(), scaleChange: z.number().nonnegative(),
  render: z.boolean(), timingEligible: z.boolean(), reasonCodes: z.array(z.string()),
}).superRefine((value, context) => {
  if (value.state !== "locked" && value.timingEligible)
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Only locally locked gates are timing eligible." });
  if (value.state === "lost" && (value.render || value.finalLine != null))
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Lost gates must be hidden." });
});
export const localGateLockSchema = z.object({
  trackerVersion: z.literal(LOCAL_GATE_TRACKER_VERSION), gateId: z.string().min(1),
  lockVersion: z.enum(["ava-start-line-lock-v1", "ava-finish-line-lock-v1"]),
  frames: z.array(localGateFrameSchema),
});
export type LocalGateFrame = z.infer<typeof localGateFrameSchema>;

export function lockedLineForTiming(frame: LocalGateFrame): { c1: SourcePoint; c2: SourcePoint } | null {
  if (frame.state !== "locked" || !frame.timingEligible || !frame.finalLine) return null;
  return sourceLineIntersectsViewport(frame.finalLine.c1, frame.finalLine.c2) ? frame.finalLine : null;
}
