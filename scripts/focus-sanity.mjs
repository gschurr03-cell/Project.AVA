// Runtime sanity for the athlete training-focus synthesizer.
//
//   node scripts/focus-sanity.mjs
//
// Compiles the focus module (which pulls the recommendation engine + zod
// metric schema) to a throwaway dir and asserts the aggregation behaviour:
// persistence weighting, recency-aware trend detection, deterministic ranking,
// the all-clear path, and graceful handling of unparseable metrics.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".focus-sanity-tmp");

// tsc leaves the `@/*` alias untouched in emitted JS, so map it back to the
// compiled output at require time (output mirrors src/ under `out`).
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

// A full, valid AnalysisMetrics payload. Overrides let each fixture dial in a
// specific limiter. Defaults sit comfortably within every target range.
function metrics(overrides = {}) {
  return {
    topSpeedMps: 10.2,
    avgStrideLengthM: 2.2,
    strideFrequencyHz: 4.8,
    groundContactTimeMs: 85,
    flightTimeMs: 130,
    peakKneeFlexionDeg: 130,
    avgTrunkLeanDeg: 8,
    ...overrides,
  };
}

const day = (n) => new Date(2026, 0, n).toISOString();

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  // focus.ts imports via the `@/*` alias, which tsc can only resolve from a
  // tsconfig (not CLI flags). Emit a throwaway project that pins the alias and
  // rootDir=src so the compiled layout mirrors src/ under `out`.
  const tsconfigPath = path.join(out, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir: out,
        rootDir: path.join(root, "src"),
        module: "commonjs",
        target: "es2022",
        skipLibCheck: true,
        esModuleInterop: true,
        strict: true,
        moduleResolution: "node",
        baseUrl: root,
        paths: { "@/*": ["src/*"] },
      },
      files: [path.join(root, "src/lib/coaching/focus.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", tsconfigPath], {
    cwd: root,
    stdio: ["ignore", "inherit", "inherit"],
  });
  const { buildTrainingFocus } = require(path.join(out, "lib/coaching/focus.js"));

  // (1) Empty input → nothing analyzed, no focus, not all-clear.
  const none = buildTrainingFocus([]);
  check(
    "empty input → sessionsAnalyzed 0, no primary, not all-clear",
    none.sessionsAnalyzed === 0 && none.primary === null && none.allClear === false,
  );

  // (2) All-clear: every metric within target across every session.
  const clear = buildTrainingFocus([
    { id: "a", created_at: day(1), metrics: metrics() },
    { id: "b", created_at: day(2), metrics: metrics() },
  ]);
  check(
    "all within target → allClear, no areas, 2 sessions counted",
    clear.allClear === true && clear.areas.length === 0 && clear.sessionsAnalyzed === 2,
  );

  // (3) Persistence + ranking: contact-time limiter in every session should
  //     outrank a one-off stride-length limiter that appears only once.
  const ranked = buildTrainingFocus([
    { id: "a", created_at: day(1), metrics: metrics({ groundContactTimeMs: 105 }) },
    { id: "b", created_at: day(2), metrics: metrics({ groundContactTimeMs: 104 }) },
    {
      id: "c",
      created_at: day(3),
      metrics: metrics({ groundContactTimeMs: 103, avgStrideLengthM: 1.8 }),
    },
  ]);
  check("recurring limiter aggregated across 3 sessions", ranked.sessionsAnalyzed === 3);
  check(
    "primary focus is the persistent contact-time limiter",
    ranked.primary && ranked.primary.id === "ground-contact-time",
  );
  const contact = ranked.areas.find((a) => a.id === "ground-contact-time");
  const stride = ranked.areas.find((a) => a.id === "stride-length");
  check(
    "persistent limiter recorded 3 occurrences, 100% persistence",
    contact && contact.occurrences === 3 && contact.persistencePct === 100,
  );
  check(
    "one-off limiter recorded 1 occurrence, ~33% persistence",
    stride && stride.occurrences === 1 && stride.persistencePct === 33,
  );
  check(
    "persistent limiter outranks the one-off by focus score",
    contact && stride && contact.focusScore > stride.focusScore,
  );

  // (4) Trend detection is recency-aware (input given newest-first to prove the
  //     module sorts internally). Contact time drifting further off target over
  //     time → "worsening".
  const worsening = buildTrainingFocus([
    { id: "c", created_at: day(3), metrics: metrics({ groundContactTimeMs: 120 }) },
    { id: "b", created_at: day(2), metrics: metrics({ groundContactTimeMs: 105 }) },
    { id: "a", created_at: day(1), metrics: metrics({ groundContactTimeMs: 95 }) },
  ]);
  check(
    "limiter getting worse over time → trend 'worsening'",
    worsening.primary && worsening.primary.trend === "worsening",
  );

  const improving = buildTrainingFocus([
    { id: "a", created_at: day(1), metrics: metrics({ groundContactTimeMs: 120 }) },
    { id: "b", created_at: day(2), metrics: metrics({ groundContactTimeMs: 105 }) },
    { id: "c", created_at: day(3), metrics: metrics({ groundContactTimeMs: 95 }) },
  ]);
  check(
    "limiter drifting back to target → trend 'improving'",
    improving.primary && improving.primary.trend === "improving",
  );

  // (5) Latest-occurrence snapshot: display copy + supporting metric come from
  //     the most recent session, not the first.
  check(
    "supporting metric reflects the latest session's reading",
    improving.primary &&
      improving.primary.supportingMetrics.some((m) => /95 ms/.test(m.value)),
  );

  // (6) Unparseable metrics are skipped, valid ones still counted; no throw.
  const mixed = buildTrainingFocus([
    { id: "a", created_at: day(1), metrics: { junk: true } },
    { id: "b", created_at: day(2), metrics: null },
    { id: "c", created_at: day(3), metrics: metrics({ strideFrequencyHz: 4.2 }) },
  ]);
  check(
    "invalid metrics skipped → only 1 valid session aggregated",
    mixed.sessionsAnalyzed === 1 && mixed.primary && mixed.primary.id === "step-frequency",
  );
  check("single-occurrence limiter trend defaults to 'steady'", mixed.primary.trend === "steady");

  // (7) Determinism: identical input yields identical ranking.
  const a = buildTrainingFocus(ranked.areas.length ? [
    { id: "a", created_at: day(1), metrics: metrics({ groundContactTimeMs: 105, avgStrideLengthM: 1.8 }) },
    { id: "b", created_at: day(2), metrics: metrics({ groundContactTimeMs: 104, avgStrideLengthM: 1.9 }) },
  ] : []);
  const b = buildTrainingFocus([
    { id: "b", created_at: day(2), metrics: metrics({ groundContactTimeMs: 104, avgStrideLengthM: 1.9 }) },
    { id: "a", created_at: day(1), metrics: metrics({ groundContactTimeMs: 105, avgStrideLengthM: 1.8 }) },
  ]);
  check(
    "ranking is deterministic regardless of input order",
    JSON.stringify(a.areas.map((x) => x.id)) === JSON.stringify(b.areas.map((x) => x.id)),
  );

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
