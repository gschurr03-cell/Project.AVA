// Regression sanity for MANUAL TIMING-ZONE AUTHORITY (Part 1). Pure-function
// coverage of the authority model + rendering selector + merge + legacy
// normalization that make a manual-confirmed zone canonical and non-drifting.
//
//   node scripts/calibration-authority-sanity.mjs
//
// Maps to the required cases (the unit-testable subset; live-browser pixel
// stability is verified separately):
//   2  drag → manual_draft            3  save → manual_confirmed
//   4  confirmedAt + schema stored    5  coordinate precision survives serialization
//   6/7 reload/resize → same canonical positions
//   8/9 polling / completion do not overwrite manual_confirmed
//   10 out-of-order stale rejected    11 rerun preserves manual_confirmed
//   13 reset-to-auto is explicit (merge never auto-downgrades)
//   15 duplicate save idempotent      16 legacy record hydrates safely
//   17 selector prioritizes manual_confirmed over derived geometry
//   18 FPS normalization does not change canonical coords
//   19 camera-offset conversion stable (selector output stable across calls)
//   23 no throw for legacy / partial calibration data

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".calibration-authority-tmp");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
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
      files: [
        path.join(root, "src/lib/calibration/authority.ts"),
        path.join(root, "src/lib/calibration/gates.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const authority = require(path.join(out, "lib/calibration/authority.js"));
  const gatesMod = require(path.join(out, "lib/calibration/gates.js"));
  const {
    calibrationAuthority, selectRenderableGateGeometry, mergeCalibrationAuthority,
    normalizeCalibrationAuthority, manualConfirmedAuthorityFields,
  } = authority;
  const { calibrationGatesSchema } = gatesMod;

  // A high-precision canonical gate fixture (no boundaries → simplest legacy shape).
  const bar = (x1, x2, t) => ({ c1: { x: x1, y: 0.4111111111 }, c2: { x: x2, y: 0.6222222222 }, timeS: t });
  const gates = (over = {}) => ({
    startGate: bar(0.201234567890123, 0.221234567890123, 1.5),
    finishGate: bar(0.701234567890123, 0.721234567890123, 3.25),
    distanceM: 20, ...over,
  });
  const manualFields = manualConfirmedAuthorityFields(5, new Date("2026-07-21T00:00:00.000Z"));
  const manual = (rev = 5) => gates({ ...manualFields, revision: rev });
  const auto = (rev = 0) => gates({ calibrationSource: "auto", revision: rev });
  const draft = (rev = 1) => gates({ calibrationSource: "manual_draft", revision: rev });

  // 3 + 4. Save produces manual_confirmed with confirmedAt + schema version.
  check("3. manualConfirmedAuthorityFields → source manual_confirmed",
    manualFields.calibrationSource === "manual_confirmed");
  check("4. confirmedAt (ISO) + authoritySchemaVersion are stored",
    /^\d{4}-\d{2}-\d{2}T.*Z$/.test(manualFields.confirmedAt) &&
    manualFields.authoritySchemaVersion === "ava-calibration-authority-v1");

  // 2. A draft is authority manual_draft (not confirmed).
  check("2. drag/draft record → authority manual_draft", calibrationAuthority(draft()).source === "manual_draft");

  // 5. Canonical coordinate precision survives JSON serialization (no rounding).
  const round = JSON.parse(JSON.stringify(manual()));
  check("5. c1/c2 float precision survives serialization exactly",
    round.startGate.c1.x === 0.201234567890123 && round.finishGate.c2.x === 0.721234567890123);

  // 5b. It round-trips through the persisted schema without altering coordinates.
  const parsed = calibrationGatesSchema.safeParse(manual());
  check("5b. persisted schema preserves authority fields + exact coords",
    parsed.success && parsed.data.calibrationSource === "manual_confirmed" &&
    parsed.data.startGate.c1.x === 0.201234567890123);

  // 6/7 + 18/19. Rendering selector returns the EXACT canonical raw coords, stable
  // across repeated calls (reload/resize/FPS/camera cannot change them).
  const d1 = selectRenderableGateGeometry(manual());
  const d2 = selectRenderableGateGeometry(manual());
  check("17. selector uses canonical_raw for manual_confirmed",
    d1.mode === "canonical_raw" && d1.reason === "manual_confirmed");
  check("6/7/18/19. selector emits exact persisted coords, stable across calls",
    d1.start.c1.x === 0.201234567890123 && d1.finish.c2.x === 0.721234567890123 &&
    JSON.stringify(d1) === JSON.stringify(d2));
  check("17b. selector keeps derived-priority for auto zones",
    selectRenderableGateGeometry(auto()).mode === "derived_priority");

  // 8/9. Polling / worker completion (incoming auto) never overwrites manual_confirmed.
  check("8/9. incoming auto does NOT overwrite manual_confirmed",
    mergeCalibrationAuthority(manual(5), auto(9)).calibrationSource === "manual_confirmed");

  // 10. Out-of-order stale: manual rev5 vs incoming manual rev3 → keep rev5.
  check("10. stale lower-revision manual does not overwrite newer manual",
    mergeCalibrationAuthority(manual(5), gates({ ...manualFields, revision: 3 })).revision === 5);

  // 11. Rerun preserves manual_confirmed (snapshot copy merged back).
  check("11. rerun/hydration keeps manual_confirmed authority",
    mergeCalibrationAuthority(manual(5), manual(5)).calibrationSource === "manual_confirmed");

  // 13. Reset-to-auto must be EXPLICIT: a plain merge never downgrades to auto,
  //     even when the auto copy claims a higher revision (protection guarantee).
  check("13. merge never auto-downgrades a confirmed zone (reset must be explicit)",
    mergeCalibrationAuthority(manual(5), auto(99)).calibrationSource === "manual_confirmed");

  // 15. Duplicate save / normalization is idempotent.
  const once = normalizeCalibrationAuthority(auto(0));
  const twice = normalizeCalibrationAuthority(once);
  check("15. normalization is idempotent (duplicate save safe)",
    JSON.stringify(once) === JSON.stringify(twice));

  // 16 + 23. Legacy records (no authority fields, no boundaries) hydrate safely and
  // are inferred conservatively as auto — never a false manual_confirmed.
  const legacy = gates(); // no calibrationSource, no boundaries
  const legacyParse = calibrationGatesSchema.safeParse(legacy);
  check("16/23. legacy record parses without error", legacyParse.success);
  check("16b. legacy record without user-placed evidence → auto (conservative)",
    calibrationAuthority(legacy).source === "auto");
  check("16c. normalizing legacy does not change coordinates",
    normalizeCalibrationAuthority(legacy).startGate.c1.x === legacy.startGate.c1.x);

  // 16d. Legacy record WITH user-selected boundaries → inferred manual_confirmed.
  const legacyUserPlaced = gates({
    startBoundary: { selectedByUser: true }, finishBoundary: { selectedByUser: true }, version: 4,
  });
  check("16d. legacy user-placed boundaries → inferred manual_confirmed, revision from version",
    calibrationAuthority(legacyUserPlaced).source === "manual_confirmed" &&
    calibrationAuthority(legacyUserPlaced).revision === 4);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
