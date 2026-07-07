import type { OverlayFrame, OverlayPoint } from "@/lib/video/overlay";

export const HAND_LEAVE_GROUND = "hand_leave_ground" as const;

export interface HandLeaveGroundEvent {
  type: typeof HAND_LEAVE_GROUND;
  status: "detected" | "needs_review";
  frame: number | null;
  timeS: number | null;
  confidence: number;
  reason: string;
}

const visible = (point?: OverlayPoint): point is OverlayPoint =>
  !!point && (point.visibility ?? 1) >= 0.5;

const points = (frame: OverlayFrame, names: string[]) =>
  names.map((name) => frame.landmarks[name]).filter(visible);

/**
 * Detect the first sustained frame after a visibly grounded starting hand is no
 * longer on the ground. This event — never torso/hip motion or a first step — is
 * acceleration t=0. Ambiguous footage returns needs_review rather than guessing.
 */
export function detectHandLeaveGround(frames: OverlayFrame[]): HandLeaveGroundEvent {
  const review = (reason: string): HandLeaveGroundEvent => ({
    type: HAND_LEAVE_GROUND,
    status: "needs_review",
    frame: null,
    timeS: null,
    confidence: 0,
    reason,
  });
  if (frames.length < 6) return review("Not enough tracked frames to verify hand release.");

  const observations = frames.map((frame) => {
    const hands = points(frame, ["leftWrist", "rightWrist"]);
    const groundPoints = points(frame, [
      "leftAnkle",
      "rightAnkle",
      "leftHeel",
      "rightHeel",
      "leftFootIndex",
      "rightFootIndex",
    ]);
    const head = points(frame, ["nose"])[0];
    if (!hands.length || !groundPoints.length) return null;
    const groundY = Math.max(...groundPoints.map((point) => point.y));
    const bodyHeight = head ? Math.max(0.1, groundY - head.y) : 0.35;
    const contactTolerance = Math.max(0.012, bodyHeight * 0.06);
    const releaseClearance = Math.max(0.02, bodyHeight * 0.1);
    const minHandClearance = Math.min(...hands.map((hand) => groundY - hand.y));
    return {
      frame,
      grounded: hands.some((hand) => Math.abs(groundY - hand.y) <= contactTolerance),
      released: minHandClearance >= releaseClearance,
      visibility:
        [...hands, ...groundPoints].reduce((sum, p) => sum + (p.visibility ?? 1), 0) /
        (hands.length + groundPoints.length),
    };
  });

  let groundedRun = 0;
  let bestGroundedRun = 0;
  for (let i = 0; i < observations.length; i++) {
    const observation = observations[i];
    groundedRun = observation?.grounded ? groundedRun + 1 : 0;
    bestGroundedRun = Math.max(bestGroundedRun, groundedRun);
    if (bestGroundedRun < 3 || !observation?.released) continue;
    const sustained = observations.slice(i, i + 3);
    if (sustained.length < 3 || !sustained.every((item) => item?.released)) continue;
    const confidence = Math.min(
      1,
      observation.visibility * 0.7 + Math.min(bestGroundedRun / 6, 1) * 0.3,
    );
    if (confidence < 0.7) return review("Hand release was visible but confidence was too low.");
    return {
      type: HAND_LEAVE_GROUND,
      status: "detected",
      frame: observation.frame.frame,
      timeS: observation.frame.time,
      confidence,
      reason: "A grounded hand was followed by sustained visible hand clearance.",
    };
  }
  return review(
    bestGroundedRun >= 3
      ? "Grounded hands were visible, but a sustained release could not be confirmed."
      : "A grounded starting hand could not be confidently identified.",
  );
}
