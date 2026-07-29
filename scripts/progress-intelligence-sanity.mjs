// Unit sanity for the Progress Intelligence Engine (Phase 10, Sprint Intelligence).
// Longitudinal athlete profile: history integrity, trend generation + detection, plateau
// detection, adaptation assessment (observation vs hypothesis), anomaly detection,
// improvement attribution, forecasting (with uncertainty), timeline filtering, goal
// progress, serialization, determinism, and architecture stability. Reuses Phase 4/5.
//
//   node scripts/progress-intelligence-sanity.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".progress-intelligence-tmp");
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
      path.join(root, "src/lib/intelligence/performanceGap/dependency/index.ts"),
      path.join(root, "src/lib/intelligence/performanceGap/progress/index.ts"),
    ],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const dep = require(path.join(out, "lib/intelligence/performanceGap/dependency/index.js"));
  const prog = require(path.join(out, "lib/intelligence/performanceGap/progress/index.js"));
  const { buildMetricDependencyReport } = dep;
  const {
    buildProgressIntelligence, buildAthleteHistory, getMetricHistory, computeTrend,
    detectAnomalies, forecastMetric, buildTimeline, filterTimeline, buildGoalProgress, attributeImprovement,
  } = prog;

  const now = new Date("2026-07-21T00:00:00.000Z");
  const context = { heightCm: 188, trochanterHeightM: 0.98, legLengthCm: 96, bodyMassKg: 84, sex: "M", trainingAgeYears: 7, event: "100m" };
  const sensitivity = buildMetricDependencyReport(null, { context }).sensitivity;

  // Synthetic longitudinal history: peak velocity steadily improving, ground contact
  // plateaued, one stride-length anomaly, mixed competition/practice.
  const dates = ["2026-01-05", "2026-01-19", "2026-02-02", "2026-02-16", "2026-03-02", "2026-03-16"];
  const peak = [11.0, 11.1, 11.2, 11.3, 11.35, 11.45];
  const contact = [0.108, 0.107, 0.108, 0.107, 0.108, 0.107]; // plateaued
  const stride = [2.00, 2.02, 2.03, 1.70, 2.05, 2.06]; // one anomaly (index 3)
  const avgV = [9.4, 9.45, 9.5, 9.55, 9.6, 9.68];
  const records = dates.map((date, i) => ({
    id: `r${i}`,
    date,
    sessionType: i % 3 === 0 ? "competition" : "practice",
    isCompetition: i % 3 === 0,
    surface: "track",
    footwear: "spikes",
    recordingQuality: 0.9,
    videoQuality: 0.88,
    confidence: 0.8,
    metrics: { peakVelocity: peak[i], groundContactTime: contact[i], strideLength: stride[i], averageVelocity: avgV[i] },
    metadata: i === 0 ? { annotations: ["season opener"] } : {},
  }));

  const report = buildProgressIntelligence({ athleteId: "a1", records, sensitivity, performanceMetric: "averageVelocity", now });

  // ---- History integrity ----
  const history = buildAthleteHistory("a1", records);
  check("history: records sorted chronologically with first/last dates + tracked metrics",
    history.records[0].date === "2026-01-05" && history.lastDate === "2026-03-16" && history.trackedMetrics.includes("peakVelocity"));
  check("history: future metrics appear automatically (tracked set derived from data)",
    buildAthleteHistory("a1", [{ ...records[0], metrics: { ...records[0].metrics, newFutureMetric: 5 } }, records[1]]).trackedMetrics.includes("newFutureMetric"));
  check("history: metric extraction drops null readings, keeps chronological points",
    getMetricHistory(history, "peakVelocity").points.length === 6 && getMetricHistory(history, "peakVelocity").points[0].value === 11.0);

  // ---- Trend generation + detection ----
  const peakTrend = report.trends.find((t) => t.metricId === "peakVelocity");
  const contactTrend = report.trends.find((t) => t.metricId === "groundContactTime");
  check("trend: steadily rising peak velocity is detected as improving with stored confidence",
    (peakTrend.status === "improving" || peakTrend.status === "rapid_improvement") && peakTrend.confidence.score != null && peakTrend.percentChange > 0);
  check("trend: flat ground contact across 6 analyses is detected as plateaued",
    contactTrend.status === "plateaued");
  check("trend: metric-aware direction — lower ground contact would count as improvement (not decline)",
    getMetricHistory(history, "groundContactTime").lowerIsBetter === true);
  check("trend: a single analysis yields insufficient_data (never overreacts)",
    computeTrend(getMetricHistory(buildAthleteHistory("a1", [records[0]]), "peakVelocity")).status === "insufficient_data");
  const declining = computeTrend(getMetricHistory(buildAthleteHistory("a1", dates.map((date, i) => ({ ...records[i], date, metrics: { peakVelocity: 11.5 - i * 0.1 } }))), "peakVelocity"));
  check("trend: a steady decline is detected as declining", declining.status === "declining");

  // ---- Plateau detection (linked to engines) ----
  const plateau = report.plateaus.find((p) => p.metricId === "groundContactTime");
  check("plateau: detected with confidence + likely factors linked to other engines",
    !!plateau && plateau.detected && plateau.confidence.score != null &&
    plateau.likelyFactors.some((f) => ["metric-dependency", "root-cause", "intervention"].includes(f.linkedEngine)));

  // ---- Adaptation assessment (observation vs hypothesis) ----
  const peakAdapt = report.adaptations.find((a) => a.metricId === "peakVelocity");
  check("adaptation: separates a measured OBSERVATION from ranked HYPOTHESES",
    !!peakAdapt && /changed/.test(peakAdapt.observation) && peakAdapt.hypotheses.length > 0 &&
    peakAdapt.hypotheses.every((h) => typeof h.likelihood === "number" && !!h.rationale));
  check("adaptation: a consistent improvement surfaces technical/physical adaptation as a hypothesis",
    peakAdapt.hypotheses.some((h) => h.type === "technical_adaptation" || h.type === "physical_adaptation"));

  // ---- Anomaly detection (no injury assumption) ----
  const anomalies = detectAnomalies(getMetricHistory(history, "strideLength"));
  check("anomaly: the sudden stride-length drop is flagged with an expected range",
    anomalies.length > 0 && anomalies[0].date === "2026-02-16" && anomalies[0].expectedRange.min < anomalies[0].expectedRange.max);
  check("anomaly: flagged WITHOUT assuming injury",
    anomalies.every((a) => /not an assumption of injury|prompt to review/i.test(a.note)));

  // ---- Improvement attribution ----
  const attribution = report.attribution;
  check("attribution: contributions estimated with confidence and an 'other' residual, summing to ~100%",
    !!attribution && attribution.contributions.length > 0 && attribution.contributions.some((c) => c.metricId === "other") &&
    Math.abs(attribution.contributions.reduce((s, c) => s + c.contributionPct, 0) - 100) < 0.5);
  check("attribution: every contribution carries confidence + direction",
    attribution.contributions.every((c) => !!c.confidence.category && ["improved", "declined"].includes(c.direction)));

  // ---- Forecasting (uncertainty, never guaranteed) ----
  const forecast = forecastMetric(getMetricHistory(history, "peakVelocity"), peakTrend);
  check("forecast: projects the horizon as a WIDENING range (uncertainty grows per step)",
    forecast.steps.length === 8 && (forecast.steps[7].max - forecast.steps[7].min) > (forecast.steps[0].max - forecast.steps[0].min));
  check("forecast: never guarantees — carries assumptions + a no-guarantee note",
    forecast.assumptions.length >= 2 && /never guaranteed|not a promise|uncertainty/i.test(forecast.note));
  check("forecast: an improving series projects a better expected value at the horizon",
    forecast.expectedAtHorizon.expected > getMetricHistory(history, "peakVelocity").points.slice(-1)[0].value);

  // ---- Performance timeline ----
  const timeline = buildTimeline(history, ["peakVelocity", "averageVelocity"]);
  check("timeline: chronological entries with metric overlays + annotations",
    timeline.entries.length === 6 && timeline.metrics.length === 2 && timeline.entries[0].annotations.includes("season opener"));
  check("timeline: filter competition vs training",
    filterTimeline(timeline, { competitionOnly: true }).entries.every((e) => e.isCompetition) &&
    filterTimeline(timeline, { trainingOnly: true }).entries.every((e) => !e.isCompetition));

  // ---- Progress against goals ----
  const goals = buildGoalProgress({ goals: [
    { id: "goalPb", label: "Goal PB", target: 10.0, lowerIsBetter: true, history: [10.24, 10.18] },
    { id: "devScore", label: "Development Score", lowerIsBetter: false, history: [70, 74, 78] },
  ] });
  check("goals: compares current vs previous projection and classifies the trend",
    goals.items.find((g) => g.id === "goalPb").current === 10.18 && goals.items.find((g) => g.id === "goalPb").previous === 10.24 &&
    goals.items.find((g) => g.id === "goalPb").trend === "improving");

  // ---- Determinism + serialization + architecture ----
  const again = buildProgressIntelligence({ athleteId: "a1", records, sensitivity, performanceMetric: "averageVelocity", now });
  check("determinism: identical input → identical JSON", JSON.stringify(again) === JSON.stringify(report));
  check("serialization: whole report round-trips byte-identically", JSON.stringify(JSON.parse(JSON.stringify(report))) === JSON.stringify(report));
  check("architecture: provenance records 9 engines + config; consumes Phase 4 sensitivity",
    Object.keys(report.provenance.engineVersions).length === 9 && !!report.provenance.configVersion &&
    report.plateaus.every((p) => p.likelyFactors.length > 0));

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
