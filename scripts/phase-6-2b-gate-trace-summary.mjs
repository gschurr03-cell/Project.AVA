import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import ffprobe from "@ffprobe-installer/ffprobe";

const root = path.resolve("tmp/phase62b/browser");
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] : 0;
};
const distribution = (values) => ({ count: values.length, p50: percentile(values, .5), p95: percentile(values, .95), max: Math.max(0, ...values) });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sourcePoint = (record, point) => ({
  x: (point.x - record.displayedFrameX) * record.videoIntrinsicWidth / record.displayedFrameWidth,
  y: (point.y - record.displayedFrameY) * record.videoIntrinsicHeight / record.displayedFrameHeight,
});
const sourceScene = (record) => {
  const g = record.gateDiagnostics;
  return {
    startP1: sourcePoint(record, g.renderedStartP1), startP2: sourcePoint(record, g.renderedStartP2),
    finishP1: sourcePoint(record, g.renderedFinishP1), finishP2: sourcePoint(record, g.renderedFinishP2),
    start: sourcePoint(record, g.renderedStartPx), finish: sourcePoint(record, g.renderedFinishPx),
  };
};
const uniqueFrames = (records) => {
  const result = [];
  for (const record of records.filter((r) => r.kind === "paint" && r.gateDiagnostics)) {
    if (result.at(-1)?.gateDiagnostics.sourceFrame !== record.gateDiagnostics.sourceFrame) result.push(record);
  }
  return result;
};
const media = {
  gav: ["tmp/phase50e/sources/gav_stationary_reference.mov", "tmp/phase66d-part-b/gav-browser-test-only.mp4"],
  vanni240: ["tmp/phase50e/sources/vanni_fly_240.mov", "tmp/phase66b-part-a/vanni240-browser-test-only.mp4"],
  vanni120: ["tmp/phase50e/sources/vanni_fly_120.mov", "tmp/phase66d-part-b/vanni120-browser-test-only.mp4"],
  vanni60: ["tmp/phase50e/sources/vanni_fly_60.mov", "tmp/phase66b-part-a/vanni60-browser-test-only.mp4"],
};
const result = { schema: "phase-6.2b-browser-gate-validation-v1", benchmarks: {}, media: {} };

