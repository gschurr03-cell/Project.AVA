// Source-level sanity check for the `aria-valuenow` server/client hydration
// mismatch (observed as e.g. server="24" vs client="25"): a `useState` initializer
// that calls `Date.now()`/`Math.random()`/does an elapsed-time calculation runs
// independently on the server render and the client's hydration render, so the
// two can disagree on the very first paint — React then flags a hydration error
// on whatever DOM attribute that value feeds (here, a progressbar's aria-valuenow).
//
// This does not spin up React/jsdom (no test runner is wired up yet — see
// CLAUDE.md); it asserts the specific fix in place: no client/server-shared
// component seeds state from the wall clock or randomness, and repo-wide, no
// `useState` initializer calls `Date.now()`/`Math.random()` directly.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
let ok = true;
const check = (label, condition) => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) ok = false;
};

const progressCard = readFileSync(
  path.join(root, "src/app/sessions/[id]/AnalysisProgressCard.tsx"), "utf8",
);
check("AnalysisProgressCard: nowMs no longer seeds from Date.now() on first render",
  !/useState<number>\(\(\) =>\s*Date\.now\(\)\)/.test(progressCard));
check("AnalysisProgressCard: nowMs seeds deterministically from the server-provided initialUpdatedAt snapshot",
  /const \[nowMs, setNowMs\] = useState<number>\(\(\) =>\s*\n\s*initialUpdatedAt \? Date\.parse\(initialUpdatedAt\) : 0,/.test(progressCard));
check("AnalysisProgressCard: updatedAtMs no longer falls back to Date.now() (a second hydration-mismatch source)",
  !/initialUpdatedAt \? Date\.parse\(initialUpdatedAt\) : Date\.now\(\)/.test(progressCard));
check("AnalysisProgressCard: the real clock starts only from an effect, strictly after mount",
  /useEffect\(\(\) => \{\s*setNowMs\(Date\.now\(\)\);\s*\}, \[\]\);/.test(progressCard));

const experience = readFileSync(
  path.join(root, "src/app/sessions/[id]/path-to-goal/AnalysisProgressExperience.tsx"), "utf8",
);
check("AnalysisProgressExperience: now no longer seeds from Date.now() on first render",
  !/useState\(\(\) =>\s*Date\.now\(\)\)/.test(experience));
check("AnalysisProgressExperience: now seeds deterministically from the server-provided startedAtMs prop",
  /const \[now, setNow\] = useState\(\(\) => startedAtMs\);/.test(experience));
check("AnalysisProgressExperience: the real clock starts only from an effect, strictly after mount",
  /useEffect\(\(\) => \{\s*setNow\(Date\.now\(\)\);/.test(experience));

// Repo-wide guard: no *.tsx/*.ts file seeds a useState initializer from the wall
// clock or randomness — the exact anti-pattern behind this bug class.
const offenders = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) { walk(full); continue; }
    if (!/\.tsx?$/.test(entry)) continue;
    const text = readFileSync(full, "utf8");
    if (/useState(?:<[^>]*>)?\(\s*\(\)\s*=>\s*(Date\.now\(\)|Math\.random\(\))\s*\)/.test(text)) {
      offenders.push(path.relative(root, full));
    }
  }
};
walk(path.join(root, "src"));
check(`repo-wide: no useState initializer calls Date.now()/Math.random() directly (found: ${offenders.join(", ") || "none"})`,
  offenders.length === 0);

console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
process.exit(ok ? 0 : 1);
