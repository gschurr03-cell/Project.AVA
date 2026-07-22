/**
 * Report Generator (Phase 11). Builds professional, presentation-free report structures for
 * individual athletes, teams, seasons, progress reviews, coach meetings, and recruiting.
 * Sections carry metrics, chart specs, explanations, confidence, trends, evidence, and coach
 * notes — the UI/PDF layer renders them. Coach preferences may reword headings/text without
 * altering any number. Pure + deterministic.
 */

import type { ProgressIntelligence } from "../progress/models";
import type { AthleteSummary, ChartSpec, CoachNote, Report, ReportSection, TeamAnalytics } from "./models";
import { applyTerminology, type ResolvedPreferences } from "./preferences";
import { ATHLETE_CARD_VERSION } from "./athleteCard";
import { TEAM_ANALYTICS_VERSION } from "./analytics";

export const REPORT_GENERATOR_VERSION = "ava-coach-report-v1" as const;

export interface AthleteReportInput {
  orgId: string;
  reportId: string;
  summary: AthleteSummary;
  progress?: ProgressIntelligence | null;
  notes?: CoachNote[];
  chartMetrics?: string[];
  preferences?: ResolvedPreferences | null;
  now: Date;
}

export function generateAthleteReport(input: AthleteReportInput): Report {
  const s = input.summary;
  const prefs = input.preferences ?? null;
  const word = (t: string) => (prefs ? applyTerminology(t, prefs) : t);

  const sections: ReportSection[] = [];

  sections.push({
    id: "overview",
    heading: word("Athlete Overview"),
    kind: "metrics",
    lines: [
      `Current PB: ${fmt(s.currentPbS)}s`,
      `Goal PB: ${fmt(s.goalPbS)}s`,
      `Development Score: ${fmt(s.developmentScore)}`,
      `Blueprint Completion: ${fmt(s.blueprintCompletion)}%`,
      `Status: ${s.status}`,
    ],
  });

  sections.push({
    id: "trend",
    heading: word("Trend Summary"),
    kind: "trend",
    lines: [
      `Overall direction: ${s.trendDirection}`,
      s.recentProgress,
      ...(input.progress?.trends.slice(0, 6).map((t) => `${t.label}: ${t.status} (${t.percentChange ?? "—"}%)`) ?? []),
    ],
  });

  const charts = buildMetricCharts(input.progress ?? null, input.chartMetrics ?? ["averageVelocity", "peakVelocity"]);
  if (charts.length) sections.push({ id: "charts", heading: word("Performance Charts"), kind: "chart", lines: [], charts });

  if (s.highestPriorityLimiter) {
    sections.push({
      id: "explanation",
      heading: word("Primary Limiter"),
      kind: "explanation",
      lines: [word(`Highest-priority limiter: ${s.highestPriorityLimiter.label} (${s.highestPriorityLimiter.contributionPct ?? "—"}% of achievable improvement).`)],
    });
  }

  sections.push({
    id: "confidence",
    heading: word("Confidence"),
    kind: "confidence",
    lines: [`Overall confidence: ${s.confidence.category}${s.confidence.score != null ? ` (${s.confidence.score})` : ""}.`, "AVA figures are estimates; the coach's judgement prevails."],
  });

  if (input.progress?.attribution) {
    sections.push({
      id: "evidence",
      heading: word("Improvement Attribution"),
      kind: "evidence",
      lines: input.progress.attribution.contributions.map((c) => `${c.label}: ${c.contributionPct}% (${c.direction})`),
    });
  }

  if (input.notes?.length) {
    sections.push({ id: "notes", heading: word("Coach Notes"), kind: "notes", lines: input.notes.map((n) => `${n.pinned ? "📌 " : ""}${n.text}`) });
  }

  return report(input.reportId, "athlete", word(`Athlete Report — ${s.name}`), s.athleteId, input.orgId, sections, input.now);
}

export interface TeamReportInput {
  orgId: string;
  reportId: string;
  teamName: string;
  analytics: TeamAnalytics;
  summaries: AthleteSummary[];
  kind?: "team" | "season" | "meeting" | "recruiting";
  preferences?: ResolvedPreferences | null;
  now: Date;
}

export function generateTeamReport(input: TeamReportInput): Report {
  const a = input.analytics;
  const prefs = input.preferences ?? null;
  const word = (t: string) => (prefs ? applyTerminology(t, prefs) : t);

  const sections: ReportSection[] = [
    {
      id: "team-overview",
      heading: word("Team Overview"),
      kind: "metrics",
      lines: [
        `Athletes: ${a.athleteCount}`,
        `Average Blueprint Completion: ${fmt(a.averageBlueprintCompletion)}%`,
        `Average Development Score: ${fmt(a.averageDevelopmentScore)}`,
        `Overall Recording Quality: ${fmt(a.overallRecordingQuality)}`,
      ],
    },
    {
      id: "team-insights",
      heading: word("Team Insights"),
      kind: "explanation",
      lines: [
        a.mostCommonLimitation ? `Most common limitation: ${a.mostCommonLimitation.label} (${a.mostCommonLimitation.count})` : "Most common limitation: —",
        a.mostImprovedMetric ? `Most improved metric: ${a.mostImprovedMetric.label} (${a.mostImprovedMetric.averagePercentChange}%)` : "Most improved metric: —",
        a.mostCommonAccelerationIssue ? `Most common acceleration issue: ${a.mostCommonAccelerationIssue.label}` : "Most common acceleration issue: —",
      ],
    },
    {
      id: "opportunities",
      heading: word("Top Opportunities"),
      kind: "evidence",
      lines: a.topOpportunities.map((o) => `${o.label}: ${o.note}`),
    },
    {
      id: "roster",
      heading: word("Roster"),
      kind: "metrics",
      lines: input.summaries.map((s) => `${s.name}: ${s.status}, dev ${fmt(s.developmentScore)}, trend ${s.trendDirection}`),
    },
  ];

  return report(input.reportId, input.kind ?? "team", word(`Team Report — ${input.teamName}`), input.orgId, input.orgId, sections, input.now);
}

function buildMetricCharts(progress: ProgressIntelligence | null, metricIds: string[]): ChartSpec[] {
  if (!progress) return [];
  const charts: ChartSpec[] = [];
  for (const metricId of metricIds) {
    const trend = progress.trends.find((t) => t.metricId === metricId);
    if (!trend || trend.points.length === 0) continue;
    charts.push({
      id: `chart-${metricId}`,
      type: "line",
      title: trend.label,
      xLabel: "Date",
      yLabel: trend.unit || "value",
      series: [{ label: trend.label, points: trend.points.map((p) => ({ x: p.date, y: p.value })) }],
    });
  }
  return charts;
}

function report(id: string, kind: Report["kind"], title: string, subjectId: string, orgId: string, sections: ReportSection[], now: Date): Report {
  return {
    id,
    kind,
    title,
    subjectId,
    orgId,
    generatedAt: now.toISOString(),
    sections,
    provenance: { engineVersions: { report: REPORT_GENERATOR_VERSION, athleteCard: ATHLETE_CARD_VERSION, analytics: TEAM_ANALYTICS_VERSION } },
  };
}

function fmt(v: number | null): string {
  return v == null ? "—" : String(v);
}
