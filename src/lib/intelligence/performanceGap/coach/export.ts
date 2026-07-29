/**
 * API & Export preparation (Phase 11). Reusable, dependency-free serializers: CSV for
 * athlete summaries and team analytics, and a portable (PDF-ready) structure for reports.
 * These are the seams future wearable / timing-system / recruiting integrations will use —
 * NONE of those external integrations are implemented here. Pure + deterministic.
 */

import type { AthleteSummary, Report, TeamAnalytics } from "./models";

export const EXPORT_VERSION = "ava-coach-export-v1" as const;

/** Generic CSV serializer (RFC-4180-ish quoting), stable column order. */
export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const header = columns.map(csvCell).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(r[c])).join(",")).join("\n");
  return body ? `${header}\n${body}` : header;
}

export function athleteSummariesToCsv(summaries: AthleteSummary[]): string {
  const columns = ["athleteId", "name", "status", "currentPbS", "goalPbS", "developmentScore", "blueprintCompletion", "trendDirection", "confidence"];
  const rows = summaries.map((s) => ({
    athleteId: s.athleteId,
    name: s.name,
    status: s.status,
    currentPbS: s.currentPbS,
    goalPbS: s.goalPbS,
    developmentScore: s.developmentScore,
    blueprintCompletion: s.blueprintCompletion,
    trendDirection: s.trendDirection,
    confidence: s.confidence.score ?? s.confidence.category,
  }));
  return toCsv(columns, rows);
}

export function teamAnalyticsToCsv(a: TeamAnalytics): string {
  const columns = ["metric", "value"];
  const rows: Record<string, unknown>[] = [
    { metric: "athleteCount", value: a.athleteCount },
    { metric: "averageBlueprintCompletion", value: a.averageBlueprintCompletion },
    { metric: "averageDevelopmentScore", value: a.averageDevelopmentScore },
    { metric: "overallRecordingQuality", value: a.overallRecordingQuality },
    { metric: "mostCommonLimitation", value: a.mostCommonLimitation?.label ?? "" },
    { metric: "mostImprovedMetric", value: a.mostImprovedMetric?.label ?? "" },
  ];
  return toCsv(columns, rows);
}

/** A flat, renderer-agnostic structure a PDF exporter can consume directly. */
export interface PortableReport {
  title: string;
  generatedAt: string;
  blocks: { heading: string; kind: string; lines: string[]; charts: { title: string; type: string; points: { x: string | number; y: number }[] }[] }[];
}

export function reportToPortable(report: Report): PortableReport {
  return {
    title: report.title,
    generatedAt: report.generatedAt,
    blocks: report.sections.map((s) => ({
      heading: s.heading,
      kind: s.kind,
      lines: s.lines,
      charts: (s.charts ?? []).flatMap((c) => c.series.map((series) => ({ title: `${c.title} — ${series.label}`, type: c.type, points: series.points }))),
    })),
  };
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
