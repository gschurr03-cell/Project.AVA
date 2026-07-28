export interface InternalRolloutScope {
  environment: string; ownerId: string; athleteId: string; tenantId?: string;
  internalRole: boolean; cohortPercentage: number; allowedOwnerIds: readonly string[];
  allowedAthleteIds: readonly string[]; allowedEngineIds: readonly string[];
  requestedEngineIds: readonly string[]; allowedAnalysisTypes: readonly string[];
  analysisType: string; userAuthoritativeActivationRequested: boolean;
}
export function evaluateInternalRollout(scope: InternalRolloutScope) {
  const reasons: string[] = [];
  if (!["development","test","staging","internal"].includes(scope.environment)) reasons.push("environment_not_internal");
  if (!scope.internalRole) reasons.push("internal_role_required");
  if (!scope.allowedOwnerIds.includes(scope.ownerId)) reasons.push("owner_not_allowlisted");
  if (!scope.allowedAthleteIds.includes(scope.athleteId)) reasons.push("athlete_not_allowlisted");
  if (!scope.allowedAnalysisTypes.includes(scope.analysisType)) reasons.push("analysis_type_not_allowlisted");
  if (scope.requestedEngineIds.some((id) => !scope.allowedEngineIds.includes(id))) reasons.push("engine_set_not_allowlisted");
  if (scope.cohortPercentage < 0 || scope.cohortPercentage > 100) reasons.push("invalid_cohort_percentage");
  if (scope.userAuthoritativeActivationRequested) reasons.push("user_authoritative_activation_prohibited");
  return { allowed: reasons.length === 0, internalManifestOnly: true as const, reasons };
}

