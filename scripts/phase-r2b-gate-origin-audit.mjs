// Phase R2B Parts B/C/D/F/G/L -- forensic geometry audit. Computes exact gate
// midpoints, running axis, and longitudinal coordinate behavior for all 4
// benchmarks from REAL, DB-fetched `calibration_gates` records (queried
// read-only; no row was mutated). Read-only, standalone. Does not change any
// production file. Mirrors measurements.ts's EXACT scale formula
// (`Math.abs(gateAX - gateBX) * frameWidth`, points.ax/bx = gate midpoint X)
// to prove/disprove equivalence with a proposed 2D running-axis model.
//
//   node scripts/phase-r2b-gate-origin-audit.mjs
import { mkdirSync, writeFileSync } from "node:fs";

// Real calibration_gates.startGate/finishGate, fetched read-only via the
// service-role client on 2026-08-10 (this phase). c1/c2 are normalized
// [0,1] SOURCE IMAGE coordinates (gatePointSchema). Both gates' `timeS` is
// 0 for all 4 benchmarks -- so any camera-shake pan correction
// (`gateWorldX`/`cameraOffsetAtTime`) is evaluated at the IDENTICAL
// timestamp for both gates and cancels exactly in `gateAX - gateBX`;
// confirmed by direct read of measurements.ts's `gateWorldX` closure, not
// assumed. This lets the audit use the raw midpoints directly without
// re-running the camera-motion estimator, for these specific real records.
const BENCHMARKS = {
  gav: {
    startGate: { c1: { x: 0.1420408195281125, y: 0.6089671184738956 }, c2: { x: 0.16119360253514062, y: 0.6051358210620259 }, timeS: 0 },
    finishGate: { c1: { x: 0.8680490189926372, y: 0.6058109753830134 }, c2: { x: 0.8881045013386881, y: 0.6083872527145618 }, timeS: 0 },
    distanceM: 20, zoneDistanceMeters: 20, travelDirection: "left_to_right", cameraType: "stationary", sourceFrameWidth: 1920, sourceFrameHeight: 1080,
  },
  vanni240: {
    startGate: { c1: { x: 0.11868775163071948, y: 0.5905273759393365 }, c2: { x: 0.15485712608902805, y: 0.5866713571723401 }, timeS: 0 },
    finishGate: { c1: { x: 0.86321751022625, y: 0.5860360308025133 }, c2: { x: 0.9006542876017971, y: 0.5898950726846557 }, timeS: 0 },
    distanceM: 20, zoneDistanceMeters: 20, travelDirection: "left_to_right", cameraType: "stationary", sourceFrameWidth: 1920, sourceFrameHeight: 1080,
  },
  vanni120: {
    startGate: { c1: { x: 0.08584763038887405, y: 0.5897019114720886 }, c2: { x: 0.1257019432518333, y: 0.5867222504572497 }, timeS: 0 },
    finishGate: { c1: { x: 0.8962367760703459, y: 0.5897210072779616 }, c2: { x: 0.9374899006026772, y: 0.5946142966848742 }, timeS: 0 },
    distanceM: 20, zoneDistanceMeters: 20, travelDirection: "left_to_right", cameraType: "stationary", sourceFrameWidth: 1920, sourceFrameHeight: 1080,
  },
  vanni60: {
    startGate: { c1: { x: 0.06066344488733875, y: 0.5950301919773306 }, c2: { x: 0.10219121368859639, y: 0.5900946520331392 }, timeS: 0 },
    finishGate: { c1: { x: 0.9240634953832747, y: 0.5964065327980851 }, c2: { x: 0.9684049657103354, y: 0.6032855603688843 }, timeS: 0 },
    distanceM: 20, zoneDistanceMeters: 20, travelDirection: "left_to_right", cameraType: "stationary", sourceFrameWidth: 1920, sourceFrameHeight: 1080,
  },
};

function gateMidpoint(bar) {
  return { x: (bar.c1.x + bar.c2.x) / 2, y: (bar.c1.y + bar.c2.y) / 2 };
}

const results = {};
for (const [label, g] of Object.entries(BENCHMARKS)) {
  const startMid = gateMidpoint(g.startGate);
  const finishMid = gateMidpoint(g.finishGate);
  const w = g.sourceFrameWidth;
  const h = g.sourceFrameHeight;

  // Real production formula (measurements.ts lines 656-667, verbatim): X-ONLY,
  // normalized-to-pixel via frameWidth, camera-shake term cancels (see header).
  const gateAX_px = startMid.x * w;
  const gateBX_px = finishMid.x * w;
  const productionPixelGapX = Math.abs(gateAX_px - gateBX_px);
  const productionMetersPerPixel = g.distanceM / productionPixelGapX;
  // By construction, distance(start,finish) under this scale is EXACTLY distanceM.
  const productionZoneLengthM = productionPixelGapX * productionMetersPerPixel;

  // Proposed Part F model: full 2D running axis between the two midpoints
  // (in PIXEL space, both X and Y), not X-only.
  const dx_px = (finishMid.x - startMid.x) * w;
  const dy_px = (finishMid.y - startMid.y) * h;
  const true2DPixelDistance = Math.hypot(dx_px, dy_px);
  const unitAxis = { x: dx_px / true2DPixelDistance, y: dy_px / true2DPixelDistance };
  // Using PRODUCTION's own metersPerPixel (X-only-derived) applied to the TRUE 2D distance:
  const true2DDistanceM_underProductionScale = true2DPixelDistance * productionMetersPerPixel;
  const divergenceM = true2DDistanceM_underProductionScale - g.distanceM;
  const gateTiltDeg = Math.atan2(dy_px, dx_px) * (180 / Math.PI);

  results[label] = {
    startGate: g.startGate,
    finishGate: g.finishGate,
    startMidpointNormalized: startMid,
    finishMidpointNormalized: finishMid,
    startMidpointPx: { x: gateAX_px, y: startMid.y * h },
    finishMidpointPx: { x: gateBX_px, y: finishMid.y * h },
    travelDirection: g.travelDirection,
    configuredZoneLengthM: g.distanceM,
    production: {
      formula: "metersPerPixel = distanceM / (|startMid.x - finishMid.x| * frameWidth)  [X-ONLY]",
      pixelGapX: productionPixelGapX,
      metersPerPixel: productionMetersPerPixel,
      zoneLengthM_byConstruction: productionZoneLengthM,
    },
    proposed2DAxisModel: {
      formula: "u = normalize(finishMid_px - startMid_px)  [2D, both X and Y]",
      dx_px, dy_px,
      true2DPixelDistance,
      unitAxis,
      gateTiltDegFromHorizontal: gateTiltDeg,
      true2DDistanceM_ifScaledByProductionMetersPerPixel: true2DDistanceM_underProductionScale,
      divergenceFromConfiguredZoneLengthM: divergenceM,
      divergencePct: (divergenceM / g.distanceM) * 100,
    },
  };
  console.log(`${label}: tilt=${gateTiltDeg.toFixed(4)}deg  productionZoneLen=${productionZoneLengthM.toFixed(6)}m  true2Dlen(at prod scale)=${true2DDistanceM_underProductionScale.toFixed(6)}m  divergence=${divergenceM.toFixed(6)}m (${((divergenceM/g.distanceM)*100).toFixed(4)}%)`);
}

mkdirSync("tmp/phaseR2B", { recursive: true });
writeFileSync("tmp/phaseR2B/benchmark-midpoints.json", JSON.stringify(results, null, 2));
console.log("\nWrote tmp/phaseR2B/benchmark-midpoints.json");
