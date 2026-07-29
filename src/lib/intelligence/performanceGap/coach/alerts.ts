/**
 * Alert Engine (Phase 11). Surfaces the things a coach needs to notice — plateaus, rapid
 * regressions, large asymmetry increases, recording-quality problems, new analyses,
 * confidence drops, missing data, and repeated technical issues. Every alert explains WHY
 * it fired and cites its evidence. Consumes the Phase 10 progress output; never diagnoses
 * injury. Pure + deterministic.
 */

import { type Confidence, estimated, inferred } from "../models";
import type { ProgressIntelligence } from "../progress/models";
import type { Alert, AlertSeverity, AlertType } from "./models";
import { ALERT } from "./config";

export const ALERT_ENGINE_VERSION = "ava-coach-alerts-v1" as const;

export interface AlertInput {
  orgId: string;
  athleteId: string;
  progress?: ProgressIntelligence | null;
  recordingQualityHistory?: number[];
  confidenceHistory?: number[];
  lastAnalysisDate?: string | null;
  newAnalysisId?: string | null;
  now: Date;
  idPrefix?: string;
}

export function generateAlerts(input: AlertInput): Alert[] {
  const alerts: Alert[] = [];
  const prefix = input.idPrefix ?? "alert";
  const nowIso = input.now.toISOString();
  const mk = (type: AlertType, severity: AlertSeverity, title: string, why: string, evidence: string[], confidence: Confidence, metricId: string | null = null): Alert => ({
    id: `${prefix}-${type}-${input.athleteId}${metricId ? `-${metricId}` : ""}`,
    orgId: input.orgId,
    athleteId: input.athleteId,
    type,
    severity,
    title,
    why,
    evidence,
    metricId,
    createdAt: nowIso,
    acknowledged: false,
    confidence,
  });

  // Plateaus (from Phase 10).
  for (const p of input.progress?.plateaus ?? []) {
    alerts.push(mk("plateau", "warning", `${p.label} plateau`, `${p.label} has shown no meaningful change across ${p.analysesSpanned} analyses.`,
      p.likelyFactors.map((f) => `${f.label} (${f.linkedEngine})`), p.confidence, p.metricId));
  }

  // Rapid regressions / declines.
  for (const t of input.progress?.trends ?? []) {
    if (t.metricId === "symmetry") continue; // handled as asymmetry below
    if (t.status === "rapid_regression") {
      alerts.push(mk("rapid_regression", "critical", `${t.label} regressing rapidly`, t.note, [`percent change ${t.percentChange}%`, `fit ${t.fitQuality}`], t.confidence, t.metricId));
    } else if (t.status === "declining") {
      alerts.push(mk("rapid_regression", "warning", `${t.label} declining`, t.note, [`percent change ${t.percentChange}%`], t.confidence, t.metricId));
    }
  }

  // Asymmetry increase.
  const sym = input.progress?.trends.find((t) => t.metricId === "symmetry");
  if (sym && (sym.status === "declining" || sym.status === "rapid_regression")) {
    alerts.push(mk("asymmetry_increase", sym.status === "rapid_regression" ? "critical" : "warning", "Left/right asymmetry increasing",
      `Left/right symmetry is worsening (${sym.percentChange}% toward target across ${sym.points.length} analyses).`, [sym.note], sym.confidence, "symmetry"));
  }

  // Recording quality problems.
  const rq = input.recordingQualityHistory ?? [];
  if (rq.length) {
    const last = rq[rq.length - 1];
    const belowCount = rq.slice(-ALERT.repeatedIssueCount).filter((q) => q <= ALERT.recordingQualityMin).length;
    if (belowCount >= ALERT.repeatedIssueCount) {
      alerts.push(mk("repeated_technical_issue", "critical", "Repeated recording-quality issues", `Recording quality was at or below ${ALERT.recordingQualityMin} in the last ${ALERT.repeatedIssueCount} analyses.`,
        rq.slice(-ALERT.repeatedIssueCount).map((q, i) => `analysis −${ALERT.repeatedIssueCount - 1 - i}: quality ${q}`), estimated(0.7, "repeated low quality")));
    } else if (last <= ALERT.recordingQualityMin) {
      alerts.push(mk("recording_quality", "warning", "Low recording quality", `The latest recording quality (${last}) is at or below the ${ALERT.recordingQualityMin} threshold.`, [`latest quality ${last}`], estimated(0.7, "single low-quality recording")));
    }
  }

  // Confidence drop.
  const ch = input.confidenceHistory ?? [];
  if (ch.length >= 2) {
    const drop = ch[ch.length - 2] - ch[ch.length - 1];
    if (drop >= ALERT.confidenceDropDelta) {
      alerts.push(mk("confidence_drop", "warning", "Analysis confidence dropped", `Confidence fell by ${round(drop, 2)} between the last two analyses.`, [`from ${ch[ch.length - 2]} to ${ch[ch.length - 1]}`], estimated(0.6, "confidence delta")));
    }
  }

  // Missing data.
  if (input.lastAnalysisDate) {
    const days = daysBetween(input.lastAnalysisDate, nowIso);
    if (days > ALERT.missingDataDays) {
      alerts.push(mk("missing_data", "info", "No recent analysis", `No new analysis in ${Math.round(days)} days (threshold ${ALERT.missingDataDays}).`, [`last analysis ${input.lastAnalysisDate}`], inferred(0.5, "gap since last analysis")));
    }
  }

  // New analysis notification.
  if (input.newAnalysisId) {
    alerts.push(mk("new_analysis", "info", "New analysis available", `A new analysis (${input.newAnalysisId}) is ready to review.`, [`analysis ${input.newAnalysisId}`], estimated(0.9, "new analysis event")));
  }

  return alerts.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.type.localeCompare(b.type) || (a.metricId ?? "").localeCompare(b.metricId ?? ""));
}

function severityRank(s: AlertSeverity): number {
  return s === "critical" ? 3 : s === "warning" ? 2 : 1;
}
function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(ms) ? ms / 86_400_000 : 0;
}
function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}
