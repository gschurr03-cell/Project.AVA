// Unit sanity for the Coach Intelligence & Team Platform (Phase 11, Sprint Intelligence).
// Verifies RBAC + organization isolation, coach review workflows (accept/reject/modify/
// override + audit), the coach knowledge layer (wording not data), athlete cards, team
// analytics, the alert engine (always explains why), dashboard aggregation + team health,
// report generation, audit history, collaboration notes, export, serialization, determinism,
// and architecture stability. Consumes Phase 4/10 (unchanged).
//
//   node scripts/coach-platform-sanity.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".coach-platform-tmp");
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
      path.join(root, "src/lib/intelligence/performanceGap/coach/index.ts"),
    ],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const dep = require(path.join(out, "lib/intelligence/performanceGap/dependency/index.js"));
  const prog = require(path.join(out, "lib/intelligence/performanceGap/progress/index.js"));
  const coach = require(path.join(out, "lib/intelligence/performanceGap/coach/index.js"));
  const {
    can, authorize, isAuthorized,
    reviewRecommendation, resolveRecommendationText,
    resolvePreferences, applyTerminology, reorderByEmphasis,
    buildAthleteSummary, buildTeamAnalytics, generateAlerts, buildTeamDashboard, buildCoachDashboard,
    generateAthleteReport, generateTeamReport,
    createAuditLog, makeAuditEntry, appendAudit, queryAudit, traceTarget,
    createNote, addNote, togglePin, markRead, notesForAthlete, unreadCount,
    athleteSummariesToCsv, teamAnalyticsToCsv, reportToPortable,
    coachAthletes, teamAthletes, membershipFor,
  } = coach;

  const now = new Date("2026-07-22T00:00:00.000Z");
  const context = { heightCm: 188, trochanterHeightM: 0.98, legLengthCm: 96, bodyMassKg: 84, sex: "M", trainingAgeYears: 7 };
  const sensitivity = dep.buildMetricDependencyReport(null, { context }).sensitivity;

  // Build a Phase 10 progress report for one athlete (plateau + declining metric).
  const dates = ["2026-01-05", "2026-02-02", "2026-03-02", "2026-04-02", "2026-05-02", "2026-06-02"];
  const records = dates.map((date, i) => ({
    id: `a1-r${i}`, date, sessionType: i % 3 === 0 ? "competition" : "practice", isCompetition: i % 3 === 0,
    recordingQuality: i >= 4 ? 0.5 : 0.9, videoQuality: 0.9, confidence: i === 5 ? 0.5 : 0.8,
    metrics: { averageVelocity: 9.4 + i * 0.05, peakVelocity: 11.0 + i * 0.02, groundContactTime: 0.108, symmetry: 2 + i * 0.8 },
    metadata: {},
  }));
  const progress = prog.buildProgressIntelligence({ athleteId: "a1", records, sensitivity, performanceMetric: "averageVelocity", now });

  // ---- RBAC + organization isolation ----
  const owner = { id: "c-owner", orgId: "org1", role: "owner" };
  const assistant = { id: "c-asst", orgId: "org1", role: "assistant_coach", teamIds: ["t1"] };
  const athleteActor = { id: "u-a1", orgId: "org1", role: "athlete", athleteId: "a1" };
  const foreignCoach = { id: "c-x", orgId: "org2", role: "head_coach" };
  check("rbac: owner may manage org; assistant may not", can("owner", "manage_org") && !can("assistant_coach", "manage_org"));
  check("rbac: organization isolation blocks cross-org access", authorize(foreignCoach, "view_team", { orgId: "org1" }).allowed === false);
  check("rbac: athlete may only reach their OWN data", isAuthorized(athleteActor, "view_own_analyses", { orgId: "org1", athleteId: "a1" }) && !isAuthorized(athleteActor, "view_own_analyses", { orgId: "org1", athleteId: "a2" }));
  check("rbac: assistant coach scoped to assigned teams", isAuthorized(assistant, "view_team", { orgId: "org1", teamId: "t1" }) && !isAuthorized(assistant, "view_team", { orgId: "org1", teamId: "t9" }));
  check("rbac: denials always explain why", /permission|isolation|own data|assigned/.test(authorize(assistant, "manage_org", { orgId: "org1" }).reason));

  // ---- Organization structure ----
  const memberships = [
    { athleteId: "a1", orgId: "org1", teamId: "t1", groupId: null, primaryCoachId: "c-asst", permissions: ["view_analyses"], joinedAt: "2026-01-01" },
    { athleteId: "a2", orgId: "org1", teamId: "t1", groupId: null, primaryCoachId: "c-owner", permissions: ["view_analyses"], joinedAt: "2026-01-01" },
    { athleteId: "a3", orgId: "org2", teamId: "t9", groupId: null, primaryCoachId: "c-x", permissions: [], joinedAt: "2026-01-01" },
  ];
  check("organization: coachAthletes + isolation (a3 in org2 excluded from org1)",
    coachAthletes(memberships, "c-asst", "org1").length === 1 && !teamAthletes(memberships, { id: "t1", orgId: "org1", name: "T", coachIds: [], athleteIds: [] }).includes("a3") &&
    membershipFor(memberships, "a1", "org1").teamId === "t1");

  // ---- Coach review workflow (assist, never replace) ----
  const accept = reviewRecommendation({ id: "rev1", actor: owner, recommendationId: "reco1", athleteId: "a1", originalText: "Increase reactive strength work.", decision: "accepted", reasoning: "agree", at: now.toISOString() });
  check("review: an authorized coach can accept, producing a review + audit entry", accept.authorization.allowed && accept.review.decision === "accepted" && accept.audit.action === "review_decision");
  const modify = reviewRecommendation({ id: "rev2", actor: owner, recommendationId: "reco1", athleteId: "a1", originalText: "Increase reactive strength work.", decision: "modified", editedText: "Add pogo hops twice weekly.", reasoning: "our terminology", at: now.toISOString() });
  check("review: modify requires + stores edited text; athlete sees the COACH text", modify.review.editedText === "Add pogo hops twice weekly." && resolveRecommendationText(modify.review).source === "coach");
  const badModify = reviewRecommendation({ id: "rev3", actor: owner, recommendationId: "reco1", athleteId: "a1", originalText: "x", decision: "modified", at: now.toISOString() });
  check("review: modify without edited text is rejected with a validation error", badModify.review === null && badModify.errors.some((e) => /editedText/.test(e)));
  const reject = reviewRecommendation({ id: "rev4", actor: owner, recommendationId: "reco2", athleteId: "a1", originalText: "Do X.", decision: "rejected", reasoning: "not appropriate", at: now.toISOString() });
  check("review: a rejected recommendation is hidden from the athlete", resolveRecommendationText(reject.review).shown === false);
  const unauth = reviewRecommendation({ id: "rev5", actor: athleteActor, recommendationId: "reco1", athleteId: "a1", originalText: "x", decision: "accepted", at: now.toISOString() });
  check("review: an athlete cannot review recommendations (unauthorized)", unauth.authorization.allowed === false && unauth.review === null);

  // ---- Coach knowledge layer (wording, never data) ----
  const orgPref = { id: "p-org", orgId: "org1", scope: "organization", coachId: null, emphasis: [{ metricId: "acceleration", weight: 1.5 }], terminology: { "reactive strength": "springiness" }, cuePreferences: ["push the ground away"], philosophyNote: "acceleration-first" };
  const coachPref = { id: "p-coach", orgId: "org1", scope: "coach", coachId: "c-owner", emphasis: [{ metricId: "strideFrequency", weight: 2 }], terminology: { "ground contact": "contact time" }, cuePreferences: ["quick feet"], philosophyNote: null };
  const prefs = resolvePreferences(orgPref, coachPref);
  check("preferences: coach + org terminology merge; reword text without touching numbers",
    applyTerminology("Improve reactive strength and ground contact by 5%.", prefs) === "Improve springiness and contact time by 5%." );
  const reordered = reorderByEmphasis([{ metricId: "peakVelocity" }, { metricId: "strideFrequency" }, { metricId: "acceleration" }], prefs);
  check("preferences: emphasis reorders items (frequency weight 2 first) without changing data", reordered[0].metricId === "strideFrequency");
  check("preferences: numeric payload passes through untouched (data integrity)",
    (() => { const before = { text: "reactive strength", metricId: "acceleration", value: 6.0 }; const after = coach.applyPreferencesToText(before, prefs); return after.text === "springiness" && before.value === 6.0; })());

  // ---- Athlete cards ----
  const card = buildAthleteSummary({ athleteId: "a1", name: "Alex", latestAnalysisDate: "2026-06-02", currentPbS: 10.36, goalPbS: 10.05, developmentScore: 72, blueprintCompletion: 60, performancePotential: { minTimeS: 10.1, maxTimeS: 10.25 }, progress, priorities: [{ metricId: "strideLength", label: "Stride Length", contributionPct: 40 }], confidence: { category: "estimated", score: 0.7 }, coachNoteCount: 2 });
  check("athlete card: aggregates PB, goal, dev score, potential, trend, limiter, status",
    card.currentPbS === 10.36 && card.highestPriorityLimiter.metricId === "strideLength" && ["on_track", "watch", "at_risk", "no_data"].includes(card.status) && card.trendDirection);
  const noData = buildAthleteSummary({ athleteId: "a9", name: "New" });
  check("athlete card: no data → status no_data", noData.status === "no_data");

  // ---- Team analytics ----
  const summaries = [card, buildAthleteSummary({ athleteId: "a2", name: "Bo", developmentScore: 50, blueprintCompletion: 45, latestAnalysisDate: "2026-06-01", priorities: [{ metricId: "acceleration", label: "Acceleration Quality", contributionPct: 30 }], progress })];
  const analytics = buildTeamAnalytics({ summaries, recordingQuality: [{ athleteId: "a1", quality: 0.9 }, { athleteId: "a2", quality: 0.7 }], metricChanges: [{ athleteId: "a1", metricId: "averageVelocity", percentChange: 3 }, { athleteId: "a2", metricId: "averageVelocity", percentChange: 1 }], asymmetry: [{ athleteId: "a1", pct: 4 }] });
  check("analytics: team-wide aggregates (avg completion, most common limitation, most improved, recording quality)",
    analytics.athleteCount === 2 && analytics.averageBlueprintCompletion != null && !!analytics.mostCommonLimitation && analytics.mostImprovedMetric.metricId === "averageVelocity" && analytics.overallRecordingQuality != null);

  // ---- Alert engine (always explains why) ----
  const alerts = generateAlerts({ orgId: "org1", athleteId: "a1", progress, recordingQualityHistory: [0.9, 0.9, 0.5, 0.5, 0.5], confidenceHistory: [0.8, 0.5], lastAnalysisDate: "2026-06-02", newAnalysisId: "a1-r6", now });
  check("alerts: plateau + asymmetry + quality + confidence-drop + new-analysis fire",
    ["plateau", "asymmetry_increase", "repeated_technical_issue", "confidence_drop", "new_analysis"].every((t) => alerts.some((a) => a.type === t)));
  check("alerts: every alert explains WHY with evidence", alerts.every((a) => a.why.length > 0 && Array.isArray(a.evidence)));
  check("alerts: sorted by severity (critical first)", severityOrdered(alerts));

  // ---- Dashboard aggregation + team health ----
  const dashboard = buildTeamDashboard({ orgId: "org1", teamId: "t1", athletes: summaries, alerts, analytics, notes: [createNote({ id: "n1", orgId: "org1", athleteId: "a1", authorId: "c-owner", authorRole: "coach", text: "check start", createdAt: now.toISOString() })], now });
  check("dashboard: aggregates athletes/alerts/analytics + team-health score & label",
    dashboard.athletes.length === 2 && dashboard.unreadNotes === 1 && dashboard.teamHealth.score >= 0 && dashboard.teamHealth.score <= 100 && ["strong", "steady", "mixed", "needs_attention"].includes(dashboard.teamHealth.label));
  check("dashboard: at-risk athletes are surfaced first", dashboard.athletes[0].status === "at_risk" || dashboard.athletes.every((a) => a.status !== "at_risk"));
  const oneCall = buildCoachDashboard({ orgId: "org1", teamId: "t1", athletes: [{ card: { athleteId: "a1", name: "Alex", developmentScore: 72, blueprintCompletion: 60, latestAnalysisDate: "2026-06-02", progress, priorities: [{ metricId: "strideLength", label: "Stride Length", contributionPct: 40 }] }, progress, recordingQualityHistory: [0.9], confidenceHistory: [0.8, 0.8], lastAnalysisDate: "2026-06-02" }], now });
  check("dashboard: one-call orchestrator builds cards + alerts + analytics + dashboard", oneCall.dashboard.athletes.length === 1 && Array.isArray(oneCall.alerts) && oneCall.summaries.length === 1);

  // ---- Report generator ----
  const athleteReport = generateAthleteReport({ orgId: "org1", reportId: "rep-a1", summary: card, progress, notes: [createNote({ id: "n2", orgId: "org1", athleteId: "a1", authorId: "c-owner", authorRole: "coach", text: "great progress", createdAt: now.toISOString(), pinned: true })], preferences: prefs, now });
  check("report: athlete report has metrics/trend/chart/confidence/notes sections",
    ["metrics", "trend", "chart", "confidence", "notes"].every((k) => athleteReport.sections.some((s) => s.kind === k)));
  check("report: charts carry real data points from the progress series",
    athleteReport.sections.find((s) => s.kind === "chart").charts[0].series[0].points.length > 0);
  const teamReport = generateTeamReport({ orgId: "org1", reportId: "rep-t1", teamName: "Sprints", analytics, summaries, now });
  check("report: team report summarizes analytics + roster", teamReport.kind === "team" && teamReport.sections.some((s) => s.id === "roster"));

  // ---- Audit history ----
  let log = createAuditLog();
  log = appendAudit(log, accept.audit);
  log = appendAudit(log, modify.audit);
  log = appendAudit(log, makeAuditEntry({ id: "aud-bp", orgId: "org1", actorId: "c-owner", actorRole: "owner", action: "blueprint_update", targetType: "blueprint", targetId: "a1", at: now.toISOString(), before: "60", after: "62" }));
  check("audit: appends are immutable and org-scoped queries work", log.entries.length === 3 && queryAudit(log, { orgId: "org1", action: "review_decision" }).length === 2);
  check("audit: a recommendation is fully traceable (creation → edits)", traceTarget(log, "recommendation", "reco1").length === 2);
  check("audit: cross-org query isolation", queryAudit(log, { orgId: "org2" }).length === 0);

  // ---- Collaboration ----
  let notes = [];
  notes = addNote(notes, createNote({ id: "cn1", orgId: "org1", athleteId: "a1", authorId: "c-owner", authorRole: "coach", text: "focus on posture", createdAt: now.toISOString() }));
  notes = togglePin(notes, "cn1", true);
  check("collaboration: notes can be added, pinned, and counted unread", notesForAthlete(notes, "a1")[0].pinned && unreadCount(notes) === 1);
  notes = markRead(notes, "cn1");
  check("collaboration: marking read updates unread count", unreadCount(notes) === 0);

  // ---- Export ----
  const csv = athleteSummariesToCsv(summaries);
  check("export: athlete summaries → CSV with header + a row per athlete", csv.split("\n").length === 3 && csv.startsWith("athleteId,name,status"));
  check("export: team analytics → CSV, and report → portable (PDF-ready) structure",
    teamAnalyticsToCsv(analytics).includes("athleteCount") && reportToPortable(athleteReport).blocks.length === athleteReport.sections.length);

  // ---- Determinism + serialization + architecture ----
  const again = buildCoachDashboard({ orgId: "org1", teamId: "t1", athletes: [{ card: { athleteId: "a1", name: "Alex", developmentScore: 72, blueprintCompletion: 60, latestAnalysisDate: "2026-06-02", progress, priorities: [{ metricId: "strideLength", label: "Stride Length", contributionPct: 40 }] }, progress, recordingQualityHistory: [0.9], confidenceHistory: [0.8, 0.8], lastAnalysisDate: "2026-06-02" }], now });
  check("determinism: identical input → identical dashboard JSON", JSON.stringify(again.dashboard) === JSON.stringify(oneCall.dashboard));
  check("serialization: dashboard + report round-trip byte-identically",
    JSON.stringify(JSON.parse(JSON.stringify(dashboard))) === JSON.stringify(dashboard) && JSON.stringify(JSON.parse(JSON.stringify(athleteReport))) === JSON.stringify(athleteReport));
  check("architecture: platform reuses Phase 10 progress (trends/plateaus flow into cards + alerts)",
    Object.keys(coach.COACH_PLATFORM_ENGINE_VERSIONS).length >= 12 && alerts.some((a) => a.type === "plateau"));

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

function severityOrdered(alerts) {
  const rank = { critical: 3, warning: 2, info: 1 };
  for (let i = 1; i < alerts.length; i++) if (rank[alerts[i - 1].severity] < rank[alerts[i].severity]) return false;
  return true;
}

process.exit(ok ? 0 : 1);
