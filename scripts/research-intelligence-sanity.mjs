// Unit sanity for the Research Intelligence Engine (Phase 8, Sprint Intelligence).
// Verifies research tagging, population matching, evidence scoring, consensus + conflict
// detection, honest summarization, recommendation linking, confidence propagation (never
// overriding measured data), serialization, and architecture integrity.
//
//   node scripts/research-intelligence-sanity.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".research-intelligence-tmp");
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
    files: [path.join(root, "src/lib/intelligence/performanceGap/research/index.ts")],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const r = require(path.join(out, "lib/intelligence/performanceGap/research/index.js"));
  const {
    buildResearchSupport, buildSupportedRecommendation, tagPaper, matchPopulation,
    computeEvidenceScore, detectConsensus, detectConflict, applyResearchToConfidence,
    buildResearchRelationships, RESEARCH_PAPERS, MAX_CONFIDENCE_CONTRIBUTION,
  } = r;

  const maleSprinter = { sex: "M", event: "100m", goalPbSeconds: 10.4 };
  const femaleDistance = { sex: "F", event: "400m", goalPbSeconds: 52 };

  // ---- Tagging ----
  const paper = RESEARCH_PAPERS.find((p) => p.id === "fly_maxvel_1");
  const tags = tagPaper(paper);
  check("tagging: auto-tags metrics + interventions from paper text/supported ids",
    tags.interventions.includes("flyingSprints") && tags.metrics.includes("peakVelocity"));
  check("tagging: derives athlete characteristics (male / 100m / event)",
    tags.characteristics.includes("male") || tags.characteristics.includes("100m"));

  // ---- Population matching (weighted by similarity) ----
  const mMatch = matchPopulation(paper.population, maleSprinter);
  const fMatch = matchPopulation(paper.population, femaleDistance);
  check("population match: a male-100m study matches a male-100m athlete better than a female-400m one",
    mMatch.score > fMatch.score && mMatch.score <= 1 && fMatch.score >= 0);
  check("population match: exposes per-factor scores (sex/event/level/sampleSize)",
    mMatch.factors.length === 4 && mMatch.factors.every((f) => typeof f.score === "number"));

  // ---- Evidence scoring ----
  const flySupport = buildSupportedRecommendation({ target: "flyingSprints", targetKind: "intervention", context: maleSprinter, nowYear: 2026 });
  check("evidence score: flying sprints (multiple supporting studies) → high/moderate strength",
    ["high", "moderate"].includes(flySupport.evidenceScore.strength) && flySupport.evidenceScore.score > 0);
  check("evidence score: never relies on one publication — a single paper is capped below high",
    computeEvidenceScore({ evidence: [{ paperId: "x", title: "t", stance: "supporting", quality: "strong", populationMatch: { score: 1, factors: [] }, weight: 1 }] }).strength !== "high");
  check("evidence score: no matched research → insufficient",
    computeEvidenceScore({ evidence: [] }).strength === "insufficient");

  // ---- Consensus + conflict ----
  check("consensus: flying sprints (supporting + neutral, no conflict) → consensus or mixed",
    ["consensus", "mixed"].includes(flySupport.consensus.level) && flySupport.conflict.hasConflict === false);
  const resisted = buildSupportedRecommendation({ target: "resistedAccelerations", targetKind: "intervention", context: maleSprinter, nowYear: 2026 });
  check("conflict: resisted accelerations (a conflicting study) → conflict flagged",
    resisted.conflict.hasConflict === true && ["conflicting", "mixed", "limited"].includes(resisted.consensus.level));
  check("consensus: counts supporting/conflicting/neutral", detectConsensus(flySupport.evidence).supporting >= 1);
  check("consensus: empty evidence → 'none'", detectConsensus([]).level === "none" && detectConflict([]).hasConflict === false);

  // ---- Honest summarization (never overstated) ----
  check("summary: honest, non-overstated ('commonly associated with', 'individual responses vary')",
    /commonly associated with/i.test(flySupport.summary.text) && /vary/i.test(flySupport.summary.text) &&
    !/proven|guaranteed|will improve|definitely/i.test(flySupport.summary.text));

  // ---- Confidence propagation: research strengthens but never overrides measured data ----
  check("confidence: contribution is bounded (|c| ≤ max)",
    Math.abs(flySupport.confidenceContribution) <= MAX_CONFIDENCE_CONTRIBUTION + 1e-9);
  check("confidence: supportive evidence yields a positive contribution; conflicting yields ≤ 0",
    flySupport.confidenceContribution > 0 && resisted.confidenceContribution <= 0);
  check("confidence: research NEVER overrides measured data (measured category unchanged)",
    applyResearchToConfidence({ category: "measured", score: null }, 0.15).category === "measured" &&
    applyResearchToConfidence({ category: "measured", score: null }, 0.15).score === null);
  check("confidence: an estimated confidence is only NUDGED within [0,1] by research",
    (() => { const c = applyResearchToConfidence({ category: "estimated", score: 0.6 }, 0.1); return c.category === "estimated" && Math.abs(c.score - 0.7) < 1e-9; })());
  check("confidence: population mismatch weakens evidence (male-100m athlete vs female-400m context)",
    buildSupportedRecommendation({ target: "flyingSprints", targetKind: "intervention", context: femaleDistance, nowYear: 2026 }).evidenceScore.score <=
      flySupport.evidenceScore.score + 1e-9);

  // ---- Relationships ----
  const rels = buildResearchRelationships();
  check("relationships: link papers to metrics + interventions + root causes",
    rels.length === RESEARCH_PAPERS.length && rels.some((x) => x.linkedInterventions.length > 0 && x.linkedMetrics.length > 0));

  // ---- Full report + serialization + architecture ----
  const report = buildResearchSupport({ athleteId: "a1", interventionIds: ["flyingSprints", "pogoSeries"], metricIds: ["peakVelocity"], context: maleSprinter, now: new Date("2026-07-21T00:00:00.000Z"), nowYear: 2026 });
  check("report: one supported entry per target + provenance + KB version",
    report.supported.length === 3 && Object.keys(report.provenance.engineVersions).length === 5 && report.provenance.knowledgeBaseVersion.includes("seed"));
  check("report: deterministic (identical input → identical JSON)",
    JSON.stringify(buildResearchSupport({ athleteId: "a1", interventionIds: ["flyingSprints", "pogoSeries"], metricIds: ["peakVelocity"], context: maleSprinter, now: new Date("2026-07-21T00:00:00.000Z"), nowYear: 2026 })) === JSON.stringify(report));
  check("report: fully serializable", JSON.parse(JSON.stringify(report)).version === report.version);
  check("architecture: papers carry ingestion seams (sourceVersion / approved) for future ingestion",
    RESEARCH_PAPERS.every((p) => "sourceVersion" in p && "approved" in p));
  check("architecture: a target with no matched research degrades gracefully (insufficient)",
    buildSupportedRecommendation({ target: "coreStability", targetKind: "intervention", context: maleSprinter, nowYear: 2026 }).evidenceScore.strength === "insufficient");

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
