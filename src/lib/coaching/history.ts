import type { CoachingReport } from "./types";

export interface AthleteHistorySummary {
  totalSessions: number;
  latestTechniqueScore: number | null;
  previousTechniqueScore: number | null;
  techniqueChange: number | null;
  averageTechniqueScore: number | null;
  bestTechniqueScore: number | null;
  improving: boolean;
}

export function summarizeHistory(reports: CoachingReport[]): AthleteHistorySummary {
  if (reports.length === 0) {
    return {
      totalSessions: 0,
      latestTechniqueScore: null,
      previousTechniqueScore: null,
      techniqueChange: null,
      averageTechniqueScore: null,
      bestTechniqueScore: null,
      improving: false,
    };
  }

  const latest = reports[0];
  const previous = reports.length > 1 ? reports[1] : null;

  const average = reports.reduce((sum, report) => sum + report.techniqueScore, 0) / reports.length;
  const best = Math.max(...reports.map((report) => report.techniqueScore));
  const change = previous == null ? null : latest.techniqueScore - previous.techniqueScore;

  return {
    totalSessions: reports.length,
    latestTechniqueScore: latest.techniqueScore,
    previousTechniqueScore: previous?.techniqueScore ?? null,
    techniqueChange: change,
    averageTechniqueScore: Math.round(average),
    bestTechniqueScore: best,
    improving: change != null && change > 0,
  };
}
