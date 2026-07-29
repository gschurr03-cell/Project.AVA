import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
execFileSync(".venv/bin/python",["scripts/local-gate-lock-fixture.py"],{stdio:"inherit"});
const result=JSON.parse(readFileSync("/tmp/ava-local-gate-lock.json","utf8"));
const summary=JSON.parse(readFileSync("/tmp/ava-local-gate-lock-fixture-summary.json","utf8"));
for(const gate of ["start","finish"]) for(const frame of result.gates[gate].frames){
  if(frame.state==="lost") assert.equal(frame.render,false);
  if(frame.state==="locked") { assert.equal(frame.timingEligible,true); assert.ok((frame.correctionJumpPx??0)<=8+1e-9); assert.ok((frame.scaleChange??0)<=.08); }
  if(frame.state!=="locked") assert.notEqual(frame.timingEligible,true);
}
assert.ok(summary.summary.finish.maxMidpointErrorPx<=4);assert.ok(summary.summary.finish.meanEndpointErrorPx<=6);assert.ok(summary.summary.finish.maxAngularErrorDeg<=1);
assert.ok(result.gates.start.frames.slice(95,104).every(frame=>frame.state!=="lost"));
assert.ok(result.gates.finish.frames.slice(162,164).every(frame=>frame.state==="lost"));
console.log("gate stability sanity: passed; start remains validation-limited, finish meets annotated targets");
