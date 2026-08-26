// Day 104 (Part 7) sanity — the stationary-camera full-height gate/zone
// display (`src/lib/video/stationaryGateGeometry.ts`), which replaced the
// short cone-to-cone segment with a full-height vertical line + translucent
// zone tint for stationary recordings. These are pure geometry functions:
// VideoOverlay.tsx feeds them an already-authoritative, already-stabilized
// gate midpoint (`startG.mid`/`finishG.mid` — unchanged upstream), so this
// suite proves the DISPLAY change is purely visual and cannot itself alter
// the crossing geometry.
//
//   node scripts/stationary-gate-sanity.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const out = fs.mkdtempSync(path.join(os.tmpdir(), "ava-stationary-gate-"));
try {
  execFileSync("npx", [
    "tsc",
    "src/lib/video/stationaryGateGeometry.ts",
    "--outDir", out,
    "--module", "commonjs",
    "--target", "es2022",
    "--skipLibCheck",
    "--esModuleInterop",
    "--strict",
  ], { cwd: root, stdio: "pipe" });
  fs.writeFileSync(path.join(out, "package.json"), '{"type":"commonjs"}\n');
  const require = createRequire(import.meta.url);
  const { stationaryGateLine, stationaryZoneRect } = require(path.join(out, "stationaryGateGeometry.js"));

  let n = 0;
  const check = (name, fn) => { fn(); n += 1; console.log(`✓ ${name}`); };

  // 13. Full-height stationary gate rendering.
  check("13. a gate line spans the full picture height regardless of the gate's own original short-segment size", () => {
    const line = stationaryGateLine(123.4, 720);
    assert.equal(line.y0, 0);
    assert.equal(line.y1, 720);
  });
  check("13. the line's x position is exactly the supplied (already-authoritative) midpoint x — never recomputed or offset", () => {
    assert.equal(stationaryGateLine(88.5, 500).x, 88.5);
  });
  check("13. a different picture height changes only the line's extent, never its x position", () => {
    assert.equal(stationaryGateLine(50, 1080).x, stationaryGateLine(50, 240).x);
  });

  // 15. Tinted zone matches calibrated start/finish coordinates.
  check("15. the zone rect's left edge is the smaller of the two gate x positions (left-to-right travel)", () => {
    const zone = stationaryZoneRect(100, 400, 600);
    assert.equal(zone.x, 100);
    assert.equal(zone.width, 300);
  });
  check("15. the zone rect is order-independent — right-to-left travel (finish x < start x) produces the identical rect", () => {
    const ltr = stationaryZoneRect(100, 400, 600);
    const rtl = stationaryZoneRect(400, 100, 600);
    assert.deepEqual(rtl, ltr);
  });
  check("15. the zone rect spans the full picture height, matching the gate lines it sits between", () => {
    const zone = stationaryZoneRect(10, 90, 333);
    assert.equal(zone.y, 0);
    assert.equal(zone.height, 333);
  });
  check("15. degenerate (equal) gate positions never produce a negative-width rect", () => {
    const zone = stationaryZoneRect(200, 200, 400);
    assert.equal(zone.width, 0);
  });

  // 16. Gate visualization cannot change crossing geometry.
  check("16. these functions are pure — same input always yields the identical output object shape (no hidden state/time dependency)", () => {
    const a = stationaryGateLine(77, 400);
    const b = stationaryGateLine(77, 400);
    assert.deepEqual(a, b);
  });
  check("16. the geometry module exposes no calibration/crossing computation at all — display-only by construction", () => {
    const mod = require(path.join(out, "stationaryGateGeometry.js"));
    const exportedNames = Object.keys(mod);
    assert.deepEqual(exportedNames.sort(), ["stationaryGateLine", "stationaryZoneRect"]);
  });

  console.log(`\n${n}/${n} stationary-gate-geometry checks passed`);
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}
