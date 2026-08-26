/**
 * Evidence heatmap (Day 100, Part 6) — a per-frame summary of exactly what
 * evidence existed at every point in a run, so "why does measurement begin
 * where it does" has a direct, inspectable answer instead of requiring a
 * fresh investigation each time.
 *
 * Pure and deterministic: built entirely from data already computed
 * upstream (the pose artifact's `OverlayFrame[]` plus the calibration-
 * independent full-run contact stream) — no new pose inference, no new
 * tracking, no fabricated values. A field that cannot be honestly computed
 * from what's available at this layer is `null`, not estimated.
 */

import type { OverlayFrame } from "./overlay";
import type { FullRunEvents } from "./events";

const VISIBLE_FLOOR = 0.4;

export interface EvidenceHeatmapFrame {
  frame: number;
  sourceFrameIndex: number;
  timeS: number;
  /** Mean visibility across every landmark present this frame (0 if none). */
  poseConfidence: number;
  /** Mean visibility across the 6 foot-specific landmarks (0 if none present). */
  footConfidence: number;
  /** Fraction of the 33 canonical landmarks present at visibility >= 0.4. */
  landmarkCompleteness: number;
  leftAnkleVisible: boolean;
  rightAnkleVisible: boolean;
  leftHeelVisible: boolean;
  rightHeelVisible: boolean;
  leftFootIndexVisible: boolean;
  rightFootIndexVisible: boolean;
  bothFeetVisible: boolean;
  /** This frame's own foot-landmark confidence IF it is a detected full-run
   *  contact; null otherwise (most frames are not a contact). `StepMark`
   *  carries no confidence field of its own — the contact's evidence
   *  strength is the same foot-landmark visibility that qualified it as a
   *  contact in the first place, so that is what is reported here rather
   *  than inventing a second, separate confidence figure. */
  contactConfidence: number | null;
  /** The box tracker's own per-frame confidence (optical-flow inlier ratio
   *  or detector score) — `OverlayFrame.trackingConfidence` passed through. */
  trackingConfidence: number | null;
  /**
   * Crop containment (whether the athlete's full extent stayed inside the
   * crop MediaPipe was run on) is NOT computable at this layer — the raw
   * pose artifact's `cropRect`/`athleteBoundingBoxSource` fields are not
   * currently threaded through `OverlayFrame`. Always null here; documented
   * as a known gap (see Day 100 report) rather than estimated from a proxy.
   */
  cropContainment: null;
  boxOrigin: OverlayFrame["boxOrigin"] | null;
  trackState: OverlayFrame["trackState"] | null;
}

function visible(p: { visibility?: number } | undefined): boolean {
  return p != null && (p.visibility ?? 1) >= VISIBLE_FLOOR;
}

function meanVisible(points: Array<{ visibility?: number } | undefined>): number {
  const present = points.filter((p): p is { visibility?: number } => p != null);
  if (present.length === 0) return 0;
  const sum = present.reduce((acc, p) => acc + (p.visibility ?? 1), 0);
  return sum / present.length;
}

/** Build the per-frame evidence heatmap for a full run. `fullRun` is
 *  optional — pass the same `buildFullRunEvents(frames)` result the
 *  measurement engine already computes so `contactConfidence` reflects real,
 *  already-detected contacts rather than re-deriving them here. */
export function buildEvidenceHeatmap(
  frames: OverlayFrame[],
  fullRun?: Pick<FullRunEvents, "contacts">,
): EvidenceHeatmapFrame[] {
  const contactBySourceFrame = new Map(
    (fullRun?.contacts ?? []).map((c) => [c.sourceFrameIndex, c]),
  );
  return frames.map((f) => {
    const sourceFrameIndex = f.sourceFrameIndex ?? f.frame;
    const lm = f.landmarks ?? {};
    const footPoints = [lm.leftAnkle, lm.leftHeel, lm.leftFootIndex, lm.rightAnkle, lm.rightHeel, lm.rightFootIndex];
    const allPoints = Object.values(lm);
    const presentAny = allPoints.filter((p) => visible(p));
    const leftAnkleVisible = visible(lm.leftAnkle);
    const rightAnkleVisible = visible(lm.rightAnkle);
    const leftHeelVisible = visible(lm.leftHeel);
    const rightHeelVisible = visible(lm.rightHeel);
    const leftFootIndexVisible = visible(lm.leftFootIndex);
    const rightFootIndexVisible = visible(lm.rightFootIndex);
    const leftFootAny = leftAnkleVisible || leftHeelVisible || leftFootIndexVisible;
    const rightFootAny = rightAnkleVisible || rightHeelVisible || rightFootIndexVisible;
    const isContact = contactBySourceFrame.has(sourceFrameIndex);
    const footConfidence = meanVisible(footPoints);
    return {
      frame: f.frame,
      sourceFrameIndex,
      timeS: f.time,
      poseConfidence: meanVisible(allPoints),
      footConfidence,
      landmarkCompleteness: presentAny.length / 33,
      leftAnkleVisible,
      rightAnkleVisible,
      leftHeelVisible,
      rightHeelVisible,
      leftFootIndexVisible,
      rightFootIndexVisible,
      bothFeetVisible: leftFootAny && rightFootAny,
      contactConfidence: isContact ? footConfidence : null,
      trackingConfidence: f.trackingConfidence ?? null,
      cropContainment: null,
      boxOrigin: f.boxOrigin ?? null,
      trackState: f.trackState ?? null,
    };
  });
}

/** Summary rollup (Part 6: "should immediately explain why measurements
 *  begin where they do") — the first frame each evidence tier becomes true,
 *  so a human or the UI can answer "why here" in one lookup. */
export interface EvidenceHeatmapSummary {
  firstPoseFrame: number | null;
  firstFootEvidenceFrame: number | null;
  firstBothFeetVisibleFrame: number | null;
  firstContactFrame: number | null;
  lastContactFrame: number | null;
}

export function summarizeEvidenceHeatmap(heatmap: EvidenceHeatmapFrame[]): EvidenceHeatmapSummary {
  const find = (pred: (f: EvidenceHeatmapFrame) => boolean): number | null =>
    heatmap.find(pred)?.sourceFrameIndex ?? null;
  const findLast = (pred: (f: EvidenceHeatmapFrame) => boolean): number | null => {
    for (let i = heatmap.length - 1; i >= 0; i--) {
      if (pred(heatmap[i])) return heatmap[i].sourceFrameIndex;
    }
    return null;
  };
  return {
    firstPoseFrame: find((f) => f.poseConfidence > 0),
    firstFootEvidenceFrame: find((f) => f.footConfidence > 0),
    firstBothFeetVisibleFrame: find((f) => f.bothFeetVisible),
    firstContactFrame: find((f) => f.contactConfidence != null),
    lastContactFrame: findLast((f) => f.contactConfidence != null),
  };
}
