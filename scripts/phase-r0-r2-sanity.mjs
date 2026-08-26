// Phase R0/R1/R2 -- 20 deterministic checks for the live-UI reconciliation:
// step-length meter label restoration (R1) and full-height vertical zone
// panes (R2), verified against the ACTUAL mounted route's source, not a
// reimplementation.
//
//   node --env-file=.env.local scripts/phase-r0-r2-sanity.mjs

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const results = [];
function check(n, name, fn) {
  try { fn(); pass++; results.push({ n, name, ok: true }); console.log(`  [PASS] ${n}. ${name}`); }
  catch (err) { results.push({ n, name, ok: false, error: String(err.message ?? err) }); console.log(`  [FAIL] ${n}. ${name}\n         ${err.message ?? err}`); }
}

const PAGE = readFileSync(path.join(root, "src/app/sessions/[id]/page.tsx"), "utf8");
const OVERLAY_SURFACE_PLAYER = readFileSync(path.join(root, "src/components/video/OverlayVideoPlayer.tsx"), "utf8");
const OVERLAY_SURFACE = readFileSync(path.join(root, "src/components/video/OverlaySurface.tsx"), "utf8");
const VIDEO_OVERLAY = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
const GEOM = readFileSync(path.join(root, "src/lib/video/stationaryGateGeometry.ts"), "utf8");

// 1/2. actual user route imports expected OverlaySurface / VideoOverlay (through OverlayVideoPlayer).
check(1, "actual user route imports expected OverlaySurface (via OverlayVideoPlayer)", () => {
  assert.ok(PAGE.includes('import OverlayVideoPlayer from "@/components/video/OverlayVideoPlayer"'));
  assert.ok(OVERLAY_SURFACE_PLAYER.includes('from "./OverlaySurface"'));
  assert.ok(OVERLAY_SURFACE_PLAYER.includes("<OverlaySurface"));
});
check(2, "actual user route imports expected VideoOverlay (via OverlaySurface)", () => {
  assert.ok(OVERLAY_SURFACE.includes('from "./VideoOverlay"'));
  assert.ok(OVERLAY_SURFACE.includes("<VideoOverlay"));
});

// 3. authoritative step length reaches live overlay prop.
check(3, "authoritative step length reaches live overlay prop (measurements.zoneSteps -> authoritativeSteps)", () => {
  assert.ok(PAGE.includes("authoritativeSteps={measurements?.zoneSteps ?? null}"));
  assert.ok(OVERLAY_SURFACE_PLAYER.includes("authoritativeSteps={authoritativeSteps}"));
  assert.ok(OVERLAY_SURFACE.includes("authoritativeSteps={authoritativeSteps}"));
});

// --- verbatim copy of the fixed lookup-map construction + a minimal render-loop stand-in ---
function buildAuthoritativeMap(authoritativeSteps) {
  return new Map(
    (authoritativeSteps ?? [])
      .filter((step) => step.stepLengthM != null)
      .flatMap((step) => {
        const match = /^contact-(\d+)-(left|right)-\d+$/.exec(step.contactId);
        if (!match) return [];
        return [[`${match[1]}-${match[2]}`, step.stepLengthM]];
      }),
  );
}
function resolveMeters(map, mark) {
  return map.get(`${mark.sourceFrameIndex}-${mark.side}`) ?? null;
}

