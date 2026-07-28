import { z } from "zod";

export const TRAINING_PROGRAM_ENGINE_VERSION = "training-program-intelligence-v1";
export const TRAINING_PROGRAM_INPUT_VERSION = "training-program-input-v1";
export const TRAINING_PLAN_CONTRACT_VERSION = "training-plan-snapshot-v1";
export const TRAINING_RULESET_VERSION = "training-rules-v1";
export const TRAINING_CATALOG_VERSION = "training-catalog-v1";
export const TRAINING_VALIDATION_VERSION = "training-validation-v1";

const provenanceSchema = z.object({
  source: z.enum(["athlete", "coach", "clinician", "activated_snapshot", "system", "ava_lift", "motion_iq"]),
  sourceId: z.string().min(1).max(200), capturedAt: z.string().datetime(),
  confidence: z.number().min(0).max(1),
}).strict();
export const sourcedStringSchema = z.object({ value: z.string().min(1).max(500), provenance: provenanceSchema }).strict();

export const readinessSignalSchema = z.object({
  id: z.string().min(1), type: z.enum(["pain", "soreness", "fatigue", "sleep", "stress", "motivation", "illness", "workload", "coach_restriction"]),
  severity: z.enum(["none", "low", "moderate", "high", "acute"]),
  affectedDomain: z.string().min(1).max(100), observedAt: z.string().datetime(),
  validUntil: z.string().datetime(), provenance: provenanceSchema,
}).strict();

export const restrictionSchema = z.object({
  id: z.string().min(1), authority: z.enum(["athlete", "coach", "clinician", "organization"]),
  affectedRegion: z.string().min(1).max(100), prohibitedCategories: z.array(z.string()).max(30),
  permittedCategories: z.array(z.string()).max(30), maximumIntensityPercent: z.number().min(0).max(100).nullable(),
  maximumVolume: z.number().nonnegative().nullable(), startsAt: z.string().datetime(),
  reviewAt: z.string().datetime().nullable(), expiresAt: z.string().datetime().nullable(),
  medicalClearance: z.enum(["not_applicable", "not_provided", "provided"]),
  provenance: provenanceSchema,
}).strict();

export const trainingObjectiveSchema = z.object({
  id: z.string().min(1), category: z.enum([
    "acceleration", "max_velocity", "speed_endurance", "technical_consistency",
    "contact_efficiency", "reactive_strength", "strength", "power", "recovery", "maintenance",
  ]),
  allocation: z.enum(["primary", "secondary", "maintenance", "monitoring", "deferred"]),
  sourceRecommendationId: z.string().min(1), sourcePriorityId: z.string().min(1),
  sourceOptimizationId: z.string().nullable(), sourceRootCauseId: z.string().nullable(),
  associatedMuscleGroups: z.array(z.string()).max(20), expectedBenefit: z.string().min(1).max(1_000),
  confidence: z.number().min(0).max(1), urgency: z.number().min(0).max(1),
  dependencies: z.array(z.string()).max(20), conflicts: z.array(z.string()).max(20),
  completionCriteria: z.array(z.string()).min(1).max(20), contraindications: z.array(z.string()).max(20),
}).strict();

export const sprintDosageSchema = z.object({
  kind: z.literal("sprint"), sets: z.number().int().positive().max(10),
  repetitions: z.number().int().positive().max(12), distanceM: z.number().positive().max(400),
  intensityPercent: z.number().min(50).max(100), restBetweenRepsSeconds: z.number().nonnegative().max(1_200),
  restBetweenSetsSeconds: z.number().nonnegative().max(1_800), surface: z.enum(["track", "turf", "hill"]),
  startType: z.enum(["standing", "three_point", "blocks", "fly"]),
  stoppingRule: z.string().min(1).max(500),
}).strict();
export const liftingDosageSchema = z.object({
  kind: z.literal("lifting"), sets: z.number().int().positive().max(10),
  repetitions: z.number().int().positive().max(20), loadMethod: z.enum(["percent_1rm", "rpe", "reps_in_reserve", "bodyweight"]),
  loadValue: z.number().nonnegative().nullable(), restSeconds: z.number().nonnegative().max(1_200),
  tempo: z.string().max(50).nullable(), stoppingRule: z.string().min(1).max(500),
}).superRefine((value, context) => {
  if (value.loadMethod !== "bodyweight" && value.loadValue == null)
    context.addIssue({ code: "custom", message: "Selected lifting load method requires a load value." });
});
export const recoveryDosageSchema = z.object({
  kind: z.literal("recovery"), durationMinutes: z.number().positive().max(120),
  intensity: z.enum(["very_low", "low"]), stoppingRule: z.string().min(1).max(500),
}).strict();
export const trainingDosageSchema = z.discriminatedUnion("kind", [
  sprintDosageSchema, recoveryDosageSchema,
  // ZodEffects cannot be a discriminated-union option, so lifting is validated separately downstream.
]).or(liftingDosageSchema);

