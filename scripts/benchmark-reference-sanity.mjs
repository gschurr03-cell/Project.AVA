// Guards the PERMANENT AVA Calab Vid 1 (VueMotion 20 m) benchmark reference.
//
//   node scripts/benchmark-reference-sanity.mjs
//
// AVA Calab Vid 1 is the project's permanent accuracy target and must survive any
// db reset/seed. It is seeded by migration 0009 (which runs on every reset) and
// re-asserted by the dev seed. This test statically verifies BOTH still carry the
// fixed benchmark id and every VueMotion reference value — so an accidental edit
// or deletion of the reference fails CI instead of silently dropping the target.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

const BENCHMARK_ID = "44444444-4444-4444-8444-444444444444";
// Every VueMotion reference value that must remain present (key + value).
const REQUIRED = {
  zoneTimeS: 1.93,
  avgVelocityMps: 10.36,
  maxVelocityMps: 10.74,
  avgStepLengthM: 2.15,
  leftStepLengthM: 2.16,
  rightStepLengthM: 2.14,
  combinedStepFrequencyHz: 4.86,
  leftStepFrequencyHz: 5.0,
  rightStepFrequencyHz: 4.72,
  groundContactLeftMs: 80,
  groundContactRightMs: 80,
  flightLeftMs: 120,
  flightRightMs: 130,
};

const migration = readFileSync(path.join(root, "supabase/migrations/0009_benchmarks.sql"), "utf8");
const migration10 = readFileSync(
  path.join(root, "supabase/migrations/0010_benchmark_combined_frequency.sql"),
  "utf8",
);
const seed = readFileSync(path.join(root, "scripts/dev-seed.mjs"), "utf8");

// The benchmarks table + the seeded row must exist in migration 0009.
check("migration 0009 creates the benchmarks table", /create table\s+public\.benchmarks/i.test(migration));
check("migration 0009 seeds a benchmark row", /insert into\s+public\.benchmarks/i.test(migration));
check("migration 0009 uses the fixed permanent benchmark id", migration.includes(BENCHMARK_ID));
check("migration 0009 names it AVA Calab Vid 1", migration.includes("AVA Calab Vid 1"));
check("migration 0009 is idempotent (on conflict do nothing)", /on conflict.*do nothing/is.test(migration));

// Every required VueMotion value is present across migrations 0009 + 0010.
const migrations = migration + "\n" + migration10;
for (const [key, value] of Object.entries(REQUIRED)) {
  check(
    `reference metric ${key}=${value} present in migrations`,
    migrations.includes(`'${key}'`) && migrations.includes(String(value)),
  );
}

// The dev seed re-asserts the same benchmark id (idempotent belt-and-suspenders),
// so `npm run dev:seed` can never leave the system without its benchmark.
check("dev seed re-asserts the benchmark id", seed.includes(BENCHMARK_ID));
check("dev seed upserts into the benchmarks table", /from\("benchmarks"\)\s*\.upsert/s.test(seed));
check("dev seed carries the combined-frequency reference (4.86)", seed.includes("4.86"));

console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
process.exit(ok ? 0 : 1);
