import type { HistoricalMetricKey, ProgressCenterReport } from "@/lib/progressCenter";

export const COACH_WORKSPACE_VERSION = "ava-coach-workspace-v1" as const;

export type AthleteAttentionStatus = "on_track" | "watch" | "needs_attention" | "no_data";

export interface CoachAthleteInput {
  id: string;
  name: string;
  photoUrl?: string | null;
  event?: string | null;
  ageGroup?: string | null;
  favorite?: boolean;
  lastViewedAt?: string | null;
  report: ProgressCenterReport;
}

export interface CoachRosterAthlete {
  id: string;
  name: string;
  photoUrl: string | null;
  event: string;
  ageGroup: string;
  latestSession: string | null;
  latestSessionDate: string | null;
  status: AthleteAttentionStatus;
  statusReason: string;
  highestPriorityLimiter: string | null;
  latestPeakVelocity: number | null;
  latestConfidence: number | null;
  trendDirection: "improving" | "stable" | "declining" | "insufficient";
  recordingQuality: number | null;
  favorite: boolean;
  lastViewedAt: string | null;
  sessionCount: number;
}

export interface TeamAnalytics {
  athleteCount: number;
  averagePeakVelocity: number | null;
  averageContactTime: number | null;
  mostCommonLimiter: string | null;
  averageRecordingQuality: number | null;
  improvementRate: number;
  mostImprovedAthlete: string | null;
  athletesNeedingAttention: CoachRosterAthlete[];
  recentPbs: Array<{ athleteId: string; athleteName: string; metric: string; date: string }>;
  newInjuries: null;
}

const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

function statusFor(input: CoachAthleteInput): Pick<CoachRosterAthlete, "status" | "statusReason"> {
  if (!input.report.points.length) return { status: "no_data", statusReason: "No completed readable analyses." };
  if ((input.report.latestRecordingQuality ?? 100) < 60) return { status: "needs_attention", statusReason: "Latest recording quality is below 60." };
  if (input.report.regressing.length >= 2) return { status: "needs_attention", statusReason: `${input.report.regressing.length} measured areas are declining.` };
  if (input.report.highestPriorityLimiter?.status === "High") return { status: "watch", statusReason: `${input.report.highestPriorityLimiter.label} is high priority.` };
  if (input.report.regressing.length === 1) return { status: "watch", statusReason: `${input.report.regressing[0].label} is declining.` };
  return { status: "on_track", statusReason: input.report.improving.length ? "Measured progress is improving." : "No supported attention flag." };
}

export function buildCoachRoster(inputs: CoachAthleteInput[]): CoachRosterAthlete[] {
  return inputs.map((input) => {
    const latest = input.report.points.at(-1) ?? null;
    const peak = latest?.metrics.peakVelocity?.value ?? null;
    const primaryTrend = input.report.trends.find((trend) => trend.key === "peakVelocity")
      ?? input.report.trends.find((trend) => trend.points.length >= 2);
    return {
      id: input.id,
      name: input.name,
      photoUrl: input.photoUrl ?? null,
      event: input.event ?? "Not set",
      ageGroup: input.ageGroup ?? "Not set",
      latestSession: latest?.sessionName ?? null,
      latestSessionDate: latest?.date ?? null,
      ...statusFor(input),
      highestPriorityLimiter: input.report.highestPriorityLimiter?.label ?? null,
      latestPeakVelocity: peak,
      latestConfidence: input.report.currentConfidence,
      trendDirection: primaryTrend?.direction ?? "insufficient",
      recordingQuality: input.report.latestRecordingQuality,
      favorite: input.favorite ?? false,
      lastViewedAt: input.lastViewedAt ?? null,
      sessionCount: input.report.points.length,
    };
  }).sort((a, b) =>
    Number(b.favorite) - Number(a.favorite) ||
    (a.status === b.status ? 0 : ["needs_attention", "watch", "no_data", "on_track"].indexOf(a.status) - ["needs_attention", "watch", "no_data", "on_track"].indexOf(b.status)) ||
    a.name.localeCompare(b.name));
}

export function buildTeamAnalytics(inputs: CoachAthleteInput[], roster = buildCoachRoster(inputs)): TeamAnalytics {
  const latestValues = (key: HistoricalMetricKey) => inputs.flatMap((input) => {
    const value = input.report.points.at(-1)?.metrics[key]?.value;
    return value == null ? [] : [value];
  });
  const limiterCounts = new Map<string, number>();
  for (const athlete of roster) if (athlete.highestPriorityLimiter)
    limiterCounts.set(athlete.highestPriorityLimiter, (limiterCounts.get(athlete.highestPriorityLimiter) ?? 0) + 1);
  const mostCommonLimiter = [...limiterCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  const improved = inputs.filter((input) => input.report.improving.length > input.report.regressing.length);
  const mostImproved = [...inputs].sort((a, b) => {
    const aChange = a.report.trends.find((trend) => trend.key === "peakVelocity")?.changePct ?? -Infinity;
    const bChange = b.report.trends.find((trend) => trend.key === "peakVelocity")?.changePct ?? -Infinity;
    return bChange - aChange || a.name.localeCompare(b.name);
  })[0];
  return {
    athleteCount: roster.length,
    averagePeakVelocity: mean(latestValues("peakVelocity")),
    averageContactTime: mean(latestValues("groundContact")),
    mostCommonLimiter,
    averageRecordingQuality: mean(latestValues("recordingQuality")),
    improvementRate: roster.length ? Math.round(improved.length / roster.length * 100) : 0,
    mostImprovedAthlete: mostImproved?.report.trends.some((trend) => trend.direction === "improving") ? mostImproved.name : null,
    athletesNeedingAttention: roster.filter((athlete) => athlete.status === "needs_attention" || athlete.status === "watch"),
    recentPbs: inputs.flatMap((input) => input.report.currentPbs.flatMap((trend) => trend.personalBest ? [{
      athleteId: input.id, athleteName: input.name, metric: trend.label, date: trend.personalBest.date,
    }] : [])).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8),
    newInjuries: null,
  };
}

export interface AthleteComparison {
  left: string;
  right: string;
  metrics: Array<{ key: HistoricalMetricKey; label: string; left: number; right: number; difference: number }>;
  confidenceDifference: number | null;
  limiterDifference: string;
}

export function compareAthletes(left: CoachAthleteInput, right: CoachAthleteInput): AthleteComparison {
  const leftLatest = left.report.points.at(-1);
  const rightLatest = right.report.points.at(-1);
  const metrics: AthleteComparison["metrics"] = [];
  for (const trend of left.report.trends) {
    const a = leftLatest?.metrics[trend.key]?.value;
    const b = rightLatest?.metrics[trend.key]?.value;
    if (a != null && b != null) metrics.push({ key: trend.key, label: trend.label, left: a, right: b, difference: b - a });
  }
  return {
    left: left.name,
    right: right.name,
    metrics,
    confidenceDifference: left.report.currentConfidence != null && right.report.currentConfidence != null
      ? right.report.currentConfidence - left.report.currentConfidence : null,
    limiterDifference: `${left.report.highestPriorityLimiter?.label ?? "Resolved"} vs ${right.report.highestPriorityLimiter?.label ?? "Resolved"}`,
  };
}

