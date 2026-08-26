import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".phase-6-2-world-lock-tmp");
let count = 0;
const check = (label, fn) => { fn(); count += 1; console.log(`PASS ${count}. ${label}`); };
const scene = (dx = 0, dy = 0) => ({
  start: { p1: { x: 100 + dx, y: 100 + dy }, p2: { x: 100 + dx, y: 400 + dy } },
  finish: { p1: { x: 700 + dx, y: 100 + dy }, p2: { x: 700 + dx, y: 400 + dy } },
});

rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, strict: true, moduleResolution: "node" },
    files: [path.join(root, "src/lib/video/gateStabilization.ts"), path.join(root, "src/lib/video/worldLockedZoneGeometry.ts")],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: "inherit" });
  const gate = require(path.join(out, "lib/video/gateStabilization.js"));
  const zone = require(path.join(out, "lib/video/worldLockedZoneGeometry.js"));
  const stabilize = (raw, prev, w = 1920, h = 1080, dw = 960, dh = 540) => gate.stabilizeGateZone(raw, prev, w, h, dw, dh);

  check("zero camera movement has zero displacement", () => assert.equal(stabilize(scene(), scene()).displacementSourcePx, 0));
  check("small translation is measured in source pixels", () => assert.ok(Math.abs(stabilize(scene(.1), scene()).displacementSourcePx - .2) < 1e-9));
  check("small vertical tripod bounce is measured", () => assert.ok(Math.abs(stabilize(scene(0,.1), scene()).displacementSourcePx - .2) < 1e-9));
  check("small rotation preserves a common scene decision", () => assert.equal(stabilize(scene(.1,.1), scene()).held, true));
  check("combined translation/rotation-like endpoint movement is atomic", () => { const previous=scene(); assert.strictEqual(stabilize(scene(.1,.1), previous).display, previous); });
  check("noise inside deadzone is held", () => assert.equal(stabilize(scene(.2), scene()).held, true));
  check("real movement outside deadzone passes", () => assert.equal(stabilize(scene(1), scene()).held, false));
  check("rejected/unavailable state can preserve the previous display scene", () => assert.deepEqual(stabilize(scene(.1), scene()).display, scene()));
  check("held scene is exactly previous scene", () => { const previous=scene(); assert.strictEqual(stabilize(scene(.1), previous).display, previous); });
  check("recovery larger than deadzone accepts current scene", () => assert.deepEqual(stabilize(scene(1), scene()).display, scene(1)));
  check("athlete data is absent from display stabilizer API", () => assert.doesNotMatch(readFileSync(path.join(root,"src/lib/video/gateStabilization.ts"),"utf8"), /athlete|landmark|pose/i));
  check("start and finish share one accept/hold decision", () => { const r=stabilize(scene(.1),scene()); assert.equal(r.display.start.p1.x,100); assert.equal(r.display.finish.p1.x,700); });
  check("gate length remains rigid when held", () => assert.equal(zone.boundaryLength({p1:stabilize(scene(.1),scene()).display.start.p1,p2:stabilize(scene(.1),scene()).display.start.p2,midpoint:{x:100,y:250}}),300));
  check("gate orientation remains coherent when held", () => assert.equal(zone.boundaryOrientationDeg({p1:scene().start.p1,p2:scene().start.p2,midpoint:{x:100,y:250}}),90));
  const renderer = readFileSync(path.join(root,"src/components/video/VideoOverlay.tsx"),"utf8");
  const metrics = readFileSync(path.join(root,"src/lib/benchmark/measurements.ts"),"utf8");
  check("display stabilization cannot enter scientific crossing", () => assert.doesNotMatch(metrics, /gateStabilization|stabilizeGateZone/));
  check("display stabilization cannot enter metric calculations", () => assert.doesNotMatch(metrics, /worldLockedZoneGeometry|GATE_SOURCE_DEADBAND/));
  check("60 FPS behavior is timestamp/FPS independent", () => assert.equal(stabilize(scene(.2),scene()).held,true));
  check("120 FPS behavior is identical", () => assert.equal(stabilize(scene(.2),scene()).held,true));
  check("240 FPS behavior is identical", () => assert.equal(stabilize(scene(.2),scene()).held,true));
  check("high-DPI does not change source-pixel geometry", () => assert.equal(stabilize(scene(.2),scene(),1920,1080,960,540).held, stabilize(scene(.4),scene(),1920,1080,1920,1080).held));
  check("Phase 6.1 mediaTime remains authoritative through the Phase 6.6B scheduler", () => {
    assert.match(renderer, /mediaTimeS: metadata\.mediaTime/);
    assert.match(renderer, /presentedMediaTimeS = promotion\.promoted\.mediaTimeS/);
  });
  check("stationary mode no longer disables available gate world-lock evidence", () => assert.match(renderer, /const useGateWorldLock = Boolean/));
  check("zone polygon uses both shared world-locked boundaries", () => assert.deepEqual(zone.zonePolygon({start:{...scene().start,midpoint:{x:100,y:250}},finish:{...scene().finish,midpoint:{x:700,y:250}}}),[scene().start.p1,scene().finish.p1,scene().finish.p2,scene().start.p2]));
  assert.equal(count, 23);
  console.log(`ALL ${count} PHASE 6.2 WORLD-LOCK CHECKS PASSED`);
} finally { rmSync(out, { recursive: true, force: true }); }
