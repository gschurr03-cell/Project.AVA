import type { BenchmarkVideo } from "./BenchmarkTypes";

/**
 * Known benchmark sprint recordings (coach / VueMotion measurements). Static
 * metadata only — the video files themselves are never committed. Values are as
 * provided by the reference system.
 */
export const BENCHMARK_VIDEOS: BenchmarkVideo[] = [
  {
    id: "A",
    name: "20m fly",
    source: "VueMotion",
    distanceM: 20,
    avgStepFrequencyHz: 4.86,
    avgGroundContactMs: 80,
    avgFlightTimeMs: 125,
    avgSpeedMps: 10.36,
    peakSpeedMps: 10.74,
    avgStepLengthM: 2.15,
    extra: {
      rightStepLengthM: 2.14,
      leftStepLengthM: 2.16,
      rightStepFrequencyHz: 4.72,
      leftStepFrequencyHz: 5.0,
      rightGroundContactMs: 80,
      leftGroundContactMs: 80,
      rightFlightTimeMs: 130,
      leftFlightTimeMs: 120,
    },
  },
  {
    id: "B",
    name: "30m blocks + 10m fly (40m total)",
    source: "coach",
    distanceM: 40,
    peakSpeedMps: 11.11,
    peakStepLengthM: 2.36,
    peakStepFrequencyHz: 4.7,
  },
  {
    id: "C",
    name: "30m fly",
    source: "coach",
    distanceM: 30,
    peakSpeedMps: 11.11,
    peakStepLengthM: 2.36,
    peakStepFrequencyHz: 4.7,
    extra: { flyTimeS: 2.77 },
  },
];

/** Look up a benchmark video by id (A/B/C). */
export function getBenchmark(id: string): BenchmarkVideo | undefined {
  return BENCHMARK_VIDEOS.find((v) => v.id === id);
}
