// Day 100 (Part 6) sanity — the evidence heatmap
// (`src/lib/video/evidenceHeatmap.ts`) that explains, per frame, exactly
// what pose/foot/contact/tracking evidence existed.
//
//   node scripts/evidence-heatmap-sanity.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".evidence-heatmap-sanity-tmp");

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  const mapped = request.startsWith("@/") ? path.join(out, request.slice(2)) : request;
  return originalResolve.call(this, mapped, ...rest);
};

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022",
        skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node",
        baseUrl: root, paths: { "@/*": ["src/*"] },
      },
      files: [path.join(root, "src/lib/video/evidenceHeatmap.ts"), path.join(root, "src/lib/video/events.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { buildEvidenceHeatmap, summarizeEvidenceHeatmap } = require(path.join(out, "lib/video/evidenceHeatmap.js"));
  const { buildFullRunEvents } = require(path.join(out, "lib/video/events.js"));

  const mk = (x, y, vis = 0.9) => ({ x, y, visibility: vis });

  // Frame 0-9: no pose at all (empty landmarks — athlete not yet visible).
  // Frame 10-19: torso only (no feet) — partial pose, no foot evidence.
  // Frame 20+: full body incl. feet, alternating contact plateau at 25-27.
  const frames = [];
  for (let i = 0; i < 10; i++) {
    frames.push({ frame: i, sourceFrameIndex: i, time: i / 30, landmarks: {}, trackingConfidence: 0, boxOrigin: "invalid" });
  }
  for (let i = 10; i < 20; i++) {
    frames.push({
      frame: i, sourceFrameIndex: i, time: i / 30,
      landmarks: { leftShoulder: mk(0.5, 0.3), rightShoulder: mk(0.52, 0.3), leftHip: mk(0.5, 0.5), rightHip: mk(0.52, 0.5) },
      trackingConfidence: 0.6, boxOrigin: "tracked",
    });
  }
  for (let i = 20; i < 40; i++) {
    const contactFrame = i >= 25 && i <= 27;
    frames.push({
      frame: i, sourceFrameIndex: i, time: i / 30,
      landmarks: {
        leftShoulder: mk(0.5, 0.3), rightShoulder: mk(0.52, 0.3), leftHip: mk(0.5, 0.5), rightHip: mk(0.52, 0.5),
        leftAnkle: mk(0.48, contactFrame ? 0.85 : 0.75), leftHeel: mk(0.47, contactFrame ? 0.85 : 0.75), leftFootIndex: mk(0.49, contactFrame ? 0.85 : 0.75),
        rightAnkle: mk(0.54, 0.7), rightHeel: mk(0.53, 0.7), rightFootIndex: mk(0.55, 0.7),
      },
      trackingConfidence: 0.9, boxOrigin: "tracked",
    });
  }

  const heatmap = buildEvidenceHeatmap(frames);
  check("heatmap has one entry per input frame", heatmap.length === frames.length);
  check("frames 0-9 (no landmarks): poseConfidence and footConfidence are both 0", heatmap.slice(0, 10).every((h) => h.poseConfidence === 0 && h.footConfidence === 0));
  check("frames 10-19 (torso only): poseConfidence > 0 but footConfidence is 0 (no foot evidence)", heatmap.slice(10, 20).every((h) => h.poseConfidence > 0 && h.footConfidence === 0));
  check("frames 20+ (full body incl. feet): footConfidence > 0 and bothFeetVisible", heatmap.slice(20, 40).every((h) => h.footConfidence > 0 && h.bothFeetVisible === true));
  check("individual foot-landmark visibility flags are correctly set (leftAnkleVisible / rightFootIndexVisible)", heatmap[25].leftAnkleVisible === true && heatmap[25].rightFootIndexVisible === true);
  check("landmarkCompleteness is a fraction of the 33 canonical landmarks, never > 1", heatmap.every((h) => h.landmarkCompleteness >= 0 && h.landmarkCompleteness <= 1));
  check("cropContainment is honestly null (not computable at this layer, not fabricated)", heatmap.every((h) => h.cropContainment === null));
  check("trackingConfidence passes through the real per-frame value", heatmap[15].trackingConfidence === 0.6);
  check("boxOrigin/trackState pass through unmodified", heatmap[0].boxOrigin === "invalid" && heatmap[20].boxOrigin === "tracked");

  // Contact confidence: wire real full-run contacts through.
  const fullRun = buildFullRunEvents(frames);
  const heatmapWithContacts = buildEvidenceHeatmap(frames, fullRun);
  const contactFrames = fullRun.contacts.map((c) => c.sourceFrameIndex);
  check("at least one real contact was detected in the synthetic plateau (test validity check)", contactFrames.length > 0);
  check(
    "contactConfidence is set (from the frame's own foot confidence) exactly on detected-contact frames, null elsewhere",
    heatmapWithContacts.every((h) => (contactFrames.includes(h.sourceFrameIndex)) === (h.contactConfidence != null)),
  );

  const summary = summarizeEvidenceHeatmap(heatmapWithContacts);
  check("summary: firstPoseFrame is the first frame with any landmark (frame 10)", summary.firstPoseFrame === 10);
  check("summary: firstFootEvidenceFrame is the first frame with a foot landmark (frame 20)", summary.firstFootEvidenceFrame === 20);
  check("summary: firstBothFeetVisibleFrame matches firstFootEvidenceFrame in this synthetic run (both feet arrive together)", summary.firstBothFeetVisibleFrame === 20);
  check("summary: firstContactFrame / lastContactFrame bound the real detected contact(s)", summary.firstContactFrame != null && summary.lastContactFrame != null && summary.firstContactFrame <= summary.lastContactFrame);

  // Empty input never crashes.
  const emptyHeatmap = buildEvidenceHeatmap([]);
  const emptySummary = summarizeEvidenceHeatmap(emptyHeatmap);
  check("empty input never crashes: heatmap is [], summary is all-null", emptyHeatmap.length === 0 && Object.values(emptySummary).every((v) => v === null));
} finally {
  rmSync(out, { recursive: true, force: true });
}

console.log(ok ? "\nAll evidence-heatmap sanity checks passed." : "\nSanity FAILED.");
process.exit(ok ? 0 : 1);
