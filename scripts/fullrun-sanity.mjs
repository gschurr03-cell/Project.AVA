// Runtime sanity for Day 71 — full-run event stream + start-boundary recovery.
//
//   node scripts/fullrun-sanity.mjs
//
// Compiles src/lib/video/events.ts and asserts:
//   1. buildFullRunEvents returns the complete contact stream + first/last bounds +
//      per-foot counts, independent of any calibration/zone.
//   2. selectEvents filters the stream (Stage-2 zone extraction) without changing it.
//   3. Start-boundary recovery: a contact present in the FIRST tracked frame (foot
//      planted at onset, then lifting) is detected — previously invisible to the
//      interior-only peak finder.
//   4. It does NOT fabricate: a foot mid-swing in the first frame (descending into a
//      later contact) is NOT marked as a contact.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".fullrun-sanity-tmp");

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
      files: [path.join(root, "src/lib/video/events.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { buildFullRunEvents, selectEvents } = require(path.join(out, "lib/video/events.js"));

  const kp = (y) => ({ x: 0.5, y, visibility: 0.9 });
  // Left-foot y as a triangle wave, period 20 frames (~333 ms @60fps > the 250 ms
  // same-foot floor). peakSeries → foot planted (contact) in frame 0; troughSeries →
  // foot mid-swing in frame 0. Image-y grows downward so a contact is a MAX (0.62).
  const peakSeries = []; // frame0 = planted (0.62), rises then returns every 20 frames
  const troughSeries = []; // frame0 = mid-swing (0.51)
  for (let i = 0; i < 45; i++) {
    const p = (i % 20) / 20;
    // |1−2p| = 1 at p=0/1 (contact, MAX y=0.62), 0 at p=0.5 (swing, min y=0.51).
    peakSeries.push(0.51 + 0.11 * Math.abs(1 - 2 * p)); // frame 0 = planted contact
    troughSeries.push(0.51 + 0.11 * (1 - Math.abs(1 - 2 * p))); // frame 0 = mid-swing
  }
  const mkFrames = (ys) =>
    ys.map((y, i) => ({
      frame: i, time: i / 60,
      landmarks: { leftAnkle: kp(y), leftHeel: kp(y), leftFootIndex: kp(y) },
      angles: {}, centerOfMass: { x: 0.5, y: 0.5 }, velocity: null,
    }));

  const peak = buildFullRunEvents(mkFrames(peakSeries));
  check("full-run stream carries contacts + counts + bounds", peak.totalContacts >= 1 && peak.contacts.length === peak.totalContacts && peak.firstContactTimeS === peak.contacts[0].time);
  check("start-boundary contact recovered (contact in frame 0)", peak.contacts.some((c) => c.frame === 0));
  check("all recovered contacts are left foot (right absent)", peak.leftContacts === peak.totalContacts && peak.rightContacts === 0);
  // peaks at frames 0, 20, 40 → 3 contacts.
  check("full run finds all three planted contacts (0/20/40)", peak.totalContacts === 3);

  const trough = buildFullRunEvents(mkFrames(troughSeries));
  check("mid-swing first frame is NOT marked a contact (no frame 0)", !trough.contacts.some((c) => c.frame === 0));
  check("mid-swing run still finds its interior contacts", trough.totalContacts >= 1);

  // selectEvents = Stage-2 zone filter; measures the stream, doesn't change it.
  const firstHalf = selectEvents(peak, (c) => c.time < 0.34); // frames < ~20
  check("selectEvents filters the stream (subset of contacts)", firstHalf.length < peak.totalContacts && firstHalf.every((c) => peak.contacts.includes(c)));
  check("filtering does not mutate the full stream", peak.totalContacts === 3);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
