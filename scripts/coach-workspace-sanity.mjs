import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import Module from "node:module";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".coach-workspace-sanity-tmp");
const require = createRequire(import.meta.url);
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest); };
let ok = true;
const check = (label, condition) => { console.log(`${condition ? "PASS" : "FAIL"}  ${label}`); if (!condition) ok = false; };

const point = (id, peak, contact, quality, confidence, limiter = null) => ({
  analysisId: `analysis-${id}`, sessionId: `session-${id}`, sessionName: `Session ${id}`, date: `2026-0${id}-01T00:00:00Z`,
  conditions: ["120 FPS", "Calibrated"], analysisType: "fly",
  metrics: {
    peakVelocity: { value: peak, unit: "m/s", source: "stored" },
    groundContact: { value: contact, unit: "ms", source: "stored" },
    recordingQuality: { value: quality, unit: "/100", source: "derived" },
    confidence: { value: confidence, unit: "%", source: "derived" },
  }, limiter,
});
const report = (points, improving = [], regressing = []) => ({
  version: "ava-progress-center-v1", points,
  trends: [
    { key: "peakVelocity", label: "Peak velocity", unit: "m/s", higherIsBetter: true,
      points: points.map((p) => ({ date: p.date, value: p.metrics.peakVelocity.value, analysisId: p.analysisId, sessionId: p.sessionId, sessionName: p.sessionName })),
      direction: improving.length ? "improving" : regressing.length ? "declining" : "stable", changePct: 2, summary: "", personalBest: points.at(-1), seasonBest: points.at(-1), recentBest: points.at(-1) },
  ], insights: [], currentPbs: [], recentImprovements: improving, improving, regressing,
  highestPriorityLimiter: points.at(-1)?.limiter ?? null,
  currentConfidence: points.at(-1)?.metrics.confidence.value ?? null,
  latestRecordingQuality: points.at(-1)?.metrics.recordingQuality.value ?? null,
  limiterEvolution: [],
});

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  const config = path.join(out, "tsconfig.json");
  writeFileSync(config, JSON.stringify({ compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", strict: true, skipLibCheck: true, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] } }, files: [path.join(root, "src/lib/coachWorkspace/engine.ts")] }));
  execFileSync("npx", ["tsc", "-p", config], { cwd: root, stdio: "inherit" });
  const { buildCoachRoster, buildTeamAnalytics, compareAthletes } = require(path.join(out, "lib/coachWorkspace/engine.js"));
  const improvingTrend = [{ key: "peakVelocity", label: "Peak velocity" }];
  const athletes = [
    { id: "a1", name: "Alex", favorite: true, event: "100 m", ageGroup: "Senior", report: report([point(1, 10, 110, 90, 90), point(2, 10.4, 105, 92, 91)], improvingTrend) },
    { id: "a2", name: "Bo", report: report([point(1, 9.8, 120, 55, 70, { key: "groundContact", label: "Ground contact", priorityScore: 75, status: "High" })], [], improvingTrend) },
    { id: "a3", name: "Casey", report: report([]) },
  ];
  const roster = buildCoachRoster(athletes);
  const analytics = buildTeamAnalytics(athletes, roster);
  check("roster contains each athlete exactly once", roster.length === 3 && new Set(roster.map((a) => a.id)).size === 3);
  check("favorites and attention order deterministically", roster[0].id === "a1" && roster.some((a) => a.id === "a2" && a.status === "needs_attention"));
  check("roster exposes required coach columns", roster.every((a) => ["name", "event", "ageGroup", "status", "trendDirection", "favorite", "sessionCount"].every((key) => key in a)));
  check("team analytics use latest stored values", Math.abs(analytics.averagePeakVelocity - 10.1) < 1e-9 && analytics.averageContactTime === 112.5);
  check("attention is evidence-backed", analytics.athletesNeedingAttention.some((a) => a.id === "a2" && /quality|declining|priority/i.test(a.statusReason)));
  check("injury field is placeholder-only", analytics.newInjuries === null);
  const comparison = compareAthletes(athletes[0], athletes[1]);
  check("athlete comparison is deterministic and preserves source values", comparison.metrics.find((m) => m.key === "peakVelocity").left === 10.4 && comparison.metrics.find((m) => m.key === "peakVelocity").right === 9.8);
  check("identical inputs create identical dashboards", JSON.stringify(buildTeamAnalytics(athletes, buildCoachRoster(athletes))) === JSON.stringify(analytics));

  const migration = readFileSync(path.join(root, "supabase/migrations/0054_coach_workspace.sql"), "utf8");
  check("migration keeps legacy coach ownership path", migration.includes("a.coach_id = auth.uid()"));
  check("organization roles include owner/head/assistant/read-only", ["owner", "head_coach", "assistant_coach", "read_only_staff"].every((role) => migration.includes(`'${role}'`)));
  check("notes are RLS protected and edits create revisions", migration.includes("alter table public.coach_notes enable row level security") && migration.includes("capture_coach_note_revision"));
  check("read-only staff cannot edit notes", migration.includes("om.role in ('owner', 'head_coach') or tc.role = 'assistant_coach'"));
  check("cross-organization athlete access requires membership/team link", /organization_memberships/.test(migration) && /team_athletes/.test(migration) && /can_access_athlete/.test(migration));
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
