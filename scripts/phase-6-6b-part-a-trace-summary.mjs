import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const value = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const inputs = [
  ["SCRUB_CONTROL", value("--scrub")],
  ["LIVE_1X", value("--live1")],
  ["LIVE_05X", value("--live05")],
  ["LIVE_025X", value("--live025")],
].filter(([, file]) => file);
if (!inputs.length) throw new Error("Provide at least --scrub TRACE.json or --live1 TRACE.json");
const outputDir = path.resolve(value("--out") ?? "tmp/phase66b-part-a");
mkdirSync(outputDir, { recursive: true });

const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
};
const stats = values => ({
  count: values.length,
  mean: values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null,
  median: percentile(values, .5), p50: percentile(values, .5), p90: percentile(values, .9),
  p95: percentile(values, .95), p99: percentile(values, .99), max: values.length ? Math.max(...values) : null,
});
const numeric = (rows, key) => rows.map(row => row[key]).filter(Number.isFinite);

const datasets = {};
for (const [label, file] of inputs) {
  const trace = JSON.parse(readFileSync(path.resolve(file), "utf8"));
  const records = trace.records ?? [];
  const paints = records.filter(record => record.kind === "paint");
  const callbacks = records.filter(record => record.kind === "rvfc_callback" && record.phase === "active");
  const uniquePresentedFrames = new Set(callbacks.map(record => record.presentedFrames).filter(Number.isFinite));
  const uniqueSelections = new Set(paints.map(record => `${record.mediaTimeS}:${record.selectedPoseSourceFrameIndex}`));
  const firstPaintByCallback = [];
  const seenCallbackPaints = new Set();
  for (const paint of paints) {
    if (!Number.isFinite(paint.rvfcRegistrationId) || seenCallbackPaints.has(paint.rvfcRegistrationId)) continue;
    seenCallbackPaints.add(paint.rvfcRegistrationId);
    firstPaintByCallback.push(paint);
  }
  const paintEndToExpectedDisplay = firstPaintByCallback
    .map(paint => Number.isFinite(paint.paintEndToExpectedDisplayMs)
      ? paint.paintEndToExpectedDisplayMs
      : (Number.isFinite(paint.expectedDisplayTimeMs) && Number.isFinite(paint.paintEndPerformanceMs)
        ? paint.expectedDisplayTimeMs - paint.paintEndPerformanceMs
        : null))
    .filter(Number.isFinite);
  const age = {};
  for (const paint of paints) age[paint.poseAgeClass] = (age[paint.poseAgeClass] ?? 0) + 1;
  const effects = new Set(records.map(record => record.effectId).filter(Number.isFinite));
  const rafLoops = new Set(records.map(record => record.rafLoopId).filter(Number.isFinite));
  const rvfcGenerations = new Set(records.filter(record => record.kind === "rvfc_registration").map(record => record.rvfcGenerationId));
  const staleCallbacks = records.filter(record => record.kind === "rvfc_callback" && record.phase === "stale_after_cleanup");
  datasets[label] = {
    source: file,
    identity: records[0]?.identity ?? null,
    signedMediaPoseDeltaS: stats(numeric(paints, "signedMediaPoseDeltaS")),
    absoluteMediaPoseDeltaS: stats(numeric(paints, "absoluteMediaPoseDeltaS")),
    sourceFrameEquivalentDelta: stats(numeric(paints, "sourceFrameEquivalentDelta")),
    poseAge: age,
    latencyMs: {
      callbackToSelection: stats(numeric(firstPaintByCallback, "callbackToSelectionMs")),
      selectionToPaintEnd: stats(numeric(firstPaintByCallback, "selectionToPaintEndMs")),
      callbackToPaintEnd: stats(numeric(firstPaintByCallback, "callbackToPaintEndMs")),
      paintEndToExpectedDisplay: stats(paintEndToExpectedDisplay),
    },
    cadence: {
      activeRvfcCallbacks: callbacks.length,
      uniquePresentedFrames: uniquePresentedFrames.size,
      overlaySelections: uniqueSelections.size,
      overlayPaints: paints.length,
      paintsPerPresentedFrame: uniquePresentedFrames.size ? paints.length / uniquePresentedFrames.size : null,
      presentedFrameCounterSkips: callbacks.slice(1).filter((row, index) => Number.isFinite(row.presentedFrames) && Number.isFinite(callbacks[index].presentedFrames) && row.presentedFrames - callbacks[index].presentedFrames > 1).length,
    },
    callbackOrdering: {
      effectMounts: effects.size,
      rafLoops: rafLoops.size,
      rvfcGenerations: rvfcGenerations.size,
      staleCallbacksAfterCleanup: staleCallbacks.length,
      multipleActiveLoopRisk: effects.size > 1 || rafLoops.size > 1 || rvfcGenerations.size > 1,
    },
  };
}

const scrub = inputs.find(([label]) => label === "SCRUB_CONTROL");
const live = inputs.find(([label]) => label === "LIVE_1X");
let matched = [];
if (scrub && live) {
  const readPaints = file => (JSON.parse(readFileSync(path.resolve(file), "utf8")).records ?? []).filter(row => row.kind === "paint");
  const scrubByKey = new Map(readPaints(scrub[1]).map(row => [`${row.mediaTimeS}:${row.selectedPoseSourceFrameIndex}`, row]));
  matched = readPaints(live[1]).flatMap(row => {
    const other = scrubByKey.get(`${row.mediaTimeS}:${row.selectedPoseSourceFrameIndex}`);
    return other ? [{ mediaTimeS: row.mediaTimeS, sourceFrameIndex: row.selectedPoseSourceFrameIndex, scrub: other, live: row }] : [];
  });
}

writeFileSync(path.join(outputDir, "timing-summary.json"), JSON.stringify({ schemaVersion: "ava-playback-sync-summary-v1", datasets }, null, 2) + "\n");
writeFileSync(path.join(outputDir, "callback-ordering-summary.json"), JSON.stringify(Object.fromEntries(Object.entries(datasets).map(([key, data]) => [key, data.callbackOrdering])), null, 2) + "\n");
writeFileSync(path.join(outputDir, "matched-frame-comparison.json"), JSON.stringify(matched, null, 2) + "\n");
console.log(JSON.stringify({ outputDir, datasets: Object.keys(datasets), matchedFrames: matched.length }, null, 2));
