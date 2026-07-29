import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const checklist=JSON.parse(readFileSync("config/mvp-release-checklist.json","utf8"));
assert.equal(checklist.schemaVersion,"ava-mvp-release-checklist-v1");
assert.ok(checklist.items.length>=10);
for(const item of checklist.items) for(const key of ["category","item","status","evidence","owner","blocker","nextAction"]) assert.ok(key in item);
assert.ok(checklist.items.some(item=>item.category==="mobile"&&item.status==="blocked"));
assert.ok(checklist.items.some(item=>item.category==="timing"&&item.status==="blocked"));
console.log("release readiness sanity: passed");
