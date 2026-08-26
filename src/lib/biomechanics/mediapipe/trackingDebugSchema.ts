import { z } from "zod";

/**
 * Stationary-camera athlete-tracking debug artifact (Day 95 audit, Part 5).
 * Built by the Python athlete tracker (`athlete_tracker.py` +
 * `build_tracking_debug_artifact` in `mediapipe_pose_runner.py`) and carried
 * through unchanged — this schema only validates the shape, it never
 * recomputes anything.
 *
 * `identityState` carries one of TWO vocabularies depending on which tracker
 * produced the frame: the Day 95 `AthleteTracker` fallback path (Day 101:
 * now a multi-stage acquisition — see `athlete_tracker.py`'s module
 * docstring) emits `searching | candidate | verifying | tracked |
 * reacquiring | terminated`; the Day 96 `AthleteBoxTracker` (box_tracker.py)
 * path — the one production actually runs — emits its own richer
 * `acquiring | verified | tracking | reacquiring | lost | terminated` and
 * never surfaces the Day 101 pre-lock states directly (it only reads
 * `AthleteTracker`'s `selectedIndex`, not its `identityState`). Both
 * vocabularies are accepted here since either may appear per-run.
 */
const cropRectSchema = z.object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() });
const rejectedCandidateSchema = z.object({
  reason: z.string().nullable(),
  score: z.number().nullable().optional(),
});

/**
 * Day 104 (Part 3): where a frame's box actually came from. `backward_detection`
 * is a real, verified MediaPipe detection recovered by `athlete_tracker.py`'s
 * `track_backward()` walking from the first identity lock toward frame 0 —
 * never a prediction. `predicted_only` / `invalid` frames carry no localization
 * evidence and must never render a skeleton or contribute a contact.
 */
export const boxProvenanceSchema = z.enum([
  "forward_detection",
  "forward_reacquired",
  "forward_tracking",
  "backward_detection",
  "predicted_only",
  "invalid",
  // Phase 4.2/4.2B (2026-08-05): a frame that WAS tracked with real
  // optical-flow evidence at the time, but that box_tracker.py's own
  // stationary-lock detector later retroactively proved had settled onto
  // near-static structure instead of the real, moving athlete (see
  // box_tracker.py's `_resolve_freeze_run`). Distinct from "invalid" (no
  // evidence at all) for honest developer diagnostics — must still never
  // render a skeleton or contribute a contact, exactly like "invalid".
  "frozen_suspect",
]);

export const trackingDebugFrameSchema = z.object({
  frame: z.number().int().nonnegative(),
  identityState: z.enum([
    "acquiring", "tracked", "reacquiring", "terminated", // Day 95 AthleteTracker (pre-Day-101)
    "searching", "candidate", "verifying", // Day 101 AthleteTracker multi-stage acquisition
    "verified", "tracking", "lost", // Day 96 AthleteBoxTracker (also shares acquiring/reacquiring/terminated)
  ]),
  verified: z.boolean(),
  identitySwitch: z.boolean(),
  configuredDirection: z.enum(["left_to_right", "right_to_left", "auto"]),
  candidateCount: z.number().int().nonnegative(),
  rejectedCandidates: z.array(rejectedCandidateSchema),
  selectedScore: z.number().nullable().optional(),
  cropRect: cropRectSchema,
  headInCrop: z.boolean().nullable(),
  pelvisInCrop: z.boolean().nullable(),
  feetInCrop: z.boolean().nullable(),
  boxProvenance: boxProvenanceSchema.nullable().optional(),
});

export const trackingDebugSummarySchema = z.object({
  totalFrames: z.number().int().nonnegative(),
  poseValidFrames: z.number().int().nonnegative(),
  poseValidPct: z.number().min(0).max(100),
  longestContinuousTrackFrames: z.number().int().nonnegative(),
  identitySwitches: z.number().int().nonnegative(),
  reacquisitions: z.number().int().nonnegative(),
  directionRejectedCandidates: z.number().int().nonnegative(),
  framesFeetOutsideCrop: z.number().int().nonnegative(),
  framesHeadOutsideCrop: z.number().int().nonnegative(),
  framesPelvisOutsideCrop: z.number().int().nonnegative(),
  backwardRecoveredFrames: z.number().int().nonnegative().optional(),
});

/**
 * Day 104 (Part 2/3): diagnostics from `athlete_tracker.py::track_backward` —
 * always present when a lock happened and there was pre-lock evidence to
 * walk, even when zero frames were recovered (a real, honest "stopped
 * immediately" result, not omitted).
 */
export const backwardRecoverySchema = z.object({
  anchorFrame: z.number().int().nonnegative(),
  minFrame: z.number().int().nonnegative(),
  stopFrame: z.number().int().nonnegative().nullable(),
  stopReason: z.string(),
  recoveredFrameCount: z.number().int().nonnegative(),
  firstRecoveredFrame: z.number().int().nonnegative().nullable(),
  lastRecoveredFrame: z.number().int().nonnegative().nullable(),
  rejectedSamples: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const trackingDebugArtifactSchema = z.object({
  schemaVersion: z.literal("ava-tracking-debug-v1"),
  frames: z.array(trackingDebugFrameSchema),
  summary: trackingDebugSummarySchema,
  backwardRecovery: backwardRecoverySchema.optional(),
});
export type TrackingDebugArtifact = z.infer<typeof trackingDebugArtifactSchema>;