export const trainingProgramInputSchema = z.object({
  contractVersion: z.literal(TRAINING_PROGRAM_INPUT_VERSION),
  requestId: z.string().uuid(), ownerId: z.string().uuid(), athleteId: z.string().uuid(),
  sourceManifest: z.object({ id: z.string().uuid(), authoritative: z.literal(true), status: z.literal("active"), activatedAt: z.string().datetime() }).strict(),
  athlete: z.object({
    ageCategory: z.enum(["adult", "masters", "youth"]).nullable(), trainingAgeYears: z.number().min(0).max(60),
    event: z.enum(["60m", "100m", "200m", "400m"]), performanceLevel: z.string().min(1),
    preferredUnits: z.enum(["metric", "imperial"]),
  }).strict(),
  objectives: z.array(trainingObjectiveSchema).min(1).max(12),
  upstream: z.object({
    recommendationSnapshotId: z.string().uuid(), prioritySnapshotId: z.string().uuid(),
    optimizationSnapshotId: z.string().uuid().nullable(), coachingStateSnapshotId: z.string().uuid().nullable(),
    digitalTwinSnapshotId: z.string().uuid().nullable(),
  }).strict(),
  context: z.object({
    seasonPhase: z.enum(["general_preparation", "specific_preparation", "precompetition", "competition", "championship_taper", "transition"]),
    startDate: z.string().date(), availableWeekdays: z.array(z.number().int().min(1).max(7)).min(3).max(6),
    maximumSessionMinutes: z.number().int().min(30).max(180),
    facilities: z.array(z.enum(["track", "turf", "hill", "weight_room"])).min(1),
    equipment: z.array(z.string().max(100)).max(50), preferredRestDays: z.array(z.number().int().min(1).max(7)).max(5),
  }).strict(),
  competitions: z.array(z.object({
    id: z.string().min(1), date: z.string().date(), event: z.string().min(1),
    importance: z.enum(["low", "preparation", "important", "championship"]),
    travel: z.boolean(), taperPriority: z.enum(["none", "minor", "moderate", "high"]),
  }).strict()).max(20),
  readiness: z.array(readinessSignalSchema).max(30), restrictions: z.array(restrictionSchema).max(30),
  recentExposure: z.object({
    sprintDistanceM: z.number().nonnegative(), highSpeedDistanceM: z.number().nonnegative(),
    accelerationDistanceM: z.number().nonnegative(), plyometricContacts: z.number().int().nonnegative(),
    strengthSessions: z.number().int().nonnegative(), windowDays: z.number().int().positive().max(28),
  }).strict(),
  history: z.object({ completedSessions: z.number().int().nonnegative(), missedSessions: z.number().int().nonnegative(),
    adverseResponses: z.number().int().nonnegative(), lastUpdatedAt: z.string().datetime() }).strict(),
  requiredCoachApproval: z.boolean(), operationalMetadata: z.object({ traceId: z.string().max(200), requestedAt: z.string().datetime() }).strict(),
}).strict();
export type TrainingProgramInput = z.infer<typeof trainingProgramInputSchema>;
export type TrainingObjective = z.infer<typeof trainingObjectiveSchema>;
export type TrainingDosage = z.infer<typeof trainingDosageSchema>;

