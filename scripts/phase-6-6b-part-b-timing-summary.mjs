import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const value = flag => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : null; };
const inputs = [
  ["VANNI_240_1X", value("--v240-1")],
  ["VANNI_240_05X", value("--v240-05")],
  ["VANNI_240_025X", value("--v240-025")],
  ["VANNI_60_1X", value("--v60-1")],
].filter(([, file]) => file);
if (!inputs.length) throw new Error("Provide at least one trace input");
const output = path.resolve(value("--out") ?? "tmp/phase66b-part-b/timing-summary.json");
mkdirSync(path.dirname(output), { recursive: true });
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
};
const stats = values => ({
  count: values.length,
  mean: values.length ? values.reduce((sum, number) => sum + number, 0) / values.length : null,
  median: percentile(values, .5), p50: percentile(values, .5), p90: percentile(values, .9),
  p95: percentile(values, .95), p99: percentile(values, .99),
  min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null,
});

// Part A's real Vanni 240 scrub-control paint-work p99 was 2.3 ms. Round to
// the next 0.1 ms scheduling bucket plus one 0.1 ms clock-resolution bucket;
// this classifies browser/canvas work inside its measured envelope rather than
// pretending that zero-duration paint is possible.
const toleranceMs = 2.5;
const datasets = {};
for (const [label, file] of inputs) {
  const records = JSON.parse(readFileSync(path.resolve(file), "utf8")).records ?? [];
  const callbacks = records.filter(row => row.kind === "rvfc_callback" && row.phase === "active");
  const promotions = records.filter(row => row.kind === "presentation_promotion");
  const paints = records.filter(row => row.kind === "paint");
  const promotedPaints = promotions.flatMap(promotion => {
    const paint = paints.find(row => row.rvfcRegistrationId === promotion.registrationId
      && row.paintStartPerformanceMs >= promotion.recordedAtPerformanceMs);
    return paint ? [paint] : [];
  });
  if (!promotions.length) {
    const seen = new Set();
    for (const paint of paints) {
      if (Number.isFinite(paint.rvfcRegistrationId) && !seen.has(paint.rvfcRegistrationId)) {
        seen.add(paint.rvfcRegistrationId);
        promotedPaints.push(paint);
      }
    }
  }
  const callbackLead = callbacks.map(row => row.expectedDisplayTimeMs - row.callbackFiredPerformanceMs).filter(Number.isFinite);
  const signedPaint = promotedPaints
    .map(row => row.paintEndPerformanceMs - row.expectedDisplayTimeMs)
    .filter(Number.isFinite);
  const callbackToPaint = promotedPaints
    .map(row => row.paintEndPerformanceMs - row.callbackFiredPerformanceMs)
    .filter(Number.isFinite);
  datasets[label] = {
    source: file,
    callbackLeadToExpectedDisplayMs: stats(callbackLead),
    overlayPaintMinusExpectedDisplayMs: stats(signedPaint),
    callbackToOverlayPaintMs: stats(callbackToPaint),
    signedCounts: {
      early: signedPaint.filter(number => number < -toleranceMs).length,
      withinTolerance: signedPaint.filter(number => Math.abs(number) <= toleranceMs).length,
      late: signedPaint.filter(number => number > toleranceMs).length,
    },
    callbacks: callbacks.length,
    promotions: promotions.length,
    presentedFrameCounterSkips: callbacks.slice(1).filter((row, index) => row.presentedFrames - callbacks[index].presentedFrames > 1).length,
  };
}
writeFileSync(output, JSON.stringify({ schemaVersion: "ava-presentation-phase-summary-v1", toleranceMs, datasets }, null, 2) + "\n");
console.log(JSON.stringify({ output, datasets: Object.keys(datasets), toleranceMs }, null, 2));
