import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const env=readFileSync("src/lib/config/env.ts","utf8");
const example=readFileSync(".env.local.example","utf8");
for(const key of ["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","SUPABASE_SERVICE_ROLE_KEY","ANALYSIS_WORKER_SECRET"]) assert.ok(env.includes(key)&&example.includes(key));
assert.doesNotMatch(env,/console\.(log|info|warn)\([^)]*(SERVICE_ROLE|WORKER_SECRET)/);
assert.match(example,/NEXT_PUBLIC_FEATURE_PANNING_TIMING=false/);
console.log("environment sanity: passed");
