/**
 * Anomaly Detection (Phase 10). Flags unexpected single-analysis changes — a sudden drop
 * in stride length, an abrupt contact-time increase, a velocity regression, a large
 * asymmetry jump — using a robust median/MAD band so noise doesn't trigger it. Anomalies
 * are flagged WITHOUT assuming injury; they are prompts to look, not diagnoses. Pure.
 */

import { type Confidence, estimated, inferred } from "../models";
import type { Anomaly, MetricHistory } from "./models";
import { median, mad, round } from "./stats";
import { ANOMALY } from "./config";

export const ANOMALY_ENGINE_VERSION = "ava-progress-anomaly-v1" as const;

export function detectAnomalies(history: MetricHistory): Anomaly[] {
  const pts = history.points;
  if (pts.length < ANOMALY.minPoints) return [];

  const values = pts.map((p) => p.value);
  const med = median(values);
  const spread = mad(values);
  // If the spread is ~zero, use a small fraction of the median to avoid false positives.
  const scale = spread > 1e-9 ? spread : Math.abs(med) * 0.02 || 1e-6;

  const anomalies: Anomaly[] = [];
  for (const p of pts) {
    const k = Math.abs(p.value - med) / scale;
    if (k < ANOMALY.madK) continue;
    const severity: Anomaly["severity"] = k >= ANOMALY.largeK ? "large" : k >= ANOMALY.notableK ? "notable" : "minor";
    const worseningWord = describeDirection(history, p.value, med);
    const confidence: Confidence = pts.length >= ANOMALY.minPoints + 2 ? estimated(clamp01(0.5 + 0.05 * (k - ANOMALY.madK)), `${round(k, 1)}× robust spread from the median`) : inferred(0.4, "limited history");
    anomalies.push({
      metricId: history.metricId,
      label: history.label,
      date: p.date,
      value: round(p.value, 4),
      expectedRange: { min: round(med - ANOMALY.madK * scale, 4), max: round(med + ANOMALY.madK * scale, 4) },
      deviation: round(k, 2),
      severity,
      note: `${history.label} at ${p.date} is an unexpected ${worseningWord} (${round(k, 1)}× typical spread). A prompt to review context — not an assumption of injury.`,
      confidence,
    });
  }
  return anomalies.sort((a, b) => b.deviation - a.deviation || a.date.localeCompare(b.date));
}

function describeDirection(history: MetricHistory, value: number, med: number): string {
  const higher = value > med;
  const better = history.lowerIsBetter ? !higher : higher;
  const magnitude = higher ? "increase" : "decrease";
  return better ? `${magnitude} (favourable)` : `${magnitude} (unfavourable)`;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
