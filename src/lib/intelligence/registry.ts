import{ADAPTIVE_COACHING_ENGINE_VERSION}from"@/lib/adaptiveCoaching";
import{BENCHMARK_ENGINE_VERSION}from"@/lib/benchmarkEngine";
import{DIGITAL_TWIN_ENGINE_VERSION}from"@/lib/digitalTwin";
import{INTERPRETATION_ENGINE_VERSION}from"@/lib/intelligence/interpretations";
import{PRIORITY_ENGINE_VERSION}from"@/lib/intelligence/priorityEngine";
import{RECOMMENDATION_ENGINE_VERSION}from"@/lib/intelligence/recommendationEngine";
import{COACH_REPORT_ENGINE_VERSION}from"@/lib/intelligence/reports";
import{OBSERVATION_ENGINE_VERSION}from"@/lib/observations";
import{PERFORMANCE_OPTIMIZATION_ENGINE_VERSION}from"@/lib/performanceOptimization";
import{PROJECTION_ENGINE_VERSION}from"@/lib/projectionEngine";
import{RESEARCH_ENGINE_VERSION}from"@/lib/research/knowledge/contracts";
import{ROOT_CAUSE_ENGINE_VERSION}from"@/lib/rootCause";
import{ROOT_CAUSE_RECOMMENDATION_ADAPTER_VERSION}from"@/lib/rootCauseRecommendation";
import{TRAINING_PROGRAM_ENGINE_VERSION}from"@/lib/trainingProgram";
import{immutableSnapshotCache}from"./shared/cache";
import{engineRegistryEntrySchema,type EngineRegistryEntry}from"./shared/contracts";

