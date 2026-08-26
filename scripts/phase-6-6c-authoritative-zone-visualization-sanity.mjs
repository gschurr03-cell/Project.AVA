import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".phase-6-6c-zone-visualization-tmp");
let count = 0;
const check = (name, fn) => { fn(); count += 1; console.log(`PASS ${count}. ${name}`); };
const boundary = (x) => ({ p1: { x, y: 0 }, p2: { x, y: 50 }, midpoint: { x, y: 25 } });
const area = (points) => Math.abs(points.reduce((sum, point, index) => {
  const next = points[(index + 1) % points.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0) / 2);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, strict: true, moduleResolution: "node" },
    files: [path.join(root, "src/lib/video/worldVisualization.ts")],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: "inherit" });
  const visualization = require(path.join(out, "lib/video/worldVisualization.js"));
  const start = boundary(20); const finish = boundary(80);
  const zones = visualization.worldZonePolygons(start, finish, { x: 0, y: 0, width: 100, height: 50 });
  check("pre-zone point classifies green region", () => assert.equal(visualization.classifyWorldZonePoint({ x: 10, y: 25 }, start, finish), "pre"));
  check("in-zone point classifies measurement region", () => assert.equal(visualization.classifyWorldZonePoint({ x: 50, y: 25 }, start, finish), "measurement"));
  check("post-zone point classifies red region", () => assert.equal(visualization.classifyWorldZonePoint({ x: 90, y: 25 }, start, finish), "post"));
  check("reverse travel preserves region identities", () => {
    assert.equal(visualization.classifyWorldZonePoint({ x: 90, y: 25 }, finish, start), "pre");
    assert.equal(visualization.classifyWorldZonePoint({ x: 10, y: 25 }, finish, start), "post");
  });
  // Phase R2: colors/alpha updated per the product's explicit request (a
  // genuinely light blue for measurement/fly, not AVA's medium brand blue;
  // alpha raised 0.18->0.22 for clearer visibility) -- see
  // docs/phase-r0-r2-live-ui-reconciliation.md Section 9. Still green/light-
  // blue/red in the same pre/measurement/post order.
  check("theme exposes green blue red in authoritative order", () => assert.deepEqual(visualization.WORLD_ZONE_THEME, {
    pre: "rgba(34, 197, 94, 0.22)", measurement: "rgba(125, 211, 252, 0.22)", post: "rgba(239, 68, 68, 0.22)",
  }));
  check("three polygons partition one unchanged viewport", () => assert.equal(area(zones.start) + area(zones.fly) + area(zones.finish), 5000));
  check("shared start boundary is identical", () => assert.ok(zones.start.some((point) => point.x === 20) && zones.fly.some((point) => point.x === 20)));
  check("shared finish boundary is identical", () => assert.ok(zones.fly.some((point) => point.x === 80) && zones.finish.some((point) => point.x === 80)));
  const component = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  check("renderer consumes authoritative theme instead of local color literals", () => {
    assert.match(component, /WORLD_ZONE_THEME\.pre/);
    assert.match(component, /WORLD_ZONE_THEME\.measurement/);
    assert.match(component, /WORLD_ZONE_THEME\.post/);
    assert.doesNotMatch(component, /rgba\(34, 197, 94, 0\.055\)|rgba\(47, 128, 237, 0\.065\)|rgba\(239, 68, 68, 0\.045\)/);
  });
  check("world polygons render behind athlete and gate evidence", () => assert.match(component, /globalCompositeOperation = "destination-over";[\s\S]*renderRegisteredOverlays\(zoneOverlays, ctx\)/));
  check("draw order remains zones before gates", () => assert.ok(component.indexOf("renderRegisteredOverlays(zoneOverlays, ctx)") < component.indexOf("if (show.gates && startG)")));
  check("Auto Follow does not participate in region classification or theme", () => {
    const source = readFileSync(path.join(root, "src/lib/video/worldVisualization.ts"), "utf8");
    assert.doesNotMatch(source, /autoFollow|presentationCamera|FollowBox/);
  });
  check("scientific measurement code remains visualization-independent", () => {
    const metrics = readFileSync(path.join(root, "src/lib/benchmark/measurements.ts"), "utf8");
    assert.doesNotMatch(metrics, /WORLD_ZONE_THEME|classifyWorldZonePoint|worldVisualization/);
  });
  assert.equal(count, 13);
  console.log(`ALL ${count} PHASE 6.6C AUTHORITATIVE ZONE VISUALIZATION CHECKS PASSED`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
