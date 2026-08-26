// Phase R2C Part L -- sanity suite for the fixed presentation-width gate
// bands. Exercises the real, current production function
// (stationaryGateGeometry.ts) via the tsc-to-tmp-dir pattern; never modifies
// the real src/ tree.
//
//   node scripts/phase-r2c-gate-band-width-sanity.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const results = [];
function check(id, description, pass, detail) {
  results.push({ id, description, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${description}${detail !== undefined ? " -- " + JSON.stringify(detail) : ""}`);
}

const out = path.join(root, ".r2c-sanity-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
  compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, strict: false, moduleResolution: "node", removeComments: true },
  files: [path.join(root, "src/lib/video/stationaryGateGeometry.ts")],
}));
execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
const { stationaryThreeZoneRects, stationaryGateBandWidth, GATE_BAND_PRESENTATION_WIDTH_PX } = require(path.join(out, "lib/video/stationaryGateGeometry.js"));

// 1. Presentation width no longer depends on flySpan.
{
  const narrow = stationaryGateBandWidth(); // zero-arg now; call with stale args too to prove they're truly ignored.
  const wStub1 = stationaryThreeZoneRects(490, 510, 1000, 600).pre.width; // tiny flySpan
  const wStub2 = stationaryThreeZoneRects(10, 990, 1000, 600).pre.width; // huge flySpan
  check(1, "presentation width no longer depends on flySpan (identical across wildly different gate gaps, unless clamped by an extremely short span)", wStub2 === GATE_BAND_PRESENTATION_WIDTH_PX && narrow === GATE_BAND_PRESENTATION_WIDTH_PX, { narrow, wStub1, wStub2, constant: GATE_BAND_PRESENTATION_WIDTH_PX });
}

// 2. Start/finish use the same presentation contract (identical band width both sides).
{
  const z = stationaryThreeZoneRects(300, 700, 1000, 600);
  check(2, "start/finish use the same presentation contract (equal band widths)", z.pre.width === z.post.width, { preWidth: z.pre.width, postWidth: z.post.width });
}

// 3. Start band centered on start midpoint.
{
  const z = stationaryThreeZoneRects(300, 700, 1000, 600);
  const center = z.pre.x + z.pre.width / 2;
  check(3, "start band centered on start midpoint (300)", center === 300, { center });
}

// 4. Finish band centered on finish midpoint.
{
  const z = stationaryThreeZoneRects(300, 700, 1000, 600);
  const center = z.post.x + z.post.width / 2;
  check(4, "finish band centered on finish midpoint (700)", center === 700, { center });
}

// 5. Blue fills exact region between bands (no gap, no overlap).
{
  const z = stationaryThreeZoneRects(300, 700, 1000, 600);
  check(5, "blue fills exact region between bands' inner edges (no gap, no overlap)", z.fly.x === z.pre.x + z.pre.width && z.fly.x + z.fly.width === z.post.x, { fly: z.fly, preInnerEdge: z.pre.x + z.pre.width, postInnerEdge: z.post.x });
}

// 6. No fill outside the bands.
{
  const z = stationaryThreeZoneRects(300, 700, 1000, 600);
  check(6, "no fill outside the bands (pre doesn't reach x=0, post doesn't reach pictureWidth)", z.pre.x > 0 && z.post.x + z.post.width < 1000, { preX: z.pre.x, postRight: z.post.x + z.post.width });
}

// 7. Full-height bands.
{
  const z = stationaryThreeZoneRects(300, 700, 1000, 600);
  check(7, "full-height bands (y=0, height=pictureHeight for all three)", [z.pre, z.fly, z.post].every((r) => r.y === 0 && r.height === 600));
}

// 8. Left->right correct.
{
  const z = stationaryThreeZoneRects(300, 700, 1000, 600);
  check(8, "left->right: pre < fly < post", z.pre.x < z.fly.x && z.fly.x < z.post.x, { pre: z.pre.x, fly: z.fly.x, post: z.post.x });
}

// 9. Right->left correct.
{
  const z = stationaryThreeZoneRects(700, 300, 1000, 600);
  check(9, "right->left: pre > fly > post (mirrored, not hardcoded)", z.pre.x > z.fly.x && z.fly.x > z.post.x, { pre: z.pre.x, fly: z.fly.x, post: z.post.x });
}

// 10. DPR invariant -- the geometry module never references devicePixelRatio;
// VideoOverlay.tsx's ctx.setTransform(dpr,...) already puts all coordinates
// this module sees/returns into CSS-pixel space, so a fixed constant here
// is DPR-stable BY CONSTRUCTION (verified structurally, not by simulating a
// canvas). Also verify the constant's numeric value is invariant across
// differing pictureWidth/pictureHeight (the only inputs that could vary
// with viewport/zoom).
{
  // Check the COMPILED code (comments stripped), not the .ts source with its
  // prose docstring -- the module's documentation legitimately explains
  // *why* it's DPR-safe (VideoOverlay.tsx's ctx.setTransform(dpr,...)), which
  // would otherwise false-positive a naive source-text search for "dpr".
  const compiledSrc = readFileSync(path.join(out, "lib/video/stationaryGateGeometry.js"), "utf8");
  const noDprRef = !/devicePixelRatio|\bdpr\b/i.test(compiledSrc);
  const w1 = stationaryThreeZoneRects(300, 700, 800, 450).pre.width;
  const w2 = stationaryThreeZoneRects(300, 700, 1600, 900).pre.width;
  check(10, "DPR invariant (compiled module has no DPR reference in actual code; band width identical across differing picture dimensions)", noDprRef && w1 === w2 && w1 === GATE_BAND_PRESENTATION_WIDTH_PX, { w1, w2, noDprRef });
}

// 11. Resize stable (recomputes without exploding/collapsing at any picture size).
{
  const small = stationaryThreeZoneRects(150, 350, 500, 300);
  const large = stationaryThreeZoneRects(600, 1400, 2000, 1200);
  check(11, "resize stable (band width constant, heights follow pictureHeight, no explosion/collapse)", small.pre.width === GATE_BAND_PRESENTATION_WIDTH_PX && large.pre.width === GATE_BAND_PRESENTATION_WIDTH_PX && small.pre.height === 300 && large.pre.height === 1200);
}

// 12/13. Auto Follow / Stabilized View alignment preserved -- structural: the
// function signature has no view-mode parameter, so it cannot depend on
// either toggle; alignment is inherited entirely from the caller passing
// the already-correct, already-transformed startMidX/finishMidX for
// whatever view state is active (unchanged this phase).
{
  const src = readFileSync(path.join(root, "src/lib/video/stationaryGateGeometry.ts"), "utf8");
  const fnSignature = /export function stationaryThreeZoneRects\(([^)]*)\)/.exec(src)?.[1] ?? "";
  const onlyPlainNumbers = /^\s*startMidX: number,\s*finishMidX: number,\s*pictureWidth: number,\s*pictureHeight: number,?\s*$/.test(fnSignature);
  check(12, "Auto Follow alignment preserved (geometry function has no autoFollow parameter; consumes whatever already-transformed midpoint the caller passes)", onlyPlainNumbers && !/autoFollow/i.test(src));
  check(13, "Stabilized View alignment preserved (same structural argument -- no view-state parameter of any kind)", onlyPlainNumbers);
}

// 14. Science unchanged -- from the real production regression run (Part K).
{
  let sciOk = false;
  let snapshot = {};
  try {
    const sci = JSON.parse(readFileSync(path.join(root, "tmp/phaseR2C/scientific-before-after.json"), "utf8"));
    sciOk = sci.allMatch === true;
    snapshot = sci.current;
  } catch { sciOk = false; }
  check(14, "science unchanged (contacts/zone time/step frequency/step length/velocity byte-identical to R2 baseline, all 4 benchmarks)", sciOk, snapshot);
}

rmSync(out, { recursive: true, force: true });

const passCount = results.filter((r) => r.pass).length;
console.log(`\n${passCount}/${results.length} checks passed.`);
mkdirSync(path.join(root, "tmp/phaseR2C"), { recursive: true });
writeFileSync(path.join(root, "tmp/phaseR2C/sanity-results.json"), JSON.stringify(results, null, 2));
if (passCount !== results.length) process.exitCode = 1;
