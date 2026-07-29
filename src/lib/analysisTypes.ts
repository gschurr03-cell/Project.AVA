export const ANALYSIS_TYPES = ["fly", "acceleration"] as const;

export type AnalysisType = (typeof ANALYSIS_TYPES)[number];

export interface AnalysisTypeConfig {
  type: AnalysisType;
  benchmarkId: string | null;
  analysisTitle: string;
  displayTitle: string | null;
  sourceVideoName: string | null;
}

export const ANALYSIS_TYPE_CONFIG: Record<AnalysisType, AnalysisTypeConfig> = {
  fly: {
    type: "fly",
    benchmarkId: "44444444-4444-4444-8444-444444444444",
    analysisTitle: "Fly Analysis",
    displayTitle: "AVA Calab Vid 1",
    sourceVideoName: null,
  },
  acceleration: {
    type: "acceleration",
    benchmarkId: "55555555-5555-4555-8555-555555555555",
    analysisTitle: "Acceleration Analysis",
    displayTitle: "AVA Accel Test",
    sourceVideoName: "IMG_1961.MOV",
  },
};

export function isAnalysisType(value: unknown): value is AnalysisType {
  return typeof value === "string" && ANALYSIS_TYPES.includes(value as AnalysisType);
}

export function analysisTypeConfig(value: unknown): AnalysisTypeConfig {
  return ANALYSIS_TYPE_CONFIG[isAnalysisType(value) ? value : "fly"];
}

export function accelerationProfileLabel(distanceM: number | null | undefined): string {
  return `0–${distanceM === 30 ? 30 : 20}m acceleration profile`;
}
