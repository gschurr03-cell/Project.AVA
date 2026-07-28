import { z } from "zod";
import productionSurfacePolicy from "../../../config/production-surface-policy.json";

const bool = z.enum(["true","false"]).transform(value=>value==="true");
const schema = z.object({
  experimental30Fps: bool.default("true"),
  panningTiming: bool.default("false"),
  rtmpose: bool.default("false"),
  manualCrossing: bool.default("true"),
  savedVersions: bool.default("true"),
  exports: bool.default("false"),
  comparison: bool.default("false"),
  developerDiagnostics: bool.default("false"),
  interpretationEngine: bool.default("true"),
  interpretationDebugTrace: bool.default("false"),
  personalBaselineInterpretations: bool.default("false"),
  experimentalInterpretations: bool.default("true"),
  recommendationEngine: bool.default("true"),
  recommendationDebugTrace: bool.default("false"),
  experimentalRecommendations: bool.default("true"),
  advancedDrillRecommendations: bool.default("false"),
  professionalReviewRecommendations: bool.default("false"),
  priorityEngine: bool.default("true"),
  priorityDebugTrace: bool.default("false"),
  coachReportEngine: bool.default("true"),
  athleteReportView: bool.default("true"),
  coachReportView: bool.default("true"),
  reportPrintExport: bool.default("true"),
  reportCompositionTrace: bool.default("false"),
  shareableReports: bool.default("false"),
  biomechanicsDiscovery: bool.default("false"),
  discoveryDeveloperUi: bool.default("false"),
  researchKnowledgeEngine: bool.default("true"),
  researchAdminWorkspace: bool.default("false"),
  automatedClaimExtraction: bool.default("false"),
  athleteFacingEvidence: bool.default("false"),
  coachFacingEvidence: bool.default("false"),
  internalDiscoveryValidation: bool.default("true"),
  benchmarkEvidenceFoundation: bool.default("false"),
  researchDebugTrace: bool.default("false"),
  eliteBenchmarkEngine: bool.default("true"),
  benchmarkDeveloperUi: bool.default("false"),
  comparisonDeveloperUi: bool.default("false"),
  performanceProjectionEngine: bool.default("true"),
  projectionDeveloperUi: bool.default("false"),
  athleteFacingProjections: bool.default("false"),
  athleteDigitalTwin: bool.default("true"),
  digitalTwinDashboard: bool.default("false"),
  adaptiveCoachingEngine: bool.default("true"),
  adaptiveCoachingDashboard: bool.default("false"),
  performanceOptimizationLayer: bool.default("true"),
  optimizationDashboard: bool.default("false"),
  rootCauseIntelligence: bool.default("true"),
  rootCauseDashboard: bool.default("false"),
  rootCauseRecommendationAdapterEnabled: bool.default("true"),
  rootCauseRecommendationRolloutMode: z.enum(["OFF","SHADOW","ADVISORY","BOUNDED_INFLUENCE"]).default("SHADOW"),
  rootCauseRecommendationDashboardEnabled: bool.default("false"),
  rootCauseRecommendationPersistenceEnabled: bool.default("true"),
  rootCauseRecommendationShadowMetricsEnabled: bool.default("true"),
  intelligenceOrchestrationEnabled: bool.default("false"),
  intelligenceOrchestrationParallelExecution: bool.default("true"),
  intelligenceOrchestrationRetryEnabled: bool.default("true"),
  intelligenceOrchestrationPipelineValidation: bool.default("true"),
  intelligenceOrchestrationShadowExecution: bool.default("true"),
  intelligenceOrchestrationDashboard: bool.default("false"),
  intelligenceOrchestrationReadMode: z.enum([
    "LEGACY_ONLY","SHADOW_MANIFEST","MANIFEST_PREFERRED","MANIFEST_REQUIRED","MANIFEST_ONLY",
  ]).default("LEGACY_ONLY"),
  intelligenceOrchestrationRolloutMode: z.enum([
    "OFF","PLAN_ONLY","SHADOW","INTERNAL","BOUNDED_PRODUCTION",
  ]).default("OFF"),
  trainingProgramMode: z.enum([
    "DISABLED","FIXTURE_ONLY","PLAN_ONLY","SHADOW","INTERNAL_DRAFT",
    "COACH_REVIEWED_BETA","BOUNDED_ATHLETE_BETA","PRODUCTION",
  ]).default("DISABLED"),
  trainingLongitudinalMode: z.enum([
    "DISABLED","FIXTURES_ONLY","LONGITUDINAL_STATE_ONLY","SHADOW_ADAPTATION_EVALUATION",
    "INTERNAL_COACH_REVIEW","APPROVED_INTERNAL_ATHLETE_PLAN","BOUNDED_BETA","PRODUCTION",
  ]).default("DISABLED"),
  optionalLlmCoaching: bool.default("false"),
});
const parsedFeatures=schema.parse({
  experimental30Fps: process.env.NEXT_PUBLIC_FEATURE_EXPERIMENTAL_30_FPS ?? "true",
  panningTiming: process.env.NEXT_PUBLIC_FEATURE_PANNING_TIMING ?? "false",
  rtmpose: process.env.NEXT_PUBLIC_FEATURE_RTMPOSE ?? "false",
  manualCrossing: process.env.NEXT_PUBLIC_FEATURE_MANUAL_CROSSING ?? "true",
  savedVersions: process.env.NEXT_PUBLIC_FEATURE_SAVED_VERSIONS ?? "true",
  exports: process.env.NEXT_PUBLIC_FEATURE_EXPORTS ?? "false",
  comparison: process.env.NEXT_PUBLIC_FEATURE_COMPARISON ?? "false",
  developerDiagnostics: process.env.NEXT_PUBLIC_FEATURE_DEVELOPER_DIAGNOSTICS ?? "false",
  interpretationEngine: process.env.NEXT_PUBLIC_FEATURE_INTERPRETATION_ENGINE ?? "true",
  interpretationDebugTrace: process.env.NEXT_PUBLIC_FEATURE_INTERPRETATION_DEBUG_TRACE ?? "false",
  personalBaselineInterpretations:
    process.env.NEXT_PUBLIC_FEATURE_PERSONAL_BASELINE_INTERPRETATIONS ?? "false",
  experimentalInterpretations:
    process.env.NEXT_PUBLIC_FEATURE_EXPERIMENTAL_INTERPRETATIONS ?? "true",
  recommendationEngine: process.env.NEXT_PUBLIC_FEATURE_RECOMMENDATION_ENGINE ?? "true",
  recommendationDebugTrace:
    process.env.NEXT_PUBLIC_FEATURE_RECOMMENDATION_DEBUG_TRACE ?? "false",
  experimentalRecommendations:
    process.env.NEXT_PUBLIC_FEATURE_EXPERIMENTAL_RECOMMENDATIONS ?? "true",
  advancedDrillRecommendations:
    process.env.NEXT_PUBLIC_FEATURE_ADVANCED_DRILL_RECOMMENDATIONS ?? "false",
  professionalReviewRecommendations:
    process.env.NEXT_PUBLIC_FEATURE_PROFESSIONAL_REVIEW_RECOMMENDATIONS ?? "false",
  priorityEngine: process.env.NEXT_PUBLIC_FEATURE_PRIORITY_ENGINE ?? "true",
  priorityDebugTrace: process.env.NEXT_PUBLIC_FEATURE_PRIORITY_DEBUG_TRACE ?? "false",
  coachReportEngine: process.env.NEXT_PUBLIC_FEATURE_COACH_REPORT_ENGINE ?? "true",
  athleteReportView: process.env.NEXT_PUBLIC_FEATURE_ATHLETE_REPORT_VIEW ?? "true",
  coachReportView: process.env.NEXT_PUBLIC_FEATURE_COACH_REPORT_VIEW ?? "true",
  reportPrintExport: process.env.NEXT_PUBLIC_FEATURE_REPORT_PRINT_EXPORT ?? "true",
  reportCompositionTrace:
    process.env.NEXT_PUBLIC_FEATURE_REPORT_COMPOSITION_TRACE ?? "false",
  shareableReports: process.env.NEXT_PUBLIC_FEATURE_SHAREABLE_REPORTS ?? "false",
  biomechanicsDiscovery:
    process.env.NEXT_PUBLIC_FEATURE_BIOMECHANICS_DISCOVERY ?? "false",
  discoveryDeveloperUi:
    process.env.NEXT_PUBLIC_FEATURE_DISCOVERY_DEVELOPER_UI ?? "false",
  researchKnowledgeEngine:
    process.env.NEXT_PUBLIC_FEATURE_RESEARCH_KNOWLEDGE_ENGINE ?? "true",
  researchAdminWorkspace:
    process.env.NEXT_PUBLIC_FEATURE_RESEARCH_ADMIN_WORKSPACE ?? "false",
  automatedClaimExtraction:
    process.env.NEXT_PUBLIC_FEATURE_AUTOMATED_CLAIM_EXTRACTION ?? "false",
  athleteFacingEvidence:
    process.env.NEXT_PUBLIC_FEATURE_ATHLETE_FACING_EVIDENCE ?? "false",
  coachFacingEvidence:
    process.env.NEXT_PUBLIC_FEATURE_COACH_FACING_EVIDENCE ?? "false",
  internalDiscoveryValidation:
    process.env.NEXT_PUBLIC_FEATURE_INTERNAL_DISCOVERY_VALIDATION ?? "true",
  benchmarkEvidenceFoundation:
    process.env.NEXT_PUBLIC_FEATURE_BENCHMARK_EVIDENCE_FOUNDATION ?? "false",
  researchDebugTrace:
    process.env.NEXT_PUBLIC_FEATURE_RESEARCH_DEBUG_TRACE ?? "false",
  eliteBenchmarkEngine:
    process.env.NEXT_PUBLIC_FEATURE_ELITE_BENCHMARK_ENGINE ?? "true",
  benchmarkDeveloperUi:
    process.env.NEXT_PUBLIC_FEATURE_BENCHMARK_DEVELOPER_UI ?? "false",
  comparisonDeveloperUi:
    process.env.NEXT_PUBLIC_FEATURE_COMPARISON_DEVELOPER_UI ?? "false",
  performanceProjectionEngine:
    process.env.NEXT_PUBLIC_FEATURE_PERFORMANCE_PROJECTION_ENGINE ?? "true",
  projectionDeveloperUi:
    process.env.NEXT_PUBLIC_FEATURE_PROJECTION_DEVELOPER_UI ?? "false",
  athleteFacingProjections:
    process.env.NEXT_PUBLIC_FEATURE_ATHLETE_FACING_PROJECTIONS ?? "false",
  athleteDigitalTwin:
    process.env.NEXT_PUBLIC_FEATURE_ATHLETE_DIGITAL_TWIN ?? "true",
  digitalTwinDashboard:
    process.env.NEXT_PUBLIC_FEATURE_DIGITAL_TWIN_DASHBOARD ?? "false",
  adaptiveCoachingEngine:
    process.env.NEXT_PUBLIC_FEATURE_ADAPTIVE_COACHING_ENGINE ?? "true",
  adaptiveCoachingDashboard:
    process.env.NEXT_PUBLIC_FEATURE_ADAPTIVE_COACHING_DASHBOARD ?? "false",
  performanceOptimizationLayer:
    process.env.NEXT_PUBLIC_FEATURE_PERFORMANCE_OPTIMIZATION_LAYER ?? "true",
  optimizationDashboard:
    process.env.NEXT_PUBLIC_FEATURE_OPTIMIZATION_DASHBOARD ?? "false",
  rootCauseIntelligence:
    process.env.NEXT_PUBLIC_FEATURE_ROOT_CAUSE_INTELLIGENCE ?? "true",
  rootCauseDashboard:
    process.env.NEXT_PUBLIC_FEATURE_ROOT_CAUSE_DASHBOARD ?? "false",
  rootCauseRecommendationAdapterEnabled:
    process.env.NEXT_PUBLIC_FEATURE_ROOT_CAUSE_RECOMMENDATION_ADAPTER ?? "true",
  rootCauseRecommendationRolloutMode:
    process.env.NEXT_PUBLIC_ROOT_CAUSE_RECOMMENDATION_ROLLOUT_MODE ?? "SHADOW",
  rootCauseRecommendationDashboardEnabled:
    process.env.NEXT_PUBLIC_FEATURE_ROOT_CAUSE_RECOMMENDATION_DASHBOARD ?? "false",
  rootCauseRecommendationPersistenceEnabled:
    process.env.NEXT_PUBLIC_FEATURE_ROOT_CAUSE_RECOMMENDATION_PERSISTENCE ?? "true",
  rootCauseRecommendationShadowMetricsEnabled:
    process.env.NEXT_PUBLIC_FEATURE_ROOT_CAUSE_RECOMMENDATION_SHADOW_METRICS ?? "true",
  intelligenceOrchestrationEnabled:
    process.env.NEXT_PUBLIC_FEATURE_INTELLIGENCE_ORCHESTRATION ?? "false",
  intelligenceOrchestrationParallelExecution:
    process.env.NEXT_PUBLIC_FEATURE_INTELLIGENCE_ORCHESTRATION_PARALLEL ?? "true",
  intelligenceOrchestrationRetryEnabled:
    process.env.NEXT_PUBLIC_FEATURE_INTELLIGENCE_ORCHESTRATION_RETRY ?? "true",
  intelligenceOrchestrationPipelineValidation:
    process.env.NEXT_PUBLIC_FEATURE_INTELLIGENCE_ORCHESTRATION_VALIDATION ?? "true",
  intelligenceOrchestrationShadowExecution:
    process.env.NEXT_PUBLIC_FEATURE_INTELLIGENCE_ORCHESTRATION_SHADOW ?? "true",
  intelligenceOrchestrationDashboard:
    process.env.NEXT_PUBLIC_FEATURE_INTELLIGENCE_ORCHESTRATION_DASHBOARD ?? "false",
  intelligenceOrchestrationReadMode:
    process.env.INTELLIGENCE_ORCHESTRATION_READ_MODE ?? "LEGACY_ONLY",
  intelligenceOrchestrationRolloutMode:
    process.env.INTELLIGENCE_ORCHESTRATION_ROLLOUT_MODE ?? "OFF",
  trainingProgramMode:
    process.env.TRAINING_PROGRAM_MODE ?? "DISABLED",
  trainingLongitudinalMode:
    process.env.TRAINING_LONGITUDINAL_MODE ?? "DISABLED",
  optionalLlmCoaching:
    process.env.NEXT_PUBLIC_FEATURE_OPTIONAL_LLM_COACHING ?? "false",
});

type FeatureConfig = z.infer<typeof schema>;

export function assertProductionSurfacePolicy(features: FeatureConfig): void {
  if (process.env.AVA_ENVIRONMENT !== "production") return;

  const unsafe = productionSurfacePolicy.unsafeBooleanFeatures.filter(
    (key) => features[key as keyof FeatureConfig] === true,
  );
  const invalidModes = Object.entries(productionSurfacePolicy.requiredModes).filter(
    ([key, required]) => features[key as keyof FeatureConfig] !== required,
  );

  if (unsafe.length || invalidModes.length) {
    const violations = [
      ...unsafe.map((key) => `${key}=true`),
      ...invalidModes.map(([key, required]) => `${key} must equal ${required}`),
    ];
    throw new Error(
      `Unsafe production feature configuration: ${violations.join(", ")}`,
    );
  }
}

assertProductionSurfacePolicy(parsedFeatures);

export const FEATURES=parsedFeatures;
