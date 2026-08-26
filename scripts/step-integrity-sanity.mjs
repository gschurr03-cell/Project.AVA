// Day 103 (Part 7) sanity — the missing-contact integrity check
// (`src/lib/video/stepIntegrity.ts`) and its wiring into
// `analyzeZoneSteps` (`src/lib/video/zoneStepAnalysis.ts`), which together
// stop a gap between two otherwise-valid contacts (a real intermediate
// foot-strike that went undetected) from being reported as a single,
// physically-implausible step length.
//
//   node scripts/step-integrity-sanity.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".step-integrity-sanity-tmp");

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
      files: [
        path.join(root, "src/lib/video/stepIntegrity.ts"),
        path.join(root, "src/lib/video/zoneStepAnalysis.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
  const {
    evaluateStepInterval, evaluateAggregateStepLength, MIN_PLAUSIBLE_STEP_DURATION_S, MAX_PLAUSIBLE_STEP_DURATION_S,
  } = require(path.join(out, "lib/video/stepIntegrity.js"));
  const { analyzeZoneSteps } = require(path.join(out, "lib/video/zoneStepAnalysis.js"));

  // --- Unit tests: evaluateStepInterval ---------------------------------

  // 11. Alternating-foot sequence gap is detected — same-foot-to-same-foot.
  const sameFoot = evaluateStepInterval({
    fromSide: "left", toSide: "left", durationS: 0.2, distanceM: 1.8, neighborDistancesM: [1.9, 2.0],
  });
  check("11. same-foot-to-same-foot interval is flagged foot_sequence_discontinuity", !sameFoot.valid && sameFoot.reasons.includes("foot_sequence_discontinuity"));

  // 12. Implausibly long step interval is rejected.
  const tooSlow = evaluateStepInterval({
    fromSide: "left", toSide: "right", durationS: MAX_PLAUSIBLE_STEP_DURATION_S + 0.05, distanceM: 2.0, neighborDistancesM: [1.9, 2.0],
  });
  check("12. a duration just past the plausible ceiling is flagged implausible_step_duration", !tooSlow.valid && tooSlow.reasons.includes("implausible_step_duration"));
  const wayTooSlow = evaluateStepInterval({
    fromSide: "left", toSide: "right", durationS: MAX_PLAUSIBLE_STEP_DURATION_S * 2.5, distanceM: 2.0, neighborDistancesM: [1.9, 2.0],
  });
  check("12. a duration long enough to fit a second step is flagged missing_intermediate_contact + contact_sequence_gap (the real 7.19m Vanni scenario)", !wayTooSlow.valid && wayTooSlow.reasons.includes("missing_intermediate_contact") && wayTooSlow.reasons.includes("contact_sequence_gap"));

  // 13. Implausibly large step distance is rejected — evidence-based ceiling.
  const tooFar = evaluateStepInterval({
    fromSide: "left", toSide: "right", durationS: 0.25, distanceM: 4.5, neighborDistancesM: [2.0, 2.1, 1.9],
  });
  check("13. a distance far beyond the athlete's own other step lengths is flagged implausible_step_distance", !tooFar.valid && tooFar.reasons.includes("implausible_step_distance"));
  const firstEverStep = evaluateStepInterval({
    fromSide: "left", toSide: "right", durationS: 0.25, distanceM: 2.2, neighborDistancesM: [],
  });
  check("13. with no neighbor evidence yet, a normal step length is still accepted (fallback ceiling is generous, not punitive)", firstEverStep.valid);

  // 14. Same-foot stride is not mislabeled as a step (covered by 11, plus a
  // realistic stride-length distance that would otherwise look plausible).
  const strideAsStep = evaluateStepInterval({
    fromSide: "right", toSide: "right", durationS: 0.55, distanceM: 3.6, neighborDistancesM: [1.9, 2.0],
  });
  check("14. a same-foot stride-length interval is never accepted as a step regardless of otherwise-plausible distance", !strideAsStep.valid && strideAsStep.reasons.includes("foot_sequence_discontinuity"));

  // A genuinely normal step (duration + distance both plausible, alternating
  // feet) must NOT be flagged — the check must not be punitive.
  const normalStep = evaluateStepInterval({
    fromSide: "left", toSide: "right", durationS: 0.22, distanceM: 2.05, neighborDistancesM: [1.95, 2.1, 2.0],
  });
  check("a genuine, plausible opposite-foot step is accepted with no reasons", normalStep.valid && normalStep.reasons.length === 0);
  check("MIN_PLAUSIBLE_STEP_DURATION_S mirrors SprintAnalyzer.ts's DEFAULT_MIN_PLAUSIBLE_STEP_MS (150ms)", MIN_PLAUSIBLE_STEP_DURATION_S === 0.15);
  check("MAX_PLAUSIBLE_STEP_DURATION_S mirrors SprintAnalyzer.ts's DEFAULT_MAX_PLAUSIBLE_STEP_MS (320ms)", MAX_PLAUSIBLE_STEP_DURATION_S === 0.32);

  // --- Integration test: analyzeZoneSteps end-to-end ----------------------
  // Replicates the real Vanni-clip shape: three raw contacts (left, right,
  // left) where the right->left gap is ~425ms/wide — long enough to contain
  // a missed intermediate contact — while the first (left->right) interval
  // is a normal, plausible step. This is the exact real-world pattern this
  // task's Part 7 was written to fix.
  const start = { x: 0, y: 0 };
  const finish = { x: 1, y: 0 }; // 20 m axis, so 1 canonical unit == 20 m
  const contacts = [
    // 8/9/10: a real pre-zone contact — retained as context, never counted
    // toward zone step metrics, and must not shift where the in-zone window
    // starts.
    { id: "c0", side: "right", timeS: 6.150, sourceFrameIndex: 1470, x: -0.02, y: 0, confidence: 0.9 },
    { id: "c1", side: "left", timeS: 6.280, sourceFrameIndex: 1504, x: 0.10, y: 0, confidence: 0.9 },
    { id: "c2", side: "right", timeS: 6.447, sourceFrameIndex: 1544, x: 0.20, y: 0, confidence: 0.9 }, // +0.10 = 2m, 167ms — plausible
    { id: "c3", side: "left", timeS: 6.873, sourceFrameIndex: 1646, x: 0.56, y: 0, confidence: 0.9 }, // +0.36 = 7.2m, 426ms — the real 7.19m defect
  ];
  const summary = analyzeZoneSteps({ contacts, start, finish, distanceM: 20 });
  check("8. the pre-zone contact (c0) is retained as context in contactGroups.beforeZone", summary.contactGroups.beforeZone.includes("c0"));
  check("9. the pre-zone contact never enters the in-zone contact group or any interval", !summary.contactGroups.insideZone.includes("c0") && !summary.intervals.some((iv) => iv.fromContactId === "c0" || iv.toContactId === "c0"));
  check("10. the first in-zone contact is c1 (the pre-zone c0 does not shift the zone-entry window)", summary.stepWindow.firstInZoneContactId === "c1");
  const first = summary.intervals[0];
  const second = summary.intervals[1];
  check("15. the normal first interval (c1->c2) is retained as a valid, eligible step", first.valid === true && first.longitudinalLengthM != null);
  check("15. the merged-contact interval (c2->c3, the real 7.19m case) is marked unavailable, not displayed as a step", second.valid === false && second.longitudinalLengthM === null);
  check(
    "15. the unavailable interval carries explicit duration AND distance integrity reasons (never silently dropped)",
    second.qualityFlags.includes("implausible_step_duration") && second.qualityFlags.includes("implausible_step_distance"),
  );
  check("no missing contact is fabricated: only 2 intervals exist for 3 real contacts, never a guessed 3rd contact", summary.intervals.length === 2);
  check("16. Peak/Average Step Length machinery is untouched here — analyzeZoneSteps only marks the interval unavailable, it never substitutes a value", summary.summaries.maxStepLengthM === first.longitudinalLengthM);

  // --- Day 104 (Part 6): evaluateAggregateStepLength — the "zone distance ÷
  // contact count" Method-1 fallback (measurements.ts's avgZoneStepLengthM),
  // which Day 103 explicitly flagged as still unprotected. Reproduces the
  // real reported Vanni 60fps symptom: sparse contacts implying a 2.7-3.5m
  // "average" step length.
  const sparseVanni60 = evaluateAggregateStepLength(30 / 9, [1.9, 2.0, 2.05]); // 30m zone / 9 contacts = 3.33m/step
  check("17. a zone-distance/contact-count aggregate far beyond the run's own real step lengths is rejected (the real Vanni 60fps symptom)", !sparseVanni60.valid && sparseVanni60.reason === "sparse_contact_evidence");
  const denseNormal = evaluateAggregateStepLength(20 / 10, [1.95, 2.05, 2.0]); // 20m / 10 contacts = 2.0m/step — plausible
  check("17. a plausible zone-distance/contact-count aggregate consistent with the run's own evidence is accepted", denseNormal.valid && denseNormal.reason === null);
  const noNeighborEvidenceYet = evaluateAggregateStepLength(2.5, []);
  check("17. with no other in-run evidence yet, the generous fixed physical ceiling is used (not punitive on the very first estimate)", noNeighborEvidenceYet.valid);
  const wayTooFar = evaluateAggregateStepLength(4.2, []);
  check("17. even with no neighbor evidence, a physically implausible aggregate (>3.0m fallback ceiling) is still rejected", !wayTooFar.valid);

  console.log("step integrity sanity: " + (ok ? "PASSED" : "FAILED"));
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
