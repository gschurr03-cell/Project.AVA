// Sanity for the result-presentation model (Part 1 §10): status → banner / metric
// mode / recommendation-currentness / retry.
//
//   node scripts/result-presentation-sanity.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".result-presentation-tmp");
let ok = true;
const check = (l, c) => { console.log(`${c ? "PASS" : "FAIL"}  ${l}`); if (!c) ok = false; };

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] } },
    files: [path.join(root, "src/lib/calibration/resultPresentation.ts"), path.join(root, "src/lib/calibration/lifecycle.ts"), path.join(root, "src/lib/calibration/authority.ts"), path.join(root, "src/lib/calibration/gates.ts")],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
  const { resultPresentation } = require(path.join(out, "lib/calibration/resultPresentation.js"));

  const cur = resultPresentation("current");
  check("current → no banner, normal metrics, recommendations current, no retry",
    cur.banner === null && cur.metrics === "normal" && cur.recommendationsCurrent === true && cur.retry === false);

  const pend = resultPresentation("pending");
  check("pending → recalculation banner, pending metrics, recommendations NOT current",
    /recalculation pending/i.test(pend.banner) && pend.metrics === "pending" && pend.recommendationsCurrent === false);

  const sup = resultPresentation("superseded");
  check("superseded → previous-result banner, muted metrics, recommendations NOT current",
    /previous result/i.test(sup.banner) && sup.metrics === "muted_previous" && sup.recommendationsCurrent === false);

  const fail = resultPresentation("failed");
  check("failed → failure banner, retry offered, recommendations NOT current",
    /failed/i.test(fail.banner) && fail.retry === true && fail.recommendationsCurrent === false);

  check("ONLY current presents recommendations as current",
    ["pending", "superseded", "failed"].every((s) => resultPresentation(s).recommendationsCurrent === false));

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
