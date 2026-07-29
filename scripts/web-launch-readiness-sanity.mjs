import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const read = (file) => readFileSync(file, "utf8");
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n");
assert.equal(tracked.some((file) => file.startsWith(".next-")), false, "generated Next builds must not be tracked");
assert.match(read(".gitignore"), /\/\.next-\*\//);

const queue = read("src/app/sessions/actions.ts");
assert.match(queue, /video_path/);
assert.match(queue, /Upload must finish before analysis can begin/);

const env = read("src/lib/config/env.ts");
assert.match(env, /NEXT_PUBLIC_APP_URL/);
assert.match(env, /A public application URL is required/);

const auth = read("src/app/login/actions.ts");
assert.doesNotMatch(auth, /error\.message\)\}`/);
assert.doesNotMatch(auth, /NEXT_PUBLIC_APP_URL\?\?"http:\/\/localhost/);

const nav = read("src/components/nav/AppSidebar.tsx");
assert.doesNotMatch(nav, /href: "\/athlete\/intelligence"/);
assert.doesNotMatch(nav, /href: "\/comparisons"/);
assert.match(nav, /href="\/support"/);

const upload = read("src/app/athletes/[id]/VideoUpload.tsx");
assert.match(upload, /maximum 512 MB/);
assert.match(upload, /aria-live="polite"/);
assert.doesNotMatch(upload, /message: uploadError\.message/);

const matrix = read("docs/web-mvp-launch-readiness.md");
for (const area of ["Authentication", "Video upload", "Worker lifecycle", "Security", "Deployment"]) {
  assert.ok(matrix.includes(area), `readiness matrix missing ${area}`);
}
assert.match(read("src/lib/supabase/middleware.ts"), /"\/support"/);
console.log("web launch readiness sanity: passed");
