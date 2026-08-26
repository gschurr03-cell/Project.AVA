// Phase 0 — deterministic + live-database checks for
// validation/stationary-validation-registry.json and the roadmap weights in
// docs/stationary-roadmap-progress.md.
//
//   node --env-file=.env.local scripts/stationary-validation-registry-sanity.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

const registry = JSON.parse(readFileSync("validation/stationary-validation-registry.json", "utf8"));
const benchmarks = registry.benchmarks ?? [];

// --- Structural checks (no DB needed) ---------------------------------------

check("registry has a schemaVersion", typeof registry.schemaVersion === "string" && registry.schemaVersion.length > 0);
check("registry has at least 4 benchmarks", benchmarks.length >= 4);

const keys = benchmarks.map((b) => b.benchmarkKey);
check("all benchmark keys are unique", new Set(keys).size === keys.length);
check(
  "the 4 expected benchmark keys are present",
  ["gav_stationary_reference", "vanni_fly_240", "vanni_fly_120", "vanni_fly_60"].every((k) => keys.includes(k)),
);

const sessionIds = benchmarks.map((b) => b.sessionId);
check("all session IDs are unique", new Set(sessionIds).size === sessionIds.length);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
check("every sessionId is a well-formed UUID", benchmarks.every((b) => UUID_RE.test(b.sessionId)));
check("every analysisId is a well-formed UUID", benchmarks.every((b) => UUID_RE.test(b.analysisId)));

const REQUIRED_FIELDS = [
  "benchmarkKey", "athlete", "sessionId", "sessionTitle", "analysisId", "sourceFilename",
  "storagePath", "verifiedFps", "resolution", "durationSeconds", "frameCount", "recordingType",
  "cameraType", "travelDirection", "benchmarkTier", "protected", "analysisStatus", "groundTruth",
  "currentProductionOutputs", "roadmapRole",
];
for (const b of benchmarks) {
  check(`${b.benchmarkKey}: has all required fields`, REQUIRED_FIELDS.every((f) => f in b));
}

check(
  "every verifiedFps.analysisFps is a positive, finite number",
  benchmarks.every((b) => Number.isFinite(b.verifiedFps?.analysisFps) && b.verifiedFps.analysisFps > 0),
);
check(
  "every verifiedFps carries both averageFps and timestampFps evidence (not title-derived)",
  benchmarks.every((b) => Number.isFinite(b.verifiedFps?.averageFps) && Number.isFinite(b.verifiedFps?.timestampFps)),
);

const gav = benchmarks.find((b) => b.benchmarkKey === "gav_stationary_reference");
check("gav_stationary_reference exists", !!gav);
check("gav_stationary_reference.protected === true", gav?.protected === true);
check(
  "no non-Gav benchmark is marked protected",
  benchmarks.filter((b) => b.benchmarkKey !== "gav_stationary_reference").every((b) => b.protected === false),
);
check(
  "ground truth is never transferred: only gav_stationary_reference has groundTruth.status === 'available'",
  benchmarks.filter((b) => b.groundTruth?.status === "available").every((b) => b.benchmarkKey === "gav_stationary_reference"),
);
check(
  "every non-Gav benchmark explicitly marks groundTruth unavailable (not silently omitted)",
  benchmarks.filter((b) => b.benchmarkKey !== "gav_stationary_reference").every((b) => b.groundTruth?.status === "unavailable"),
);

// --- Live-database checks ----------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.log("\nSKIPPED live-database checks (Supabase service environment not set).");
} else {
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  for (const b of benchmarks) {
    const { data: session, error: sessionErr } = await service
      .from("sessions")
      .select("id, is_reference_benchmark, current_working_analysis_id")
      .eq("id", b.sessionId)
      .maybeSingle();
    check(`${b.benchmarkKey}: registry session ID exists in the live database`, !sessionErr && !!session);

    if (b.benchmarkKey === "gav_stationary_reference") {
      check(`${b.benchmarkKey}: the live session is actually protected`, session?.is_reference_benchmark === true);
    }

    const { data: analysis, error: analysisErr } = await service
      .from("analyses")
      .select("id, status, session_id")
      .eq("id", b.analysisId)
      .maybeSingle();
    check(`${b.benchmarkKey}: registry analysis ID exists in the live database`, !analysisErr && !!analysis);
    check(`${b.benchmarkKey}: the analysis belongs to the registry's session`, analysis?.session_id === b.sessionId);
    check(`${b.benchmarkKey}: the analysis is complete (matches analysisStatus: "${b.analysisStatus}")`, analysis?.status === b.analysisStatus);

    const { data: videoList, error: videoErr } = await service.storage
      .from("sprint-videos")
      .list(b.storagePath.split("/")[0], { search: b.storagePath.split("/")[1] });
    const videoExists = !videoErr && (videoList ?? []).some((o) => o.name === b.storagePath.split("/")[1]);
    check(`${b.benchmarkKey}: source video storage object exists`, videoExists);

    if (b.poseArtifactPath) {
      const parts = b.poseArtifactPath.split("/");
      const fileName = parts.pop();
      const dir = parts.join("/");
      const { data: poseList, error: poseErr } = await service.storage.from("pose-artifacts").list(dir, { search: fileName });
      const poseExists = !poseErr && (poseList ?? []).some((o) => o.name === fileName);
      check(`${b.benchmarkKey}: pose artifact storage object exists`, poseExists);
    }
  }
}

// --- Roadmap weight check ----------------------------------------------------

const roadmapMd = readFileSync("docs/stationary-roadmap-progress.md", "utf8");
// Only the main phase table's rows start a line with "| <phase-number 0-17> |"
// immediately followed by a name cell and a weight cell — parsed cell-by-cell
// (split on "|") rather than one big regex, so it can't accidentally match
// the "Phase Complete"/"Weighted Contribution" percent columns in the same
// row, or the per-phase "**Weight**: N%" detail lines later in the file.
const phaseRowRe = /^\|\s*(\d{1,2})\s*\|([^|]+)\|\s*(\d+(?:\.\d+)?)%\s*\|/;
const weights = [];
for (const line of roadmapMd.split("\n")) {
  const m = phaseRowRe.exec(line.trim());
  if (m && Number(m[1]) >= 0 && Number(m[1]) <= 17) weights.push(Number(m[3]));
}
check(`roadmap progress table has 18 phase rows (0-17) (found ${weights.length})`, weights.length === 18);
const totalWeight = weights.reduce((a, b) => a + b, 0);
check(`roadmap phase weights total exactly 100% (got ${totalWeight}%)`, Math.abs(totalWeight - 100) < 1e-9);

console.log("\n" + (ok ? "ALL PASSED" : "FAILURES PRESENT"));
process.exit(ok ? 0 : 1);
