// Runtime sanity for the foot-contact event detector.
//
//   node scripts/events-sanity.mjs
//
// Compiles the events module to a throwaway dir, then asserts the heuristic on
// synthetic sequences (alternating contacts, low-confidence rejection, sparse
// data) and, if the real artifact exists, prints a detected-events summary.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".events-sanity-tmp");
const artifact = path.join(root, "artifacts/pose-sequences/test.pose.json");

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

// --- synthetic sequence helpers ---
function makeFrame(index, fps, leftY, rightY, score) {
  const kp = (y) => ({ x: 0.5, y, score, visibility: score });
  return {
    index,
    tMs: (index / fps) * 1000,
    keypoints: {
      left_toe: kp(leftY),
      left_heel: kp(leftY),
      left_ankle: kp(leftY),
      right_toe: kp(rightY),
      right_heel: kp(rightY),
      right_ankle: kp(rightY),
    },
  };
}
function synth({ frames = 60, fps = 30, amp = 0.12, base = 0.8, freq = 1.5, score = 0.9 } = {}) {
  const f = [];
  for (let i = 0; i < frames; i++) {
    const t = i / fps;
    const left = base + amp * Math.sin(2 * Math.PI * freq * t);
    const right = base + amp * Math.sin(2 * Math.PI * freq * t + Math.PI);
    f.push(makeFrame(i, fps, left, right, score));
  }
  return { backend: "synthetic", modelVersion: "synthetic", coordSpace: "normalized", fps, width: 1920, height: 1080, frames: f };
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  execFileSync(
    "npx",
    ["tsc", "src/lib/biomechanics/events/index.ts", "--outDir", out, "--module", "commonjs", "--target", "es2022", "--skipLibCheck", "--esModuleInterop"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );
  const { detectFootContacts } = require(path.join(out, "events/index.js"));

  // (1) Alternating left/right contacts produce contact events on both sides.
  const events = detectFootContacts(synth());
  const contacts = events.filter((e) => e.type === "contact");
  const leftC = contacts.filter((e) => e.side === "left").length;
  const rightC = contacts.filter((e) => e.side === "right").length;
  const typed = events.every(
    (e) =>
      Number.isInteger(e.frame) &&
      typeof e.tMs === "number" &&
      (e.side === "left" || e.side === "right") &&
      (e.type === "contact" || e.type === "toe_off") &&
      typeof e.confidence === "number" &&
      e.source === "pose_heuristic",
  );
  check(`synthetic → ${contacts.length} contacts (L=${leftC}, R=${rightC}), ${events.length - contacts.length} toe-offs`, leftC >= 2 && rightC >= 2);
  check(`events are well-typed GaitEvent[] (frame,tMs,side,type,confidence,source)`, typed);
  check(`events are time-sorted`, events.every((e, i) => i === 0 || e.tMs >= events[i - 1].tMs));

  // (2) Low-confidence keypoints are ignored.
  const lowConf = detectFootContacts(synth({ score: 0.2 })); // below default minKeypointScore 0.4
  check(`low-confidence (score 0.2) → no events (${lowConf.length})`, lowConf.length === 0);

  // (3) Empty / insufficient sequences return [].
  check(`empty sequence → []`, detectFootContacts(synth({ frames: 0 })).length === 0);
  check(`2-frame sequence → []`, detectFootContacts(synth({ frames: 2 })).length === 0);

  // (4) Real artifact summary (optional — only if it exists).
  if (existsSync(artifact)) {
    const seq = JSON.parse(readFileSync(artifact, "utf8"));
    const real = detectFootContacts(seq);
    const by = (s, t) => real.filter((e) => e.side === s && e.type === t).length;
    console.log(
      `real artifact: ${seq.frames.length} frames → ${real.length} events ` +
        `(L contact=${by("left", "contact")} toe_off=${by("left", "toe_off")}, ` +
        `R contact=${by("right", "contact")} toe_off=${by("right", "toe_off")})`,
    );
    check(`real artifact detection returned a typed array`, Array.isArray(real));
  } else {
    console.log("real artifact: (not present — skipping optional summary)");
  }

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
