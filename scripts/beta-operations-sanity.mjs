import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const root=process.cwd(),out=path.join(root,".beta-operations-tmp"),require=createRequire(import.meta.url);
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
execFileSync("npx",["tsc","src/lib/beta/profileReadiness.ts","src/lib/beta/videoPreflight.ts","src/lib/beta/config.ts","src/lib/privacy/consent.ts","--outDir",out,"--module","commonjs","--target","es2022","--skipLibCheck"],{cwd:root,stdio:["ignore","ignore","inherit"]});
const profile=require(path.join(out,"beta/profileReadiness.js"));
const video=require(path.join(out,"beta/videoPreflight.js"));
const migration=readFileSync(path.join(root,"supabase/migrations/0056_beta_operations_foundation.sql"),"utf8");
const actions=readFileSync(path.join(root,"src/app/support/actions.ts"),"utf8");
const operator=readFileSync(path.join(root,"src/app/admin/operations/page.tsx"),"utf8");

assert.equal(profile.assessProfileReadiness({}).status,"missing_required");
assert.equal(profile.assessProfileReadiness({full_name:"Runner"}).status,"analysis_ready");
assert.equal(profile.assessProfileReadiness({full_name:"Runner",height_cm:180,leg_length_cm:95}).status,"partially_individualized");
assert.equal(profile.assessProfileReadiness({full_name:"Runner",height_cm:180,leg_length_cm:95,sex:"M",personal_best_100m:11}).status,"fully_individualized");

assert.equal(video.preflightVideo({fileName:"run.mp4",fileSizeBytes:100,durationSeconds:20,width:1920,height:1080,frameRate:60}).status,"supported");
assert.equal(video.preflightVideo({fileName:"run.mp4",fileSizeBytes:100,durationSeconds:20,width:1080,height:1920,frameRate:30}).status,"warning");
assert.equal(video.preflightVideo({fileName:"run.exe",fileSizeBytes:100}).status,"unsupported");
assert.equal(video.preflightVideo({fileName:"run.mov",fileSizeBytes:600*1024*1024}).blockingIssues[0].code,"file_too_large");
assert.equal(video.preflightVideo({fileName:"run.m4v",fileSizeBytes:100,durationSeconds:61}).blockingIssues[0].code,"duration_too_long");
assert.equal(video.preflightVideo({fileName:"run.mp4",fileSizeBytes:100}).warnings[0].code,"metadata_unavailable");

assert.match(migration,/revoke update on public\.profiles from authenticated/);
assert.match(migration,/users create scoped support requests/);
assert.match(migration,/analysis_id is null or exists/);
assert.match(migration,/revoke insert, update, delete on public\.beta_audit_events/);
assert.match(migration,/sessions_beta_active_upload_limit/);
assert.match(actions,/maxSupportSubmissionsPerHour/);
assert.doesNotMatch(actions,/signedUrl|access_token|password/);
assert.match(operator,/requireAdmin/);
assert.doesNotMatch(operator,/source_video_path|last_error_message/);

rmSync(out,{recursive:true,force:true});
console.log("beta operations sanity: passed");