for (const [benchmark, [scientificSource, browserCopy]] of Object.entries(media)) {
  const directory = path.join(root, benchmark);
  const captures = {};
  for (const file of readdirSync(directory).filter((f) => f.endsWith(".json") && f !== "run-metadata.json").sort()) {
    const payload = JSON.parse(readFileSync(path.join(directory, file), "utf8"));
    let frames = uniqueFrames(payload.records);
    // Source replacement/pre-roll may leave one paint from the prior presented
    // frame before the measured live interval begins. Start at the minimum
    // measured frame and retain only forward source-time progression.
    if (file.startsWith("live-") || file.startsWith("autofollow-live")) {
      const minimumFrame = Math.min(...frames.map((r) => r.gateDiagnostics.sourceFrame));
      frames = frames.slice(frames.findIndex((r) => r.gateDiagnostics.sourceFrame === minimumFrame));
      frames = frames.filter((record, index, all) => index === 0 || record.gateDiagnostics.sourceFrame >= all[index - 1].gateDiagnostics.sourceFrame);
    }
    const scenes = frames.map(sourceScene);
    const startSteps = [], finishSteps = [], maxEndpointSteps = [];
    for (let i = 1; i < scenes.length; i += 1) {
      startSteps.push(distance(scenes[i - 1].start, scenes[i].start));
      finishSteps.push(distance(scenes[i - 1].finish, scenes[i].finish));
      maxEndpointSteps.push(Math.max(
        distance(scenes[i - 1].startP1, scenes[i].startP1), distance(scenes[i - 1].startP2, scenes[i].startP2),
        distance(scenes[i - 1].finishP1, scenes[i].finishP1), distance(scenes[i - 1].finishP2, scenes[i].finishP2),
      ));
    }
    const sourceStartLengths = scenes.map((s) => distance(s.startP1, s.startP2));
    const sourceFinishLengths = scenes.map((s) => distance(s.finishP1, s.finishP2));
    const gateRecords = frames.map((r) => r.gateDiagnostics);
    captures[file] = {
      records: payload.records.length,
      uniqueGateFrames: frames.length,
      sourceFrameRange: frames.length ? [frames[0].gateDiagnostics.sourceFrame, frames.at(-1).gateDiagnostics.sourceFrame] : null,
      startMidpointStepSourcePx: distribution(startSteps),
      finishMidpointStepSourcePx: distribution(finishSteps),
      maxEndpointStepSourcePx: distribution(maxEndpointSteps),
      rawSceneResidualSourcePx: distribution(gateRecords.slice(1).map((g) => g.startMidDisplacementPx)),
      heldFrames: gateRecords.filter((g) => g.held).length,
      rejectedFrames: gateRecords.filter((g) => g.rejectedTransformFrame != null || g.cameraPathState !== "anchored").length,
      startLengthRangeSourcePx: sourceStartLengths.length ? [Math.min(...sourceStartLengths), Math.max(...sourceStartLengths)] : null,
      finishLengthRangeSourcePx: sourceFinishLengths.length ? [Math.min(...sourceFinishLengths), Math.max(...sourceFinishLengths)] : null,
      startAngleRangeDeg: gateRecords.length ? [Math.min(...gateRecords.map((g) => g.startOrientationDeg)), Math.max(...gateRecords.map((g) => g.startOrientationDeg))] : null,
      finishAngleRangeDeg: gateRecords.length ? [Math.min(...gateRecords.map((g) => g.finishOrientationDeg)), Math.max(...gateRecords.map((g) => g.finishOrientationDeg))] : null,
      gatePoseFrameMismatches: frames.filter((r) => r.gateDiagnostics.sourceFrame !== r.selectedPoseSourceFrameIndex).length,
      staleRejectedPaints: frames.filter((r) => r.staleRejected).length,
      fullscreen: payload.validation?.supported == null ? null : payload.validation,
      scenesByFrame: Object.fromEntries(frames.map((r) => [r.gateDiagnostics.sourceFrame, sourceScene(r)])),
    };
  }
  const reference = captures["live-1x.json"];
  const rateEquivalence = {};
  for (const name of ["live-0_25x.json", "live-0_5x.json", "live-1x.json"]) {
    const differences = [];
    for (const [frame, scene] of Object.entries(captures[name].scenesByFrame)) {
      const expected = reference.scenesByFrame[frame];
      if (!expected) continue;
      differences.push(Math.max(distance(scene.startP1, expected.startP1), distance(scene.startP2, expected.startP2), distance(scene.finishP1, expected.finishP1), distance(scene.finishP2, expected.finishP2)));
    }
    rateEquivalence[name] = distribution(differences);
  }
  for (const capture of Object.values(captures)) delete capture.scenesByFrame;
  result.benchmarks[benchmark] = { captures, rateEquivalence };

  const probe = (file) => JSON.parse(execFileSync(ffprobe.path, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,avg_frame_rate,nb_frames,duration:format=start_time,duration", "-of", "json", file]));
  const digest = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
  result.media[benchmark] = {
    scientificSource: { path: scientificSource, sha256: digest(scientificSource), probe: probe(scientificSource) },
    browserValidationCopy: { path: browserCopy, sha256: digest(browserCopy), probe: probe(browserCopy), role: "browser UI validation only" },
  };
}
writeFileSync("tmp/phase62b/gate-trace-summary.json", `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ benchmarks: Object.fromEntries(Object.entries(result.benchmarks).map(([key, value]) => [key, { live1: value.captures["live-1x.json"], rateEquivalence: value.rateEquivalence, fullscreen: value.captures["fullscreen.json"].fullscreen }])) }, null, 2));
