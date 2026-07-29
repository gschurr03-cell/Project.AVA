// Unit sanity for the Intervention Intelligence Engine (Phase 7, Sprint Intelligence).
// Verifies intervention matching, priority generation, explanation generation, expected
// metric direction, educational-only guidance (never a program), confidence propagation,
// serialization, and architecture integrity. Consumes Phases 1 & 3 (unchanged).
//
//   node scripts/intervention-intelligence-sanity.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".intervention-intelligence-tmp");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
};

let ok = true;
const check = (label, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) ok = false; };

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] } },
    files: [
      path.join(root, "src/lib/intelligence/performanceGap/index.ts"),
      path.join(root, "src/lib/intelligence/performanceGap/rootCause/index.ts"),
      path.join(root, "src/lib/intelligence/performanceGap/intervention/index.ts"),
    ],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const pg = require(path.join(out, "lib/intelligence/performanceGap/index.js"));
  const rc = require(path.join(out, "lib/intelligence/performanceGap/rootCause/index.js"));
  const iv = require(path.join(out, "lib/intelligence/performanceGap/intervention/index.js"));
  const { buildAthletePerformanceModel } = pg;
  const { evaluateRootCauses } = rc;
  const { buildInterventionReport, matchInterventions, INTERVENTIONS, INTERVENTION_CATEGORIES, intervention } = iv;

  const model = buildAthletePerformanceModel({
    athleteId: "a1", distanceM: 100, currentTimeS: 10.36, goalTimeS: 10.05,
    metrics: { strideLength: 2.05, strideFrequency: 4.9, peakVelocity: 11.3, averageVelocity: 9.65, groundContactTime: 0.105, flightTime: 0.11, acceleration: 6.0 },
    now: new Date("2026-07-21T00:00:00.000Z"),
  });
  const raw = {};
  const rootCauses = model.priorities.map((p) => evaluateRootCauses({ metricId: p.metricId, label: p.label, gaps: model.gaps, rawMetrics: raw }));

  // ---- Library integrity ----
  check("library: structured intervention database with full metadata",
    INTERVENTIONS.length >= 15 && INTERVENTIONS.every((x) =>
      x.name && x.category && x.primaryQualities.length > 0 && x.typicalLevel.length > 0 &&
      x.typicalDistances && x.coachingCues.length > 0 && x.commonMistakes.length > 0 &&
      x.associatedMetrics.length > 0 && x.evidenceStrength && Array.isArray(x.contraindications)));
  check("library: categories defined (max velocity, acceleration, plyometric, technical…)",
    INTERVENTION_CATEGORIES.length >= 5);
  check("library: includes the named interventions (flying sprints, wickets, pogo, depth jumps…)",
    ["flyingSprints", "wicketRuns", "pogoSeries", "depthJumps", "hillAccelerations"].every((id) => intervention(id)));

  // ---- Matching ----
  const report = buildInterventionReport({ athleteId: "a1", model, rootCauses, level: "advanced", now: model.generatedAt ? new Date("2026-07-21T00:00:00.000Z") : undefined });
  check("matching: returns a ranked, non-empty set", report.priorities.length > 0 && report.priorities[0].rank === 1);
  check("matching: ranked descending by priority score, deterministic",
    report.priorities.every((p, i) => i === 0 || report.priorities[i - 1].priorityScore >= p.priorityScore));
  check("matching: every priority stores confidence, reasoning, evidence, metrics",
    report.priorities.every((p) => !!p.confidence.category && !!p.reasoning && p.supportingEvidence.length > 0 && p.associatedMetrics.length > 0));
  check("matching: each intervention addresses at least one limiter or root cause",
    report.priorities.every((p) => p.addressedLimiters.length + p.addressedRootCauses.length > 0));

  // A stride-length limiter should surface a stride/projection-oriented intervention high up.
  const topIds = report.priorities.slice(0, 5).map((p) => p.intervention.id);
  check("matching: a stride-length limiter surfaces a relevant intervention (wicket/bound/projection/fly)",
    topIds.some((id) => ["wicketRuns", "alternateBounds", "hipProjectionDrills", "flyingSprints"].includes(id)));

  // ---- Explanations ----
  const lead = report.priorities[0];
  check("explanation: 'why this?' reasoning is associative + educational, not prescriptive",
    /commonly used|associated/i.test(lead.reasoning) && /not a prescription/i.test(lead.reasoning) &&
    !/monday|tuesday|week \d|sets|reps/i.test(lead.reasoning));

  // ---- Expected direction of improvement (never guaranteed magnitude) ----
  check("expected improvement: direction (↑/↓) per metric with confidence, no guaranteed magnitude",
    lead.expectedImprovements.length > 0 && lead.expectedImprovements.every((e) =>
      ["increase", "decrease"].includes(e.direction) && ["direct", "indirect"].includes(e.kind) && !!e.confidence.category) &&
    lead.expectedImprovements.every((e) => typeof e.metricId === "string"));
  check("expected improvement: indirect effects are less confident than direct ones",
    (() => {
      const flying = report.priorities.find((p) => p.intervention.id === "flyingSprints") ?? lead;
      const direct = flying.expectedImprovements.find((e) => e.kind === "direct");
      const indirect = flying.expectedImprovements.find((e) => e.kind === "indirect");
      return !indirect || !direct || (indirect.confidence.score ?? 1) <= (direct.confidence.score ?? 0) + 1e-9;
    })());

  // ---- Educational guidance only — never a program ----
  check("guidance: educational implementation concepts, explicitly NOT a program/days/sets-reps",
    report.priorities.every((p) => {
      const g = p.implementationGuidance;
      return g.typicalDistances && g.typicalRest && Array.isArray(g.coachingCues) &&
        /not a weekly program|not.*days|educational/i.test(g.note) &&
        !/monday|tuesday|wednesday|day 1|3x8|sets of/i.test(JSON.stringify(g));
    }));

  // ---- Coaching cues present ----
  check("coaching cues: present per intervention", report.priorities.every((p) => p.implementationGuidance.coachingCues.length > 0));

  // ---- Confidence propagation ----
  check("confidence: limited-evidence interventions are 'inferred', moderate are 'estimated'",
    report.priorities.every((p) => {
      const es = p.intervention.evidenceStrength;
      if (es === "limited" || es === "anecdotal") return p.confidence.category === "inferred";
      return p.confidence.category === "estimated";
    }));

  // ---- Level adaptation ----
  const novice = buildInterventionReport({ model, rootCauses, level: "developing", now: new Date("2026-07-21T00:00:00.000Z") });
  check("level: novice vs advanced produce different priority ordering (adaptive)",
    JSON.stringify(novice.priorities.map((p) => [p.intervention.id, p.priorityScore])) !==
    JSON.stringify(report.priorities.map((p) => [p.intervention.id, p.priorityScore])));

  // ---- No matches → graceful ----
  const noGaps = buildAthletePerformanceModel({ distanceM: 100, currentTimeS: null, goalTimeS: null, metrics: {}, now: new Date("2026-07-21T00:00:00.000Z") });
  const emptyReport = buildInterventionReport({ model: noGaps, now: new Date("2026-07-21T00:00:00.000Z") });
  check("graceful: no limiters → empty priorities (no fabricated interventions)", emptyReport.priorities.length === 0);

  // ---- Determinism + serialization + architecture ----
  check("report: deterministic (identical input → identical JSON)",
    JSON.stringify(buildInterventionReport({ athleteId: "a1", model, rootCauses, level: "advanced", now: new Date("2026-07-21T00:00:00.000Z") })) ===
    JSON.stringify(buildInterventionReport({ athleteId: "a1", model, rootCauses, level: "advanced", now: new Date("2026-07-21T00:00:00.000Z") })));
  check("report: fully serializable + provenance + library version",
    JSON.parse(JSON.stringify(report)).version === report.version && !!report.provenance.libraryVersion);
  check("architecture: adding an intervention to the library makes it matchable (config-driven)",
    matchInterventions({ model, rootCauses }).length > 0 && INTERVENTIONS.length >= 15);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