export const planExerciseSchema = z.object({
  exerciseId: z.string().min(1), catalogVersion: z.literal(TRAINING_CATALOG_VERSION),
  dosage: trainingDosageSchema, objectiveIds: z.array(z.string()).min(1),
  rationale: z.string().min(1), ruleIds: z.array(z.string()).min(1),
}).strict();
export const planSessionSchema = z.object({
  id: z.string().min(1), weekday: z.number().int().min(1).max(7),
  type: z.enum(["acceleration","max_velocity","speed_endurance","tempo","strength_power","recovery","competition","taper","testing","rest"]),
  templateId: z.string().min(1), durationMinutes: z.number().nonnegative().max(180),
  objectiveIds: z.array(z.string()), exercises: z.array(planExerciseSchema),
  highIntensity: z.boolean(), rationale: z.string().min(1), ruleIds: z.array(z.string()).min(1),
}).strict();
export type PlanSession = z.infer<typeof planSessionSchema>;

export const planValidationSchema = z.object({
  version: z.literal(TRAINING_VALIDATION_VERSION),
  status: z.enum(["valid", "valid_with_warnings", "review_required", "invalid"]),
  errors: z.array(z.object({ code: z.string(), message: z.string(), ruleId: z.string() })),
  warnings: z.array(z.object({ code: z.string(), message: z.string(), ruleId: z.string() })),
  reviewItems: z.array(z.object({ code: z.string(), message: z.string(), ruleId: z.string() })),
  evidenceRequests: z.array(z.string()),
}).strict();
export type PlanValidation = z.infer<typeof planValidationSchema>;

export const trainingPlanSnapshotSchema = z.object({
  contractVersion: z.literal(TRAINING_PLAN_CONTRACT_VERSION), planId: z.string().uuid(),
  planVersion: z.number().int().positive(), athleteId: z.string().uuid(), ownerId: z.string().uuid(),
  sourceManifestId: z.string().uuid(), inputFingerprint: z.string().min(1), planFingerprint: z.string().min(1),
  engineVersion: z.literal(TRAINING_PROGRAM_ENGINE_VERSION), catalogVersion: z.literal(TRAINING_CATALOG_VERSION),
  ruleSetVersion: z.literal(TRAINING_RULESET_VERSION), validationVersion: z.literal(TRAINING_VALIDATION_VERSION),
  startDate: z.string().date(), endDate: z.string().date(), phase: z.string(),
  objectives: z.array(trainingObjectiveSchema), sessions: z.array(planSessionSchema).length(7),
  exposure: z.object({ totalSprintM: z.number().nonnegative(), accelerationM: z.number().nonnegative(),
    maximumVelocityM: z.number().nonnegative(), lowIntensityTempoM: z.number().nonnegative(),
    highIntensityDays: z.number().int().nonnegative() }).strict(),
  load: z.object({ neuralIntensity: z.number().min(0).max(10), mechanicalIntensity: z.number().min(0).max(10),
    sprintVolumeM: z.number().nonnegative(), highSpeedExposureM: z.number().nonnegative(),
    accelerationExposureM: z.number().nonnegative(), plyometricContacts: z.number().int().nonnegative(),
    strengthSessions: z.number().int().nonnegative(), metabolicDemand: z.number().min(0).max(10),
    recoveryCost: z.number().min(0).max(10) }).strict(),
  validation: planValidationSchema, explanations: z.array(z.object({
    decisionId: z.string(), explanation: z.string(), ruleIds: z.array(z.string()).min(1), sourceIds: z.array(z.string()).min(1),
  }).strict()).min(1),
  approval: z.object({ requirement: z.enum(["athlete_permitted", "coach_required", "clinician_required", "blocked"]),
    approved: z.literal(false) }).strict(),
  lifecycle: z.literal("draft"), previousPlanId: z.string().uuid().nullable(), createdAt: z.string().datetime(),
}).strict();
export type TrainingPlanSnapshot = z.infer<typeof trainingPlanSnapshotSchema>;
