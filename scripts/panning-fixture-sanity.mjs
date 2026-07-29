import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, ".panning-fixture-sanity-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  const tsconfig = path.join(out, "tsconfig.json");
  writeFileSync(tsconfig, JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src/lib"), module: "commonjs", target: "es2022", moduleResolution: "node", esModuleInterop: true, skipLibCheck: true, strict: true },
    files: [path.join(root, "src/lib/validation/externalReference.ts")],
  }));
  execFileSync("npx", ["tsc", "-p", tsconfig], { cwd: root, stdio: "inherit" });
  const { validationFixtureManifestSchema } = await import(path.join(out, "validation/externalReference.js"));
  const manifest = JSON.parse(readFileSync(path.join(root, "validation/fixtures/panning/real-side-pan-fly-001.json"), "utf8"));
  const parsed = validationFixtureManifestSchema.parse(manifest);
  assert.equal(parsed.externalReference.measuredValue, 2.77);
  assert.equal(parsed.externalReference.referenceDistanceMeters, 30);
  assert.equal(parsed.externalReference.startDefinition, null);
  assert.equal(parsed.externalReference.finishDefinition, null);
  assert.equal(parsed.externalReference.comparabilityStatus, "partially_compatible");
  assert.equal(parsed.protectedSource.sourceCommittedToRepository, false);
  assert.equal(parsed.sourceMetadata.detectedFps, 30);
  assert.equal(parsed.sourceMetadata.trueCaptureClass, "true_30_fps_cfr");
  assert.equal(parsed.sourceMetadata.timeBase, "1/600");
  assert.equal(parsed.sourceMetadata.frameCount, 197);
  assert.equal(parsed.sourceMetadata.duplicateTimestampCount, 0);
  assert.equal(parsed.sourceMetadata.droppedFrameGapCount, 0);
  assert.equal(parsed.sourceMetadata.repeatPictureCount, 0);
  assert.equal(parsed.sourceMetadata.timestampIrregularity, "none");
  assert.ok(Math.abs(parsed.sourceMetadata.timestampDerivedFps - 30) < 0.00001);
  assert.ok(Math.abs(parsed.sourceMetadata.frameIntervalSeconds.median - (1 / 30)) < 0.000001);
  const migration = readFileSync(path.join(root, "supabase/migrations/0022_validation_fixtures.sql"), "utf8");
  assert.match(migration, /enable row level security/i);
  assert.doesNotMatch(migration, /create policy/i);
  console.log("panning fixture sanity: passed");
} finally {
  rmSync(out, { recursive: true, force: true });
}
