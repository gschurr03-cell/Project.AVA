// Phase 5.0C (Part A) — full trace of the isolated spurious Vanni 240
// contact discovered during Phase 5.0B (source frame 964, right foot).
// Operates on the real, current Phase 5.0B production artifact — no
// reimplementation of any production algorithm.
//
//   node scripts/phase-5-0c-spurious-contact-audit.mjs

import { readFileSync, writeFileSync } from "node:fs";

const d = JSON.parse(readFileSync("tmp/phase50b-final/vanni240.pose.json", "utf8"));
const W = d.width, H = d.height, FPS = d.fps;
const frames = d.frames;

const TARGET = 964;
const WINDOW = 40; // frames either side, real source-time context

function px(kp, w, h) { return kp ? { x: kp.x * w, y: kp.y * h } : null; }

const rows = [];
for (let i = TARGET - WINDOW; i <= TARGET + WINDOW; i++) {
  if (i < 0 || i >= frames.length) continue;
  const f = frames[i];
  const kp = f.keypoints || {};
  const ra = kp.right_ankle, rh = kp.right_heel, rt = kp.right_toe;
  const la = kp.left_ankle, lh = kp.left_heel, lt = kp.left_toe;
  const w = f.sourceWidth || W, h = f.sourceHeight || H;
  const rY = [ra, rh, rt].filter((k) => k && (k.visibility ?? k.score) >= 0.4).map((k) => k.y);
  const meanRightY = rY.length ? rY.reduce((a, b) => a + b, 0) / rY.length : null;
  rows.push({
    sourceFrameIndex: f.sourceFrameIndex,
    tMs: f.tMs,
    boxOrigin: f.boxOrigin,
    localizationOrigin: f.localizationOrigin,
    localizationVerified: f.localizationVerified,
    localizationState: f.localizationState,
    scientificAthleteBox: f.scientificAthleteBox,
    cropRect: f.cropRect,
    cropContainmentState: f.cropContainmentState,
    right_ankle: ra ? { x: ra.x, y: ra.y, visibility: ra.visibility } : null,
    right_heel: rh ? { x: rh.x, y: rh.y, visibility: rh.visibility } : null,
    right_toe: rt ? { x: rt.x, y: rt.y, visibility: rt.visibility } : null,
    left_ankle: la ? { x: la.x, y: la.y, visibility: la.visibility } : null,
    left_heel: lh ? { x: lh.x, y: lh.y, visibility: lh.visibility } : null,
    left_toe: lt ? { x: lt.x, y: lt.y, visibility: lt.visibility } : null,
    meanRightFootY: meanRightY,
    coastRiskState: f.coastRiskState,
    localizationTerminationReason: f.localizationTerminationReason,
    timeSinceVerifiedDetectorMs: f.timeSinceVerifiedDetectorMs,
    distanceSinceVerifiedDetectorFrameWidths: f.distanceSinceVerifiedDetectorFrameWidths,
  });
}

// Foot velocity around the event (px/ms, real source-timestamp based).
let velocityRows = [];
for (let k = 1; k < rows.length; k++) {
  const a = rows[k - 1], b = rows[k];
  if (a.right_ankle && b.right_ankle && b.tMs > a.tMs) {
    const dx = (b.right_ankle.x - a.right_ankle.x) * W;
    const dy = (b.right_ankle.y - a.right_ankle.y) * H;
    const dt = b.tMs - a.tMs;
    velocityRows.push({ i: b.sourceFrameIndex, tMs: b.tMs, vxPxPerMs: dx / dt, vyPxPerMs: dy / dt, speedPxPerMs: Math.hypot(dx, dy) / dt });
  }
}

// Where does the box sit relative to the frame? (x in [0,1], right edge = 1.0)
const boxAtEvent = rows.find((r) => r.sourceFrameIndex === TARGET)?.scientificAthleteBox;
const boxRightEdgeNorm = boxAtEvent ? boxAtEvent.x + boxAtEvent.width : null;

const summary = {
  targetFrame: TARGET,
  targetTMs: rows.find((r) => r.sourceFrameIndex === TARGET)?.tMs,
  boxAtEvent,
  boxRightEdgeNorm,
  boxIsNearOrPastRightFrameEdge: boxRightEdgeNorm != null && boxRightEdgeNorm >= 0.98,
  localizationVerifiedAtEvent: rows.find((r) => r.sourceFrameIndex === TARGET)?.localizationVerified,
  localizationVerifiedThroughoutWindow: rows.every((r) => r.localizationVerified === false || r.localizationVerified == null),
  velocityRows: velocityRows.filter((v) => v.i >= TARGET - 8 && v.i <= TARGET + 8),
};

writeFileSync("tmp/phase50c-spurious-contact-trace.json", JSON.stringify({ summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
