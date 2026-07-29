import type { AnalysisMetrics } from "../types";
import type { VideoTimelineMarker } from "@/components/VideoTimeline";

/**
 * Build video-timeline markers from a completed analysis's metrics.
 *
 * `AnalysisMetrics` is aggregate-only today — it carries no per-event
 * timestamps (step / contact / toe-off), so there is nothing to place on the
 * timeline and this returns `[]`. This is the single extension point: when the
 * metrics shape gains an events array, map each event to a
 * {@link VideoTimelineMarker} here and every caller lights up automatically.
 *
 * Pure and deterministic. It never fabricates markers.
 */
export function buildTimelineMarkersFromMetrics(metrics: AnalysisMetrics): VideoTimelineMarker[] {
  // No event-timing fields exist on AnalysisMetrics yet — nothing to extract.
  void metrics;
  return [];
}
