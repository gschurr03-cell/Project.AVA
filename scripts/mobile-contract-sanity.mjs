import assert from"node:assert/strict";import{readFileSync}from"node:fs";import path from"node:path";
const root=process.cwd(),contract=path.join(root,"contracts/mobile/v1"),fixture=path.join(root,"ios/AVASprint/Tests/AVASprintCoreTests/Fixtures");
for(const file of["manifest-summary.json","report-summary.json"]){
 const canonical=JSON.parse(readFileSync(path.join(contract,file),"utf8"));
 const swift=JSON.parse(readFileSync(path.join(fixture,file),"utf8"));
 assert.deepEqual(swift,canonical,`${file} Swift fixture drifted`);
 assert.match(canonical.contractVersion,/^ava-mobile-/);
}
const manifest=JSON.parse(readFileSync(path.join(contract,"manifest-summary.json"),"utf8"));
assert.equal(manifest.authoritative,true);assert.equal(manifest.status,"active");
assert.ok(!("staged" in manifest));assert.ok(!("shadow" in manifest));
console.log("mobile contract sanity: passed");
