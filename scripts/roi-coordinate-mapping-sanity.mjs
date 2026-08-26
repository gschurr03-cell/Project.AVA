// Day 94 audit (Part 5) — proves a known point in a dynamically resized ROI
// crop maps back to the correct SOURCE-video coordinate, at both layers of the
// pipeline: the Python remap done at capture time (`landmark_dict`,
// mediapipe_pose_runner.py) and the TS backend mapping that builds the
// persisted pose artifact (`mapFrameToKeypoints` / `mapFrameToCropSpaceKeypoints`,
// MediaPipeLandmarkMap.ts) from the new crop-provenance fields
// (cropRect/cropScale/cropTranslation/landmarksCropSpace).
//
//   node scripts/roi-coordinate-mapping-sanity.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".roi-coordinate-mapping-sanity-tmp");
let ok = true;
const check = (label, condition) => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) ok = false;
};

// A dynamically resized crop: source frame 1920x1080, crop rect (x0,y0)-(x1,y1)
// in SOURCE pixels — deliberately not square/centered/full-frame, and different
// from a second frame's crop, to prove the mapping isn't accidentally correct
// only for a fixed/centered/square case.
const W = 1920, H = 1080;
const crops = [
  { x0: 200, y0: 100, x1: 800, y1: 700 },   // frame A: 600x600 crop
  { x0: 900, y0: 300, x1: 1700, y1: 1100 }, // frame B: 800x800 crop, different size+position
];
// A known point in CROP-normalized [0,1] space (as MediaPipe would return it).
const cropPoint = { x: 0.5, y: 0.25 };

// --- 1. Python: `landmark_dict` crop -> source remap -----------------------
const pyOut = execFileSync(".venv/bin/python", ["-c", `
import sys, json
sys.path.insert(0, "src/lib/biomechanics/mediapipe/runtime")
from mediapipe_pose_runner import landmark_dict
class LM:
    def __init__(self, x, y):
        self.x, self.y, self.z = x, y, 0.0
        self.visibility = 0.8
        self.presence = 0.9
crops = json.loads(sys.argv[1])
W, H = json.loads(sys.argv[2]), json.loads(sys.argv[3])
cx, cy = json.loads(sys.argv[4]), json.loads(sys.argv[5])
results = []
for c in crops:
    cw, ch = c["x1"] - c["x0"], c["y1"] - c["y0"]
    sx, sy = cw / float(W), ch / float(H)
    ox, oy = c["x0"] / float(W), c["y0"] / float(H)
    results.append(landmark_dict(LM(cx, cy), sx, sy, ox, oy))
print(json.dumps(results))
`, JSON.stringify(crops), String(W), String(H), String(cropPoint.x), String(cropPoint.y)], { cwd: root }).toString().trim();
const pySourcePoints = JSON.parse(pyOut);

for (const [i, crop] of crops.entries()) {
  const cw = crop.x1 - crop.x0, ch = crop.y1 - crop.y0;
  const expectedX = (crop.x0 + cropPoint.x * cw) / W;
  const expectedY = (crop.y0 + cropPoint.y * ch) / H;
  check(
    `1. Python landmark_dict maps crop point (${cropPoint.x}, ${cropPoint.y}) in crop ${i} back to the correct source coordinate`,
    Math.abs(pySourcePoints[i].x - expectedX) < 1e-9 && Math.abs(pySourcePoints[i].y - expectedY) < 1e-9,
  );
}
// Different crops must produce DIFFERENT source points for the identical crop
// point — proves the remap actually uses each frame's own crop, not a fixed one.
check(
  "2. the same crop-space point maps to a DIFFERENT source point for a differently sized/positioned crop",
  Math.abs(pySourcePoints[0].x - pySourcePoints[1].x) > 0.05,
);

// --- 3. TS: mapFrameToKeypoints / mapFrameToCropSpaceKeypoints round trip --
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const orig = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return orig.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};
writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
  compilerOptions: {
    outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022",
    skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node",
    baseUrl: root, paths: { "@/*": ["src/*"] },
  },
  files: [path.join(root, "src/lib/biomechanics/mediapipe/MediaPipeLandmarkMap.ts")],
}));
try {
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
  const { mapFrameToKeypoints, mapFrameToCropSpaceKeypoints, MEDIAPIPE_LANDMARK_INDEX } =
    require(path.join(out, "lib/biomechanics/mediapipe/MediaPipeLandmarkMap.js"));

  const noseIndex = MEDIAPIPE_LANDMARK_INDEX.nose;
  const landmarksCrop = new Array(33).fill(null).map(() => ({ x: 0, y: 0, z: 0, visibility: 0.9 }));
  landmarksCrop[noseIndex] = { x: cropPoint.x, y: cropPoint.y, z: 0, visibility: 0.9 };
  const crop = crops[1]; // the second, differently-sized/positioned crop
  const cw = crop.x1 - crop.x0, ch = crop.y1 - crop.y0;
  const sx = cw / W, sy = ch / H, ox = crop.x0 / W, oy = crop.y0 / H;
  // `frame.landmarks` is the ALREADY-remapped source-space array (what the
  // Python runner persists); `landmarksCropSpace` is the raw crop-space array.
  const frame = {
    landmarks: landmarksCrop.map((p) => ({ x: ox + p.x * sx, y: oy + p.y * sy, z: p.z, visibility: p.visibility })),
    landmarksCropSpace: landmarksCrop,
    cropRect: crop, cropScale: { x: sx, y: sy }, cropTranslation: { x: ox, y: oy },
    sourceFrameIndex: 0, trackingConfidence: 0.9,
  };
  const sourceKeypoints = mapFrameToKeypoints(frame);
  const cropKeypoints = mapFrameToCropSpaceKeypoints(frame);
  const expectedX = ox + cropPoint.x * sx, expectedY = oy + cropPoint.y * sy;
  check(
    "3. TS mapFrameToKeypoints (source-space) matches hand-computed crop->source remap",
    Math.abs(sourceKeypoints.nose.x - expectedX) < 1e-9 && Math.abs(sourceKeypoints.nose.y - expectedY) < 1e-9,
  );
  check(
    "4. TS mapFrameToCropSpaceKeypoints returns the RAW (unremapped) crop-normalized point",
    Math.abs(cropKeypoints.nose.x - cropPoint.x) < 1e-9 && Math.abs(cropKeypoints.nose.y - cropPoint.y) < 1e-9,
  );
  // The defining round-trip: cropTranslation + cropSpace * cropScale === source-space.
  const reconstructed = {
    x: frame.cropTranslation.x + cropKeypoints.nose.x * frame.cropScale.x,
    y: frame.cropTranslation.y + cropKeypoints.nose.y * frame.cropScale.y,
  };
  check(
    "5. cropTranslation + keypointsCropSpace * cropScale reconstructs the source-space keypoint exactly",
    Math.abs(reconstructed.x - sourceKeypoints.nose.x) < 1e-9 && Math.abs(reconstructed.y - sourceKeypoints.nose.y) < 1e-9,
  );
  check(
    "6. mapFrameToCropSpaceKeypoints returns {} when a frame carries no crop-space landmarks (no ROI crop ran)",
    Object.keys(mapFrameToCropSpaceKeypoints({ landmarks: frame.landmarks })).length === 0,
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}

console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
process.exit(ok ? 0 : 1);