const none=(owner:string,offline=false)=>({
  strategy:"none"as const,appOpenBehavior:"not_applicable"as const,offlineCompatible:offline,
  idempotentFingerprint:false,invalidationOwner:owner,persistenceMigration:null,
});
const derived=(owner:string,offline=false)=>({
  strategy:"derived_result"as const,appOpenBehavior:"not_applicable"as const,offlineCompatible:offline,
  idempotentFingerprint:true,invalidationOwner:owner,persistenceMigration:null,
});
const contract=(input:string,output:string,offline:boolean,immutable=true)=>({
  inputContract:input,outputContract:output,versioned:true as const,stronglyTyped:true as const,
  serializable:true as const,immutableOutput:immutable,cacheCompatible:true,
  offlineCompatible:offline,futureCompatibility:"additive_versioned"as const,
});
const entry=(value:EngineRegistryEntry)=>engineRegistryEntrySchema.parse(value);
export const INTELLIGENCE_ENGINE_REGISTRY:readonly EngineRegistryEntry[]=[
entry({engineId:"observation",displayName:"Observation Engine",engineVersion:OBSERVATION_ENGINE_VERSION,
 status:"active",lifecycle:"production",dependencies:[],pipelinePredecessor:null,
 contract:contract("CompletedAnalysisObservationInput","ObservationGenerationResult",false),
 cachePolicy:derived("analysis-result"),featureFlags:[],documentation:["docs/observation-engine.md"],
 dashboard:null,tests:["npm run observation-engine:sanity"],owner:"biomechanics-intelligence"}),
entry({engineId:"interpretation",displayName:"Interpretation Engine",engineVersion:INTERPRETATION_ENGINE_VERSION,
 status:"active",lifecycle:"production",dependencies:["observation"],pipelinePredecessor:"observation",
 contract:contract("InterpretationInput","InterpretationResult",false),
 cachePolicy:derived("analysis-lifecycle"),featureFlags:["interpretationEngine"],
 documentation:["docs/interpretation-engine.md"],dashboard:"session InterpretationDebugPanel",
 tests:["npm run interpretation-engine:sanity"],owner:"intelligence"}),
entry({engineId:"root_cause",displayName:"Root Cause Intelligence",engineVersion:ROOT_CAUSE_ENGINE_VERSION,
 status:"feature_gated",lifecycle:"development",dependencies:["interpretation","digital_twin","research","benchmark","projection"],
 pipelinePredecessor:"interpretation",contract:contract("RootCauseInput","RootCauseState",true),
 cachePolicy:immutableSnapshotCache({invalidationOwner:"root_cause",persistenceMigration:"0045",offlineCompatible:true}),
 featureFlags:["rootCauseIntelligence","rootCauseDashboard"],documentation:["docs/root-cause-intelligence.md"],
 dashboard:"/coaching/root-causes",tests:["npm run root-cause:sanity"],owner:"intelligence"}),
entry({engineId:"root_cause_recommendation_adapter",displayName:"Root Cause-to-Recommendation Adapter",
 engineVersion:ROOT_CAUSE_RECOMMENDATION_ADAPTER_VERSION,status:"feature_gated",lifecycle:"shadow",
 dependencies:["root_cause","recommendation","digital_twin"],pipelinePredecessor:"root_cause",
 contract:contract("RootCauseRecommendationAdapterInput","RootCauseRecommendationContext",true),
 cachePolicy:immutableSnapshotCache({invalidationOwner:"root_cause_recommendation",persistenceMigration:"0046",offlineCompatible:true}),
 featureFlags:["rootCauseRecommendationAdapterEnabled","rootCauseRecommendationRolloutMode",
 "rootCauseRecommendationDashboardEnabled"],documentation:["docs/root-cause-recommendation-adapter.md"],
 dashboard:"/coaching/root-cause-recommendation",tests:["npm run root-cause-recommendation:sanity"],owner:"intelligence"}),
entry({engineId:"recommendation",displayName:"Recommendation Engine",engineVersion:RECOMMENDATION_ENGINE_VERSION,
 status:"active",lifecycle:"production",dependencies:["interpretation"],pipelinePredecessor:"root_cause_recommendation_adapter",
 contract:contract("RecommendationInput","RecommendationResult",false),
 cachePolicy:derived("analysis-lifecycle"),featureFlags:["recommendationEngine"],
 documentation:["docs/recommendation-engine.md"],dashboard:"session RecommendationDebugPanel",
 tests:["npm run recommendation-engine:sanity"],owner:"coaching-intelligence"}),
entry({engineId:"priority",displayName:"Priority Engine",engineVersion:PRIORITY_ENGINE_VERSION,
 status:"active",lifecycle:"production",dependencies:["observation","interpretation","recommendation"],
 pipelinePredecessor:"recommendation",contract:contract("PriorityInput","PriorityResult",false),
 cachePolicy:derived("analysis-lifecycle"),featureFlags:["priorityEngine"],
 documentation:["docs/priority-engine.md"],dashboard:"session PriorityDebugPanel",
 tests:["npm run priority-engine:sanity"],owner:"coaching-intelligence"}),
entry({engineId:"performance_optimization",displayName:"Performance Optimization",
 engineVersion:PERFORMANCE_OPTIMIZATION_ENGINE_VERSION,status:"feature_gated",lifecycle:"development",
 dependencies:["priority","recommendation","digital_twin","research","benchmark","projection"],
 pipelinePredecessor:"priority",contract:contract("PerformanceOptimizationInput","PerformanceOptimizationState",true),
 cachePolicy:immutableSnapshotCache({invalidationOwner:"performance_optimization",persistenceMigration:"0044",offlineCompatible:true}),
 featureFlags:["performanceOptimizationLayer","optimizationDashboard"],
 documentation:["docs/performance-optimization-layer.md"],dashboard:"/coaching/optimization",
 tests:["npm run performance-optimization:sanity"],owner:"coaching-intelligence"}),
entry({engineId:"adaptive_coaching",displayName:"Adaptive Coaching",
 engineVersion:ADAPTIVE_COACHING_ENGINE_VERSION,status:"feature_gated",lifecycle:"development",
 dependencies:["performance_optimization","digital_twin"],pipelinePredecessor:"performance_optimization",
 contract:contract("AdaptiveCoachingInput","CoachingState",true),
 cachePolicy:immutableSnapshotCache({invalidationOwner:"adaptive_coaching",persistenceMigration:"0043",offlineCompatible:true}),
 featureFlags:["adaptiveCoachingEngine","adaptiveCoachingDashboard"],
 documentation:["docs/adaptive-coaching-engine.md"],dashboard:"/coaching",
 tests:["npm run adaptive-coaching:sanity"],owner:"coaching-intelligence"}),
entry({engineId:"coach_report",displayName:"Coach Report Engine",engineVersion:COACH_REPORT_ENGINE_VERSION,
 status:"active",lifecycle:"production",dependencies:["observation","interpretation","recommendation","priority"],
 pipelinePredecessor:"priority",contract:contract("CoachReportInput","CoachReport",true),
 cachePolicy:derived("saved-analysis-version",true),featureFlags:["coachReportEngine"],
 documentation:["docs/coach-report-engine.md"],dashboard:"/sessions/[id]/report",
 tests:["npm run coach-report:sanity"],owner:"reporting"}),
entry({engineId:"research",displayName:"Research Knowledge Engine",engineVersion:RESEARCH_ENGINE_VERSION,
 status:"active",lifecycle:"production",dependencies:[],pipelinePredecessor:null,
 contract:contract("ResearchRetrievalInput","ResearchRetrievalResult",true),
 cachePolicy:{...none("research-governance",true),strategy:"versioned_dataset",idempotentFingerprint:true},
 featureFlags:["researchKnowledgeEngine"],documentation:["docs/research-knowledge-engine.md"],
 dashboard:"/research",tests:["npm run research-engine:sanity"],owner:"evidence-governance"}),
entry({engineId:"benchmark",displayName:"Benchmark Engine",engineVersion:BENCHMARK_ENGINE_VERSION,
 status:"active",lifecycle:"production",dependencies:["research"],pipelinePredecessor:null,
 contract:contract("BenchmarkDataset + AthleteComparisonContext","BenchmarkComparisonResult",true),
 cachePolicy:{...none("benchmark-governance",true),strategy:"versioned_dataset",idempotentFingerprint:true},
 featureFlags:["eliteBenchmarkEngine"],documentation:["docs/benchmark-engine.md"],dashboard:"/benchmarks",
 tests:["npm run benchmark-engine:sanity"],owner:"evidence-governance"}),
entry({engineId:"projection",displayName:"Performance Projection",engineVersion:PROJECTION_ENGINE_VERSION,
 status:"feature_gated",lifecycle:"development",dependencies:["benchmark"],pipelinePredecessor:null,
 contract:contract("ProjectionInput","PerformanceProjection",true),
 cachePolicy:immutableSnapshotCache({invalidationOwner:"projection",persistenceMigration:"0041",offlineCompatible:true}),
 featureFlags:["performanceProjectionEngine"],documentation:["docs/performance-projection-engine.md"],
 dashboard:"/projections",tests:["npm run projection-engine:sanity"],owner:"performance-intelligence"}),
entry({engineId:"digital_twin",displayName:"Athlete Digital Twin",engineVersion:DIGITAL_TWIN_ENGINE_VERSION,
 status:"feature_gated",lifecycle:"development",dependencies:[],pipelinePredecessor:null,
 contract:contract("DigitalTwinInput","AthleteDigitalTwin",true),
 cachePolicy:immutableSnapshotCache({invalidationOwner:"digital_twin",persistenceMigration:"0042",offlineCompatible:true}),
 featureFlags:["athleteDigitalTwin","digitalTwinDashboard"],documentation:["docs/digital-twin.md"],
 dashboard:"/athlete/intelligence",tests:["npm run digital-twin:sanity"],owner:"athlete-intelligence"}),
entry({engineId:"training_program",displayName:"Training Program Intelligence",
 engineVersion:TRAINING_PROGRAM_ENGINE_VERSION,status:"internal",lifecycle:"development",
 dependencies:["recommendation","priority","performance_optimization","adaptive_coaching","digital_twin"],
 pipelinePredecessor:null,contract:contract("TrainingProgramInput","TrainingPlanSnapshot",true),
 cachePolicy:{strategy:"immutable_snapshot_active_pointer",appOpenBehavior:"cache_only",
   offlineCompatible:true,idempotentFingerprint:true,invalidationOwner:"training_program",
   persistenceMigration:null},
 featureFlags:["trainingProgramMode"],documentation:["docs/training-program-intelligence-architecture.md"],
 dashboard:null,tests:["npm run training-program:sanity"],owner:"training-intelligence"}),
]as const;

export const INTELLIGENCE_PIPELINE_EDGES=Object.freeze([
  ["observation","interpretation"],["interpretation","root_cause"],
  ["root_cause","root_cause_recommendation_adapter"],
  ["root_cause_recommendation_adapter","recommendation"],["recommendation","priority"],
  ["priority","performance_optimization"],["performance_optimization","adaptive_coaching"],
  ["priority","coach_report"],
]as const);
