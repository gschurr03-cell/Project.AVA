// Runtime sanity for Day 68 — ground-contact / flight timing (contacts.ts).
//
//   node scripts/contacts-sanity.mjs
//
// Compiles src/lib/video/contacts.ts and asserts:
//   1. detectContactPhases measures a contact window around a foot-y peak, with a
//      sub-frame interpolated touchdown < peak-time < toe-off and contactMs > 0.
//   2. summariseContactFlight computes per-foot contact means and flight =
//      next-touchdown − this-toe-off, only between the supplied (zone) phases.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".contacts-sanity-tmp");

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
const approx = (a, b, tol = 1e-6) => a != null && Math.abs(a - b) <= tol;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  const tsconfigPath = path.join(out, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022",
        skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node",
        baseUrl: root, paths: { "@/*": ["src/*"] },
      },
      files: [path.join(root, "src/lib/video/contacts.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", tsconfigPath], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { detectContactPhases, summariseContactFlight } = require(path.join(out, "lib/video/contacts.js"));

  const fps = 60;
  const kp = (y) => ({ x: 0.5, y, visibility: 0.9 });
  // A left-foot y-trajectory with a clear contact plateau (peak = ground contact,
  // image y grows downward so the lowest foot is the MAX y). Frames 8..12 sit at
  // the plateau (0.60); 7 and 13 dip just below the 13% band; ends at 0.50.
  const ys = [0.50, 0.52, 0.54, 0.56, 0.575, 0.585, 0.59, 0.585, 0.60, 0.60, 0.60, 0.60, 0.60, 0.585, 0.56, 0.54, 0.52, 0.50];
  const frames = ys.map((y, i) => ({
    frame: i, time: i / fps,
    landmarks: { leftAnkle: kp(y), leftHeel: kp(y), leftFootIndex: kp(y) },
    angles: {}, centerOfMass: { x: 0.5, y: 0.5 }, velocity: null,
  }));
  const peak = 10;
  const marks = [{ side: "left", frame: peak, time: peak / fps, x: 0.5, y: 0.6, index: 1, distanceFromPrev: null, distanceMetersFromPrev: null }];

  const phases = detectContactPhases(frames, marks);
  check("one contact phase detected for the peak", phases.length === 1);
  const ph = phases[0];
  check("touchdown < peak time < toe-off", ph.touchdownTimeS < peak / fps && peak / fps < ph.toeOffTimeS);
  check("contact duration is positive", ph.contactMs > 0);
  check("contact spans several whole frames", ph.contactFrames >= 3);
  check("contactMs = (toeoff − touchdown) × 1000", approx(ph.contactMs, (ph.toeOffTimeS - ph.touchdownTimeS) * 1000, 1e-6));

  // summariseContactFlight: flight after a contact = next touchdown − this toe-off.
  const P = (side, td, toe) => ({ side, frame: 0, contactTimeS: (td + toe) / 2, touchdownTimeS: td, toeOffTimeS: toe, contactMs: (toe - td) * 1000, contactFrames: 4 });
  const seq = [P("left", 0.00, 0.08), P("right", 0.20, 0.28), P("left", 0.40, 0.48)];
  const s = summariseContactFlight(seq);
  check("per-foot contact means", approx(s.groundContactLeftMs, 80) && approx(s.groundContactRightMs, 80));
  // flight L (after first left) = 0.20 − 0.08 = 120 ms; flight R (after right) = 0.40 − 0.28 = 120 ms.
  check("flight = next touchdown − this toe-off, per foot", approx(s.flightLeftMs, 120) && approx(s.flightRightMs, 120));
  check("last contact has no flight (nothing past the zone)", s.leftContacts === 2 && s.rightContacts === 1);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
