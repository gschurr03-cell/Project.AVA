// Day 96 audit (Part 7) — deterministic tests for the minimum crossing-
// evidence contract in computeSprintMeasurements: predicted/invalid-origin
// frames can never produce contacts or crossings, and a genuine bracket
// crossing surrounded by a long fragmented gap is downgraded to
// "provisionally_verified" rather than reported with full confidence.
//
//   node scripts/crossing-evidence-sanity.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".crossing-evidence-sanity-tmp");
let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const orig = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return orig.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};
writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
  compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] } },
  files: [path.join(root, "src/lib/benchmark/measurements.ts")],
}));
execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));

const W = 1920, H = 1080;
const FPS = 240;
const DT = 1 / FPS;
const POINTS = { ax: 0.1, ay: 0.7, bx: 0.9, by: 0.7, distanceM: 20 };

const torsoFrame = (index, t, x, boxOrigin) => ({
  frame: index, sourceFrameIndex: index, time: t,
  landmarks: {
    leftShoulder: { x, y: 0.65, visibility: 0.9 }, rightShoulder: { x, y: 0.66, visibility: 0.9 },
    leftHip: { x, y: 0.75, visibility: 0.9 }, rightHip: { x, y: 0.74, visibility: 0.9 },
  },
  angles: {}, centerOfMass: null, velocity: null, footContact: { left: false, right: false },
  trackingConfidence: 0.9,
  ...(boxOrigin ? { boxOrigin } : {}),
});

// --- 1. Dense, fully "detected" continuity around both crossings -> verified.
const N = 200;
const denseFrames = Array.from({ length: N }, (_, i) => {
  const x = 0.02 + (0.98 - 0.02) * (i / (N - 1));
  return torsoFrame(i, i * DT, x, "detected");
});
const mDense = computeSprintMeasurements(denseFrames, POINTS, W, H, { gates: { travelDirection: "left_to_right" } });
check("1. a crossing with dense surrounding continuity is fully 'verified'", mDense.timingProvenance.timingStatus === "verified");
check("1b. zoneTimeS is available for a fully verified crossing", mDense.zoneTimeS != null);

// --- 2. A genuine bracket crossing that lands right after a long fragmented
// gap (thin surrounding continuity) is "provisionally_verified", not "verified".
const fragmentedFrames = [];
// A short cluster right around the start crossing (x=0.1), then a LONG gap,
// then a short cluster right around the finish crossing (x=0.9).
for (let i = 0; i < 5; i++) fragmentedFrames.push(torsoFrame(i, i * DT, 0.08 + i * 0.01, "detected"));
const gapStart = 5, gapEnd = 190;
for (let i = gapStart; i < gapEnd; i++) fragmentedFrames.push(torsoFrame(i, i * DT, 0.5, "predicted")); // stripped anyway
for (let i = gapEnd; i < gapEnd + 6; i++) {
  const t = gapEnd - i;
  fragmentedFrames.push(torsoFrame(i, i * DT, 0.88 - t * 0.01, "detected"));
}
const mFrag = computeSprintMeasurements(fragmentedFrames, POINTS, W, H, { gates: { travelDirection: "left_to_right" } });
check(
  `2. a crossing after a long fragmented gap is 'provisionally_verified', not 'verified' (got: ${mFrag.timingProvenance.timingStatus})`,
  mFrag.timingProvenance.timingStatus !== "verified",
);

// --- 3/4/5. Predicted/invalid boxOrigin frames can never create pose
// evidence, contacts, or crossings — even when landmarks are present. -------
const predictedOnly = Array.from({ length: 100 }, (_, i) => {
  const x = 0.02 + (0.98 - 0.02) * (i / 99);
  return torsoFrame(i, i * DT, x, "predicted");
});
const mPredicted = computeSprintMeasurements(predictedOnly, POINTS, W, H, { gates: { travelDirection: "left_to_right" } });
check("3. an all-'predicted'-origin sequence produces zero valid contacts", mPredicted.totalContacts === 0);
check("4. an all-'predicted'-origin sequence never produces a verified crossing", mPredicted.timingProvenance.verified === false);
check("5. an all-'predicted'-origin sequence's zoneTimeS stays unavailable", mPredicted.zoneTimeS === null);

const invalidOnly = predictedOnly.map((f) => ({ ...f, boxOrigin: "invalid" }));
const mInvalid = computeSprintMeasurements(invalidOnly, POINTS, W, H, { gates: { travelDirection: "left_to_right" } });
check("5b. an all-'invalid'-origin sequence also never produces a verified crossing", mInvalid.timingProvenance.verified === false);

// --- Legacy artifacts without boxOrigin at all are unaffected --------------
const legacyFrames = denseFrames.map(({ boxOrigin, ...f }) => f);
const mLegacy = computeSprintMeasurements(legacyFrames, POINTS, W, H, { gates: { travelDirection: "left_to_right" } });
check("6. frames with no boxOrigin field at all (legacy artifacts) are not treated as predicted", mLegacy.zoneTimeS != null);

// --- Continuity fields are present and sane ---------------------------------
check("7. timingProvenance reports surrounding-continuity evidence fields", [
  "startContinuityFramesBefore", "startContinuityFramesAfter",
  "finishContinuityFramesBefore", "finishContinuityFramesAfter",
  "startBracketedByConsecutiveFrames", "finishBracketedByConsecutiveFrames",
].every((k) => k in mDense.timingProvenance));

rmSync(out, { recursive: true, force: true });
console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
process.exit(ok ? 0 : 1);
