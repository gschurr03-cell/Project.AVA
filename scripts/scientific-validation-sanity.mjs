import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync,rmSync,writeFileSync,readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
const root=process.cwd(),out=path.join(root,".scientific-validation-sanity-tmp"),require=createRequire(import.meta.url);
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
try{
  writeFileSync(path.join(out,"tsconfig.json"),JSON.stringify({compilerOptions:{outDir:out,rootDir:path.join(root,"src"),
    module:"commonjs",target:"es2022",skipLibCheck:true,esModuleInterop:true,strict:true,moduleResolution:"node"},
    files:[path.join(root,"src/lib/scientificValidation/index.ts")]}));
  execFileSync("npx",["tsc","-p",path.join(out,"tsconfig.json")],{cwd:root,stdio:"inherit"});
  const science=require(path.join(out,"lib/scientificValidation/index.js"));
  assert.ok(science.METRIC_VALIDATION_REGISTRY.length>=10);
  const ids=new Set(science.METRIC_VALIDATION_REGISTRY.map(x=>x.metricId));
  assert.equal(ids.size,science.METRIC_VALIDATION_REGISTRY.length);
  for(const metric of science.METRIC_VALIDATION_REGISTRY){
    assert.ok(metric.supportedFps.length);assert.ok(metric.confidencePolicy);assert.ok(metric.referenceMethod);
    assert.equal(metric.registryVersion,science.SCIENTIFIC_VALIDATION_VERSION);
  }
  assert.equal(science.resolveMetricVisibility("top_speed_mps",{fpsClass:"60_class",confidence:.9,manualReview:false}).visibility,"hidden");
  assert.equal(science.resolveMetricVisibility("step_frequency_hz",{fpsClass:"unsupported",confidence:.9,manualReview:false}).visibility,"hidden");
  assert.equal(science.resolveMetricVisibility("average_step_length_m",{fpsClass:"60_class",confidence:.5,manualReview:false}).visibility,"hidden");
  assert.equal(science.resolveMetricVisibility("ground_contact_time_ms",{fpsClass:"60_class",confidence:.9,manualReview:false}).visibility,"experimental");
  const stats=science.summarizeAgreement([1.01,1.98,3.02],[1,2,3]);
  assert.equal(stats.n,3);assert.ok(Math.abs(stats.bias-0.003333333333333336)<1e-12);assert.ok(stats.mae>0);assert.ok(stats.rmse>0);
  const detection=science.summarizeDetection({truePositive:8,falsePositive:1,falseNegative:2});
  assert.equal(detection.precision,8/9);assert.equal(detection.recall,.8);assert.ok(detection.f1>0);
  assert.equal(science.auditScientificLanguage("This pattern can be associated with the hamstring group.").safe,true);
  assert.equal(science.auditScientificLanguage("Your hamstrings are weak.").safe,false);
  assert.throws(()=>science.assertScientificLanguage("This will prevent injury."),/prohibited_scientific_language/);
  const manifestPath=path.join(root,"validation/datasets/ava-validation-dataset-v1.json");
  const manifest=science.validationDatasetManifestSchema.parse(JSON.parse(readFileSync(manifestPath,"utf8")));
  assert.equal(manifest.locked,false);assert.equal(manifest.items[0].inclusionStatus,"quarantined");
  for(const item of manifest.items){
    const artifact=readFileSync(path.join(root,item.sourceArtifact));
    assert.equal(createHash("sha256").update(artifact).digest("hex"),item.checksumSha256);
    assert.ok(!(item.consentStatus==="unknown"&&item.inclusionStatus==="included"));
  }
  const holdout={...manifest,items:[{...manifest.items[0],itemId:"holdout",split:"locked_holdout",holdoutLabelsRestricted:false}]};
  assert.equal(science.validationDatasetManifestSchema.safeParse(holdout).success,false);
  console.log("scientific validation sanity: passed");
}finally{rmSync(out,{recursive:true,force:true})}
