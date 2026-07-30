// Unit tests for the Timing Workspace viewport transform (pure math).
//   node scripts/viewport-transform-sanity.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".viewport-transform-tmp");
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
execFileSync("npx", ["tsc", "src/lib/calibration/viewportTransform.ts", "--outDir", out, "--module", "commonjs", "--target", "es2022", "--skipLibCheck"], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
const V = require(path.join(out, "viewportTransform.js"));
const coordinatesOut = path.join(out, "coordinates");
mkdirSync(coordinatesOut, { recursive: true });
execFileSync("npx", ["tsc", "src/lib/video/coordinates.ts", "--outDir", coordinatesOut, "--module", "commonjs", "--target", "es2022", "--skipLibCheck"], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
const C = require(path.join(coordinatesOut, "coordinates.js"));

let ok = true;
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
const check = (label, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) ok = false; };

for (const [w, h, name] of [[1280, 720, "16:9"], [720, 1280, "portrait"], [1000, 543, "nonstandard"]]) {
  // Round-trip across the full zoom range + assorted translations.
  let roundTrip = true;
  for (const scale of [1, 1.25, 2, 3, 4, 6, 8]) {
    for (const [tx, ty] of [[0, 0], [-100, -50], [w * (1 - scale), h * (1 - scale)]]) {
      const vp = { scale, tx, ty, width: w, height: h };
      for (const [nx, ny] of [[0, 0], [0.5, 0.5], [1, 1], [0.152227, 0.6105]]) {
        const p = V.canonicalToViewport(nx, ny, vp);
        const c = V.viewportToCanonical(p.x, p.y, vp);
        if (!near(c.x, nx) || !near(c.y, ny)) roundTrip = false;
      }
    }
  }
  check(`${name}: canonical↔viewport round-trip exact through 800%`, roundTrip);
}

const vp0 = V.fitViewport(1280, 720);
check("fit is scale 1, no translation", vp0.scale === 1 && vp0.tx === 0 && vp0.ty === 0);

// Pointer-centred zoom: the canonical point under the pointer stays under the pointer.
const anchor = { x: 400, y: 250 };
const before = V.viewportToCanonical(anchor.x, anchor.y, vp0);
const zoomed = V.zoomAtPoint(vp0, 4, anchor.x, anchor.y);
const after = V.viewportToCanonical(anchor.x, anchor.y, zoomed);
check(`pointer-centred zoom keeps the anchored point fixed (Δ<1e-9)`, near(before.x, after.x) && near(before.y, after.y));
check(`zoom scale applied (=4)`, zoomed.scale === 4);

// Repeated pointer zoom is stable.
let v = vp0;
for (let i = 0; i < 20; i++) v = V.zoomAtPoint(v, v.scale * 1.1, anchor.x, anchor.y);
const anchoredAfterRepeat = V.viewportToCanonical(anchor.x, anchor.y, v);
check(`repeated pointer zoom stays anchored`, near(before.x, anchoredAfterRepeat.x, 1e-6) && near(before.y, anchoredAfterRepeat.y, 1e-6));

// Clamps.
check(`scale clamps to [1,8]`, V.clampScale(0.2) === 1 && V.clampScale(50) === 8);
const overPanned = V.clampTranslation({ scale: 2, tx: 9999, ty: -9999, width: 1280, height: 720 });
check(`translation clamped so video stays covering the stage`,
  overPanned.tx === 0 && overPanned.ty === 720 * (1 - 2));
check(`at fit (scale 1) translation clamps to 0`, (() => { const c = V.clampTranslation({ scale: 1, tx: 200, ty: 200, width: 1280, height: 720 }); return c.tx === 0 && c.ty === 0; })());

// Stepped zoom.
check(`stepZoom in from 1 → 1.25`, V.stepZoom(1, 1) === 1.25);
check(`stepZoom in from 2 → 3`, V.stepZoom(2, 1) === 3);
check(`stepZoom out from 3 → 2`, V.stepZoom(3, -1) === 2);
check(`stepZoom in clamps at 8`, V.stepZoom(8, 1) === 8);
check(`stepZoom out clamps at 1`, V.stepZoom(1, -1) === 1);

// Resize keeps the centre canonical point stable.
const zoomedCentre = V.zoomAtPoint(V.fitViewport(1280, 720), 4, 640, 360); // centre
const resized = V.resizeViewport(zoomedCentre, 900, 506);
const cBefore = V.viewportToCanonical(640, 360, zoomedCentre);
const cAfter = V.viewportToCanonical(450, 253, resized);
check(`resize keeps the centred canonical point stable`, near(cBefore.x, cAfter.x, 1e-6) && near(cBefore.y, cAfter.y, 1e-6));

// Regression: a stationary gate is always projected from its immutable original-source
// coordinate. Athlete positions are deliberately not accepted by this API, so athlete
// motion alone cannot move or accumulate error onto a gate.
const source = { width: 1920, height: 1080 };
const finish = Object.freeze({ x: 0.879884854403409, y: 0.6080552925084175 });
const fullCrop = { x: 0, y: 0, width: source.width, height: source.height };
const athletePositions = [0.07, 0.29, 0.51, 0.73, 0.96];
const stationary = athletePositions.map(() => C.projectSourcePointToDisplay({
  point: finish,
  sourceWidth: source.width,
  sourceHeight: source.height,
  sourceCrop: fullCrop,
  displayRect: { x: 0, y: 0, width: 1100, height: 618.75 },
  fitMode: "contain",
}));
check("athlete movement cannot alter a stationary gate projection",
  stationary.every((p) => near(p.x, stationary[0].x) && near(p.y, stationary[0].y)));
check("stationary projection does not mutate the saved gate",
  finish.x === 0.879884854403409 && finish.y === 0.6080552925084175);

// Current-crop changes are resolved directly from the immutable source coordinate,
// never from the previous projected point. These expected values also cover crop
// offset sign and cropped-width normalization.
const cropStates = [
  { crop: fullCrop, expectedX: finish.x * 1100 },
  { crop: { x: 480, y: 0, width: 960, height: 1080 }, expectedX: (finish.x * 1920 - 480) * (618.75 / 1080) + 275 },
  { crop: { x: 960, y: 0, width: 960, height: 1080 }, expectedX: (finish.x * 1920 - 960) * (618.75 / 1080) + 275 },
];
const cropped = cropStates.map(({ crop }) => C.projectSourcePointToDisplay({
  point: finish, sourceWidth: source.width, sourceHeight: source.height,
  sourceCrop: crop, displayRect: { x: 0, y: 0, width: 1100, height: 618.75 }, fitMode: "contain",
}));
check("each crop projects from the immutable source point with the correct offset",
  cropped.every((p, i) => near(p.x, cropStates[i].expectedX, 1e-6)));
const replayed = [...cropStates].reverse().map(({ crop }) => C.projectSourcePointToDisplay({
  point: finish, sourceWidth: source.width, sourceHeight: source.height,
  sourceCrop: crop, displayRect: { x: 0, y: 0, width: 1100, height: 618.75 }, fitMode: "contain",
})).reverse();
check("forward/backward crop traversal has zero accumulated drift",
  replayed.every((p, i) => near(p.x, cropped[i].x) && near(p.y, cropped[i].y)));

rmSync(out, { recursive: true, force: true });
console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
process.exit(ok ? 0 : 1);
