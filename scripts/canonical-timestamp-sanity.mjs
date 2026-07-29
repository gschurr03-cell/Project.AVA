// Regression sanity for the generatedAt route crash (ZodError invalid datetime
// at ["context","generatedAt"]).
//
//   node scripts/canonical-timestamp-sanity.mjs
//
// Asserts that toCanonicalIso normalizes every timestamp form the app can
// encounter into canonical ISO-8601 UTC (Z) that passes z.string().datetime(),
// and returns null (never throws, never invents a time) for absent/unparseable
// values. Covers the exact PostgREST value that caused the production crash.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { z } from "zod";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".canonical-timestamp-sanity-tmp");

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

const datetime = z.string().datetime(); // the exact validator the contracts use

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        outDir: out, rootDir: path.join(root, "src"), module: "commonjs",
        target: "es2022", skipLibCheck: true, esModuleInterop: true, strict: true,
        moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] },
      },
      files: [path.join(root, "src/lib/time/canonicalTimestamp.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], {
    cwd: root, stdio: ["ignore", "inherit", "inherit"],
  });

  const { toCanonicalIso } = require(path.join(out, "lib/time/canonicalTimestamp.js"));

  // --- Valid inputs → canonical Z that PASSES z.string().datetime() -----------
  const zForm = toCanonicalIso("2026-07-21T03:43:45.584Z");
  check("valid ISO datetime with Z stays canonical + passes .datetime()",
    zForm === "2026-07-21T03:43:45.584Z" && datetime.safeParse(zForm).success);

  // The EXACT value from PostgREST that caused the crash (offset + microseconds).
  const dbForm = toCanonicalIso("2026-07-21T03:43:45.584065+00:00");
  check("REAL DB value (ISO +00:00 offset, microseconds) → Z + passes .datetime()",
    dbForm === "2026-07-21T03:43:45.584Z" && datetime.safeParse(dbForm).success);

  const offset = toCanonicalIso("2026-07-21T05:43:45.584+02:00");
  check("valid ISO datetime with non-zero offset → equivalent UTC Z + passes",
    offset === "2026-07-21T03:43:45.584Z" && datetime.safeParse(offset).success);

  // PostgreSQL text form (space separator) — the legacy/raw-psql shape.
  const pg = toCanonicalIso("2026-07-21 03:43:45.584065+00");
  check("PostgreSQL-style space-separated timestamp → Z + passes .datetime()",
    pg === "2026-07-21T03:43:45.584Z" && datetime.safeParse(pg).success);

  // Date object encountered internally.
  const dateObj = toCanonicalIso(new Date("2026-07-21T03:43:45.584Z"));
  check("Date object input → canonical Z + passes .datetime()",
    dateObj === "2026-07-21T03:43:45.584Z" && datetime.safeParse(dateObj).success);

  // Legacy stored result: a previously-persisted analysis timestamp (offset form).
  const legacy = toCanonicalIso("2025-01-02T10:20:30+00:00");
  check("legacy stored result (offset, no ms) → Z + passes .datetime()",
    legacy === "2025-01-02T10:20:30.000Z" && datetime.safeParse(legacy).success);

  // --- Absent / unparseable → null (never throws, never invents a time) -------
  check("null → null (absence modeled explicitly)", toCanonicalIso(null) === null);
  check("undefined → null", toCanonicalIso(undefined) === null);
  check("empty string → null", toCanonicalIso("") === null);
  check("whitespace-only string → null", toCanonicalIso("   ") === null);
  check("invalid string ('not-a-date') → null, does not throw",
    toCanonicalIso("not-a-date") === null);
  check("'Invalid Date' object → null, does not throw",
    toCanonicalIso(new Date("nope")) === null);

  // The bug reproduction: raw DB value FAILS the validator, normalized value PASSES.
  check("REPRO: raw PostgREST value fails .datetime(), normalized value passes",
    datetime.safeParse("2026-07-21T03:43:45.584065+00:00").success === false &&
      datetime.safeParse(toCanonicalIso("2026-07-21T03:43:45.584065+00:00")).success === true);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
