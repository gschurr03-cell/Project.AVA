import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const overlay = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
const anchors = readFileSync(path.join(root, "src/lib/calibration/zoneAnchors.ts"), "utf8");
const gates = readFileSync(path.join(root, "src/lib/calibration/gates.ts"), "utf8");
const measurements = readFileSync(path.join(root, "src/lib/benchmark/measurements.ts"), "utf8");
const migration = readFileSync(path.join(root, "supabase/migrations/0028_independent_timing_gates.sql"), "utf8");

assert.doesNotMatch(overlay, /zoneShade|9\s*\/\s*savedGates\.distanceM/,
  "consumer overlay creates no connected zone surface");
assert.doesNotMatch(overlay, /lineTo\(finishG\.mid|lineTo\(startG\.mid/,
  "start and finish geometry is never joined");
assert.match(overlay, /sourceLineIntersectsViewport/,
  "each gate is independently hidden when its rigid segment is offscreen");
// A gate whose camera-transform chain is unsafe must never be drawn at all (not even
// in a "warning" color) — only a non-positional status note. strokeBar is called only
// on the safe branch; the unsafe branch shows a distinct message instead.
assert.match(overlay, /if \(startG\.safe === false\) drawLabel\(ctx, "Start gate: tracking unavailable"/);
assert.match(overlay, /else strokeBar\(startG, COLORS\.calibration, "Start"\)/);
assert.match(overlay, /if \(finishG\.safe === false\) drawLabel\(ctx, "Finish gate: tracking unavailable"/);
assert.match(overlay, /else strokeBar\(finishG, COLORS\.calibration, "Finish"\)/);
assert.match(anchors, /sourceLineIntersectsViewport/);
assert.match(anchors, /gateId/);
assert.match(anchors, /physicalLineOrientationDeg/);
assert.match(anchors, /immutableVersion/);
assert.match(gates, /zoneDistanceMeters/);
assert.match(gates, /connectedZoneVisualizationDeprecated/);
assert.match(measurements, /detectWorldBoundaryCrossing\(samples, anchoredZone\.startBoundary/);
assert.match(measurements, /detectWorldBoundaryCrossing\(samples, anchoredZone\.finishBoundary/);
assert.doesNotMatch(measurements, /polygon|pointInPolygon|insidePolygon/i,
  "crossing does not depend on polygon containment");
assert.match(migration, /No connected polygon\/corridor geometry is stored or required/);
assert.match(gates, /startBoundary: groundBoundarySchema\.optional/,
  "legacy records without new independent boundary fields remain readable");
console.log("independent gates sanity: passed");
