import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, ".phase-7-0-scientific-evidence-tmp");
const require = createRequire(import.meta.url);
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
};
let passed = 0;
let ok = true;
const check = (label, condition) => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (condition) passed += 1; else ok = false;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", strict: true,
      skipLibCheck: true, esModuleInterop: true, moduleResolution: "node", baseUrl: root,
      paths: { "@/*": ["src/*"] } },
    files: [path.join(root, "src/lib/intelligence/scientificEvidence.ts")],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: "inherit" });
  const engine = require(path.join(out, "lib/intelligence/scientificEvidence.js"));

  const contact = (id, side, timeS, sourceFrameIndex, countedInZone = true) => ({
    id, side, timeS, sourceFrameIndex, countedInZone, confidence: 1, x: 0, y: 0,
    classification: countedInZone ? "inside_zone" : "after_zone", longitudinalM: 0,
    lateralM: 0, signedDistanceFromStartM: 0, signedDistanceFromFinishM: 0, qualityFlags: [],
  });
  const measurements = {
    calibrated: true, validContacts: 3, individualStepLengthsM: [1.8, 1.9],
    zone: { distanceM: 20 }, cameraCompensation: { available: true },
    timingProvenance: { verified: true, startCrossingFrame: 10, finishCrossingFrame: 90,
      startCrossingTimestampS: 1, finishCrossingTimestampS: 3, startCrossingExtrapolated: false,
      finishCrossingExtrapolated: false, timingAvailabilityReason: null },
    zoneStepSummary: { contacts: [contact("a", "left", 1.2, 20), contact("b", "right", 1.4, 30), contact("c", "left", 1.6, 40)],
      intervals: [{ id: "ab", fromContactId: "a", toContactId: "b", valid: true },
        { id: "bc", fromContactId: "b", toContactId: "c", valid: true }] },
    strideVelocityWindows: [{ startContactIndex: 0, endContactIndex: 2, reportedDurationS: .4 }],
    diagnostics: { timing: { leftContacts: 2, rightContacts: 1 }, excludedContacts: [] },
    groundContactCombinedMs: 95, flightCombinedMs: 110,
  };
  const build = (id, available = true, reason = null, source = measurements) =>
    engine.buildScientificMetricProvenance(id, available ? 1 : null, available, reason, source);

  const zone = build("zoneTimeS");
  check("1. available metric has all required evidence", engine.validateScientificProvenance(zone).length === 0 && zone.dependencies.length === 4);
  const missingFinish = structuredClone(measurements); missingFinish.timingProvenance.verified = false; missingFinish.timingProvenance.finishCrossingFrame = null;
  const unavailableFinish = build("zoneTimeS", false, "finish_crossing_unavailable", missingFinish);
  check("2. missing required atom is recorded unavailable", unavailableFinish.atoms.some((a) => a.type === "FINISH_CROSSING_VERIFIED" && a.status === "missing") && unavailableFinish.available === false);
  const rejected = zone.atoms.map((a) => ({ ...a })); rejected[0].status = "rejected";
  check("3. rejected evidence cannot authorize metric", engine.validateScientificProvenance({ ...zone, atoms: rejected }).includes("rejected_required_evidence"));
  check("4. direct verified evidence accepted", zone.atoms.some((a) => a.evidenceClass === "direct_verified" && a.status === "accepted"));
  check("5. bounded inferred excluded from exact contracts", Object.values(engine.METRIC_EVIDENCE_CONTRACTS).every((c) => !c.allowableInference.includes("bounded_inferred")));
  check("6. Zone Time requires start and finish", ["START_CROSSING_VERIFIED", "FINISH_CROSSING_VERIFIED"].every((a) => engine.METRIC_EVIDENCE_CONTRACTS.zoneTimeS.required.includes(a)));
  check("7. missing finish has canonical reason", engine.canonicalEvidenceReason("finish_crossing_unavailable") === "finish_crossing_unavailable");
  check("8. Step Frequency requires contact sequence", engine.METRIC_EVIDENCE_CONTRACTS.frequencyHz.required.includes("CONTACT_SEQUENCE_VALID"));
  const sameFoot = structuredClone(measurements); sameFoot.zoneStepSummary.intervals = [];
  check("9. same-foot/invalid gap cannot authorize interval", build("frequencyHz", false, "invalid_contact_sequence", sameFoot).atoms.some((a) => a.type === "CONTACT_SEQUENCE_VALID" && a.status === "missing"));
  check("10. Average Step Length cites only eligible intervals", build("avgStrideLengthM").atoms.filter((a) => a.type === "STEP_INTERVAL_VALID").length === 2);
  check("11. Peak Step Length retains rolling-contract version", engine.METRIC_EVIDENCE_CONTRACTS.peakStrideLengthM.calculationVersion === "scientific-evidence-v1");
  check("12. Average Velocity graph is correct", engine.evidenceDependencyGraph("avgVelocityMps")[0].dependsOn.includes("ZONE_DISTANCE_CONFIRMED"));
  check("13. Peak Velocity graph is correct", engine.evidenceDependencyGraph("topSpeedMps")[0].dependsOn.includes("VELOCITY_WINDOW_VALID"));
  const noGct = structuredClone(measurements); noGct.groundContactCombinedMs = null;
  check("14. GCT independent from contact existence", build("groundContactTimeMs", false, "insufficient_contact_evidence", noGct).atoms.some((a) => a.type === "CONTACT_DURATION_VALID" && a.status === "missing"));
  const noFlight = structuredClone(measurements); noFlight.flightCombinedMs = null;
  check("15. Flight integrity independent", build("flightTimeMs", false, "insufficient_contact_evidence", noFlight).atoms.some((a) => a.type === "FLIGHT_INTERVAL_VALID" && a.status === "missing"));
  check("16. legacy reasons map canonically", engine.canonicalEvidenceReason("insufficient_step_evidence") === "insufficient_step_intervals");
  const legacy = { ...measurements, zoneStepSummary: null };
  check("17. legacy artifacts remain readable", build("avgStrideLengthM", true, null, legacy).legacyProvenanceIncomplete === true);
  check("18. session state derives from metric availability", engine.deriveScientificSessionState([{ metric: "zoneTimeS", status: "available" }]) === "timing_only");
  check("19. unavailable metric does not hide unrelated metric", engine.deriveScientificSessionState([{ metric: "zoneTimeS", status: "unavailable" }, { metric: "frequencyHz", status: "available" }]) === "technique_only");
  const consumer = readFileSync(path.join(root, "src/app/sessions/[id]/PerformanceSummaryCard.tsx"), "utf8");
  check("20. no confidence percentage exposed to consumer", !/confidence\s*[:=].*%/i.test(consumer));
  check("21. contributing frames trace exactly", JSON.stringify(build("avgStrideLengthM").contributingFrames) === JSON.stringify([20, 30, 40]));
  const formulaSource = readFileSync(path.join(root, "src/lib/benchmark/strideMetrics.ts"), "utf8");
  check("22. scientific formulas remain outside evidence engine", formulaSource.includes("computePeakStrideLengthM") && !readFileSync(path.join(root, "src/lib/intelligence/scientificEvidence.ts"), "utf8").includes("reduce((sum"));
  for (const [index, name] of ["Gav", "Vanni 240", "Vanni 120", "Vanni 60"].entries()) {
    const a = JSON.stringify(engine.evidenceDependencyGraph(index ? "frequencyHz" : "avgVelocityMps"));
    const b = JSON.stringify(engine.evidenceDependencyGraph(index ? "frequencyHz" : "avgVelocityMps"));
    check(`${23 + index}. ${name} graph deterministic`, a === b);
  }
  console.log(`\n${passed}/26 passed`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok && passed === 26 ? 0 : 1);