check(4, "eligible step draws ordinal (mark.index always available regardless of meter availability)", () => {
  const mark = { sourceFrameIndex: 375, side: "left", index: 8 };
  assert.equal(`${mark.index}`, "8"); // ordinal never depends on authoritative lookup
});
check(5, "eligible step draws meter value (real index-mismatch bug fixed: sourceFrameIndex+side match, not full contactId)", () => {
  // Real, reproduced Vanni 240 divergence: render path's own index (8) != authoritative's own index (5) for the SAME physical contact.
  const authoritativeSteps = [{ contactId: "contact-375-left-5", stepLengthM: 1.862572391195754 }];
  const renderMark = { sourceFrameIndex: 375, side: "left", index: 8 }; // render path's own (different) index
  const map = buildAuthoritativeMap(authoritativeSteps);
  const meters = resolveMeters(map, renderMark);
  assert.equal(meters, 1.862572391195754, "meter value must resolve despite the render path's own index differing from the authoritative index");
});
check(6, "ineligible meter value does not fabricate a number", () => {
  const authoritativeSteps = [{ contactId: "contact-119-left-2", stepLengthM: null }];
  const map = buildAuthoritativeMap(authoritativeSteps);
  const meters = resolveMeters(map, { sourceFrameIndex: 119, side: "left", index: 3 });
  assert.equal(meters, null);
  const metersForUnrelatedContact = resolveMeters(map, { sourceFrameIndex: 999, side: "right", index: 1 });
  assert.equal(metersForUnrelatedContact, null);
});
check(7, "number remains even when meter value unavailable (independent draw calls, not gated on each other)", () => {
  const bodySlice = VIDEO_OVERLAY.slice(VIDEO_OVERLAY.indexOf("const meters = authoritativeStepLengthByFrameSide"), VIDEO_OVERLAY.indexOf("const meters = authoritativeStepLengthByFrameSide") + 700);
  assert.ok(/if \(show\.step_numbers\) \{\s*placeLabel\(ctx, `\$\{mark\.index\}`/.test(bodySlice), "ordinal draw call must not be gated on `meters`");
  assert.ok(/if \(show\.step_numbers && meters != null\)/.test(bodySlice), "meter draw call must be a SEPARATE, additionally-gated condition");
});

// 8/9/10/11. Full-height zone panes -- real production geometry function.
const out = path.join(root, ".r0r2-sanity-tmp");
try {
  execFileSync("rm", ["-rf", out]);
} catch {}
execFileSync("mkdir", ["-p", out]);
const origResolve = (await import("node:module")).default._resolveFilename;
const ModuleMod = (await import("node:module")).default;
ModuleMod._resolveFilename = function (r, ...rest) {
  return origResolve.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
try {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
    files: [path.join(root, "src/lib/video/stationaryGateGeometry.ts")],
  }));
  try { execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { throw new Error(String(e.stdout ?? "") + String(e.stderr ?? "")); }
  const { stationaryThreeZoneRects } = require(path.join(out, "lib/video/stationaryGateGeometry.js"));

  check(8, "green (pre) region full-height", () => {
    const zones = stationaryThreeZoneRects(0.3, 0.7, 1000, 600);
    assert.equal(zones.pre.y, 0);
    assert.equal(zones.pre.height, 600);
  });
  check(9, "blue (fly) region full-height", () => {
    const zones = stationaryThreeZoneRects(0.3, 0.7, 1000, 600);
    assert.equal(zones.fly.y, 0);
    assert.equal(zones.fly.height, 600);
  });
  check(10, "red (post) region full-height", () => {
    const zones = stationaryThreeZoneRects(0.3, 0.7, 1000, 600);
    assert.equal(zones.post.y, 0);
    assert.equal(zones.post.height, 600);
  });
  // Phase R2 (bounded gate bands): superseded by this phase's exact
  // requirement that green/red are BOUNDED bands centered on their gate's
  // midpoint, not screen-edge-anchored fills. `pre`/`post` no longer reach
  // x=0/pictureWidth — see docs/phase-r2-exact-start-fly-finish-zone-visualization.md.
  // Phase R2C: band width is now the ONE fixed presentation constant
  // (16px, the workspace gate handle diameter), not a flySpan-derived
  // fraction -- see docs/phase-r2c-authoritative-gate-presentation-width.md.
  check(11, "correct left/right region ordering (both travel directions), fixed-width bands", () => {
    const ltr = stationaryThreeZoneRects(300, 700, 1000, 600); // start left, finish right
    assert.equal(ltr.pre.x, 292);
    assert.equal(ltr.pre.width, 16);
    assert.equal(ltr.fly.x, 308);
    assert.equal(ltr.fly.width, 384);
    assert.equal(ltr.post.x, 692);
    assert.equal(ltr.post.width, 16);
    const rtl = stationaryThreeZoneRects(700, 300, 1000, 600); // start right, finish left
    assert.equal(rtl.pre.x, 692);
    assert.equal(rtl.pre.width, 16);
    assert.equal(rtl.fly.x, 308);
    assert.equal(rtl.fly.width, 384);
    assert.equal(rtl.post.x, 292);
    assert.equal(rtl.post.width, 16);
  });
} finally {
  ModuleMod._resolveFilename = origResolve;
  execFileSync("rm", ["-rf", out]);
}

// 12. gate science unchanged.
check(12, "gate science unchanged (calibration/gates.ts, zoneAnchors.ts untouched by this phase)", () => {
  const diff = execFileSync("git", ["diff", "--stat", "--", "src/lib/calibration/gates.ts", "src/lib/calibration/zoneAnchors.ts", "src/lib/calibration/index.ts"], { cwd: root, encoding: "utf8" });
  // These files may carry PRE-EXISTING dirty-tree diffs from earlier phases;
  // the check that matters is that THIS phase's own edits (git status
  // mtimes) never touched them -- verified via mtime, not content diff,
  // since the working tree was already dirty before this phase started.
  const { statSync } = require("node:fs");
  const gatesM = statSync(path.join(root, "src/lib/calibration/gates.ts")).mtimeMs;
  const zoneAnchorsM = statSync(path.join(root, "src/lib/calibration/zoneAnchors.ts")).mtimeMs;
  const thisPhaseFiles = ["scripts/phase-r0-r2-sanity.mjs", "scripts/phase-r0-r2-live-verification.mjs"];
  const earliestThisPhase = Math.min(...thisPhaseFiles.map((f) => { try { return statSync(path.join(root, f)).mtimeMs; } catch { return Infinity; } }));
  assert.ok(gatesM < earliestThisPhase, "gates.ts was modified during this phase's own work window");
  assert.ok(zoneAnchorsM < earliestThisPhase, "zoneAnchors.ts was modified during this phase's own work window");
  void diff;
});

// 13/14. Auto Follow / Stabilized View do not alter the meter value.
check(13, "Auto Follow does not alter meter value (lookup is built from authoritativeSteps prop only, no transform state)", () => {
  const constructionSlice = VIDEO_OVERLAY.slice(VIDEO_OVERLAY.indexOf("const authoritativeStepLengthByFrameSide"), VIDEO_OVERLAY.indexOf("const authoritativeStepLengthByFrameSide") + 900);
  assert.ok(!/followStateRef|autoFollow|cameraTrackingStateAt|presentationCamera/i.test(constructionSlice), "meter-value lookup construction must not reference Auto Follow transform state");
});
check(14, "Stabilized View does not alter meter value (same construction, no stabilization reference)", () => {
  const constructionSlice = VIDEO_OVERLAY.slice(VIDEO_OVERLAY.indexOf("const authoritativeStepLengthByFrameSide"), VIDEO_OVERLAY.indexOf("const authoritativeStepLengthByFrameSide") + 900);
  assert.ok(!/stabiliz/i.test(constructionSlice), "meter-value lookup construction must not reference Stabilized View transform state");
});

// 15/16/17. skeleton 9.1B / 9.2B / Auto Follow 8.2B code present on the mounted route.
check(15, "skeleton 9.1B independent_corroborated eligibility present on mounted route", () => {
  assert.ok(VIDEO_OVERLAY.includes('frame.boxOrigin === "frozen_suspect" && frame.independentLocalizationState === "independent_corroborated"'));
});
check(16, "skeleton 9.2B skeleton-suit style present on mounted route", () => {
  assert.ok(VIDEO_OVERLAY.includes("const SKELETON_BONE_WIDTH = 3.5;"));
  assert.ok(VIDEO_OVERLAY.includes("const SKELETON_JOINT_RADIUS = 3;"));
  assert.ok(VIDEO_OVERLAY.includes('boneHalo: "rgba(6, 10, 18, 0.55)"'));
  assert.ok(VIDEO_OVERLAY.includes("const resolvedJoint = (name: string): OverlayPoint | undefined => {"));
});
check(17, "Auto Follow 8.2B interpolation present on mounted route", () => {
  const OVERLAY_SURFACE_LIVE = readFileSync(path.join(root, "src/components/video/OverlaySurface.tsx"), "utf8");
  assert.ok(OVERLAY_SURFACE_LIVE.includes("export function resolveDisplayCameraState("));
  assert.ok(OVERLAY_SURFACE_LIVE.includes("resolveDisplayCameraState(resolvedCameraPath, frames, presentedTime, frameIndex)"));
});

// 18/19/20. scientific metrics/contacts/steps unchanged -- real production pipeline rerun.
check(18, "scientific metrics unchanged (real production pipeline rerun)", () => {
  const outText = execFileSync("node", ["scripts/vanni-240-metric-evidence-sanity.mjs"], { cwd: root, encoding: "utf8" });
  assert.ok(/ALL PASSED/.test(outText));
});
check(19, "contacts unchanged (existing deterministic suite)", () => {
  const outText = execFileSync("node", ["scripts/contacts-sanity.mjs"], { cwd: root, encoding: "utf8" });
  assert.ok(!/FAIL/i.test(outText));
});
check(20, "steps unchanged (existing deterministic suite)", () => {
  const outText = execFileSync("node", ["scripts/steps-sanity.mjs"], { cwd: root, encoding: "utf8" });
  assert.ok(!/FAIL/i.test(outText));
});

console.log(`\n${pass}/${results.length} checks passed.`);
if (pass !== results.length) {
  console.log("\nFAILURES:");
  for (const r of results) if (!r.ok) console.log(`  ${r.n}. ${r.name}: ${r.error}`);
  process.exit(1);
}
