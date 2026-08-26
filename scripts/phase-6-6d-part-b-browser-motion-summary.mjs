import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const directory = path.resolve("tmp/phase66d-part-b/browser");
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]
    : 0;
};
const distribution = (values) => ({
  count: values.length,
  median: percentile(values, 0.5),
  p90: percentile(values, 0.9),
  p95: percentile(values, 0.95),
  p99: percentile(values, 0.99),
  max: Math.max(0, ...values),
});
const parseTransform = (value) => {
  const match = /translate\(([-\d.]+)%, ([-\d.]+)%\) scale\(([-\d.]+)\)/.exec(value);
  return match
    ? { tx: Number(match[1]) / 100, ty: Number(match[2]) / 100, scale: Number(match[3]) }
    : null;
};
const result = {
  schema: "phase-6.6d-part-b-real-browser-motion-v1",
  captures: {},
  rateEquivalence: {},
};

for (const file of readdirSync(directory)
  .filter((file) => file.endsWith(".json"))
  .sort()) {
  const payload = JSON.parse(readFileSync(path.join(directory, file), "utf8"));
  const samples = (payload.autoFollowMotion ?? [])
    .map((sample) => ({
      ...sample,
      authoritativeTimeS: sample.cameraMediaTimeS ?? sample.mediaTimeS,
      parsed: parseTransform(sample.transform),
    }))
    .filter((sample) => sample.parsed && sample.authoritativeTimeS != null);
  const unique = [];
  for (const sample of samples) {
    const prior = unique.at(-1);
    if (!prior || sample.authoritativeTimeS > prior.authoritativeTimeS + 1e-6) unique.push(sample);
  }
  const jumps = [];
  const scaleDeltas = [];
  const velocities = [];
  const accelerations = [];
  let priorVelocity = { x: 0, y: 0 };
  for (let index = 1; index < unique.length; index++) {
    const previous = unique[index - 1],
      current = unique[index],
      dt = current.authoritativeTimeS - previous.authoritativeTimeS;
    if (dt <= 0) continue;
    const dx = (current.parsed.tx - previous.parsed.tx) * 1920,
      dy = (current.parsed.ty - previous.parsed.ty) * 1080;
    const velocity = { x: dx / dt, y: dy / dt };
    jumps.push(Math.hypot(dx, dy));
    scaleDeltas.push(Math.abs(current.parsed.scale - previous.parsed.scale));
    velocities.push(Math.hypot(velocity.x, velocity.y));
    accelerations.push(
      Math.hypot((velocity.x - priorVelocity.x) / dt, (velocity.y - priorVelocity.y) / dt),
    );
    priorVelocity = velocity;
  }
  result.captures[file] = {
    rawSamples: samples.length,
    uniquePresentedTimes: unique.length,
    mediaTimeRangeS: unique.length
      ? [unique[0].authoritativeTimeS, unique.at(-1).authoritativeTimeS]
      : null,
    translationJumpPx: distribution(jumps),
    absoluteScaleDelta: distribution(scaleDeltas),
    velocityPxPerSourceS: distribution(velocities),
    accelerationPxPerSourceS2: distribution(accelerations),
    trajectory: unique.map((sample) => ({
      mediaTimeS: sample.authoritativeTimeS,
      sourceFrameIndex: sample.cameraSourceFrameIndex,
      ...sample.parsed,
    })),
  };
}

for (const benchmark of ["vanni240", "vanni120", "vanni60"]) {
  const captures = Object.entries(result.captures).filter(([name]) =>
    name.startsWith(`${benchmark}-`),
  );
  const reference = captures.find(([name]) => name.includes("live1.json"));
  if (!reference) continue;
  const referenceTrajectory = reference[1].trajectory;
  for (const [name, capture] of captures) {
    const distances = [];
    for (const point of capture.trajectory) {
      const exact =
        point.sourceFrameIndex == null
          ? null
          : referenceTrajectory.find(
              (candidate) => candidate.sourceFrameIndex === point.sourceFrameIndex,
            );
      const nearest =
        exact ??
        referenceTrajectory.reduce(
          (best, candidate) =>
            Math.abs(candidate.mediaTimeS - point.mediaTimeS) <
            Math.abs(best.mediaTimeS - point.mediaTimeS)
              ? candidate
              : best,
          referenceTrajectory[0],
        );
      if (exact || Math.abs(nearest.mediaTimeS - point.mediaTimeS) <= 0.002)
        distances.push(Math.hypot((nearest.tx - point.tx) * 1920, (nearest.ty - point.ty) * 1080));
    }
    result.rateEquivalence[name] = distribution(distances);
  }
}

writeFileSync(
  path.resolve("tmp/phase66d-part-b/browser-motion-summary.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      captures: Object.fromEntries(
        Object.entries(result.captures).map(([name, value]) => [
          name,
          {
            uniquePresentedTimes: value.uniquePresentedTimes,
            translationJumpPx: value.translationJumpPx,
            absoluteScaleDelta: value.absoluteScaleDelta,
          },
        ]),
      ),
      rateEquivalence: result.rateEquivalence,
    },
    null,
    2,
  ),
);
