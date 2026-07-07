import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { rmSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = process.cwd();
const out = path.join(root, ".analysis-types-sanity-tmp");
const check = (label, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) process.exitCode = 1;
};

try {
  execFileSync(
    "npx",
    [
      "tsc",
      "src/lib/analysisTypes.ts",
      "--outDir",
      out,
      "--module",
      "commonjs",
      "--target",
      "es2022",
      "--skipLibCheck",
      "--strict",
    ],
    { cwd: root },
  );
  const {
    ANALYSIS_TYPE_CONFIG,
    accelerationProfileLabel,
    analysisTypeConfig,
    isAnalysisType,
  } = require(path.join(out, "analysisTypes.js"));
  const accel = ANALYSIS_TYPE_CONFIG.acceleration;
  const migration = readFileSync(
    path.join(root, "supabase/migrations/0013_acceleration_analysis.sql"),
    "utf8",
  );
  const upload = readFileSync(path.join(root, "src/app/athletes/[id]/VideoUpload.tsx"), "utf8");
  const actions = readFileSync(path.join(root, "src/app/sessions/actions.ts"), "utf8");

  check("acceleration has the stable internal type", accel.type === "acceleration");
  check("fly is a valid analysis type", isAnalysisType("fly"));
  check("acceleration is a valid analysis type", isAnalysisType("acceleration"));
  check("unknown analysis types are rejected", !isAnalysisType("curve") && !isAnalysisType(null));
  check("acceleration displays as AVA Accel Test", accel.displayTitle === "AVA Accel Test");
  check("acceleration points to IMG_1961.MOV", accel.sourceVideoName === "IMG_1961.MOV");
  check("acceleration has a benchmark link", typeof accel.benchmarkId === "string");
  check(
    "20m and 30m profile copy follows distance",
    accelerationProfileLabel(20) === "0–20m acceleration profile" &&
      accelerationProfileLabel(30) === "0–30m acceleration profile",
  );
  check(
    "missing/legacy analysis type safely falls back to fly",
    analysisTypeConfig(null).type === "fly",
  );
  check(
    "sessions persist analysis_type",
    /sessions[\s\S]*add column analysis_type public\.sprint_analysis_type/.test(migration),
  );
  check(
    "selected mode is stored on the session",
    /update\(\{[\s\S]*analysis_type:\s*analysisType/.test(actions),
  );
  check(
    "existing sessions default safely to fly",
    /analysis_type public\.sprint_analysis_type default 'fly'/.test(migration),
  );
  check("new uploads wait for an explicit mode", /analysis_type:\s*null/.test(upload));
} finally {
  rmSync(out, { recursive: true, force: true });
}
