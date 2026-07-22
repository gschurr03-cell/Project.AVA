/**
 * The single source of truth for the `analyses` experimental/validation CONTRACT.
 *
 * Postgres enforces this exact rule (migration 0023, constraint
 * `analyses_experimental_contract_valid`) and it must never be weakened:
 *
 *   (not experimental and experiment_version is null and compatibility_group = 'validated-60-v1')
 *   or
 *   (experimental and experiment_version is not null and validation_status = 'experimental'
 *      and compatibility_group <> 'validated-60-v1')
 *
 * No caller should ever hand-assemble these four columns. Build them here — a fresh
 * analysis and a rerun both produce {@link validatedAnalysisContract}; an experimental
 * profile produces {@link experimentalAnalysisContract} — so an invalid combination is
 * impossible by construction, and a rerun can never leave a stale experimental
 * `compatibility_group` on an otherwise-validated row (the drift that violated the
 * constraint). Pure + framework-free so it can be unit-tested against the DB rule.
 */

export const VALIDATED_COMPATIBILITY_GROUP = "validated-60-v1" as const;

export type AnalysisValidationStatus = "validated" | "experimental" | "unvalidated";

/** The four columns governed by `analyses_experimental_contract_valid`. */
export interface AnalysisContractFields {
  experimental: boolean;
  experiment_version: string | null;
  validation_status: AnalysisValidationStatus;
  compatibility_group: string;
}

/**
 * The validated contract every non-experimental analysis MUST carry — a new upload, a
 * mobile submission, and (critically) a rerun that resets a previously-experimental
 * working row back to validated.
 */
export function validatedAnalysisContract(): AnalysisContractFields {
  return {
    experimental: false,
    experiment_version: null,
    validation_status: "validated",
    compatibility_group: VALIDATED_COMPATIBILITY_GROUP,
  };
}

/**
 * The experimental contract. `experimentVersion` must be non-empty and
 * `compatibilityGroup` must be a non-validated group; anything else cannot satisfy the
 * DB rule and is rejected here rather than at the failing INSERT.
 */
export function experimentalAnalysisContract(
  experimentVersion: string,
  compatibilityGroup: string,
): AnalysisContractFields {
  if (!experimentVersion || experimentVersion.trim().length === 0) {
    throw new Error("experimentalAnalysisContract: experiment_version must be non-empty");
  }
  if (compatibilityGroup === VALIDATED_COMPATIBILITY_GROUP) {
    throw new Error(
      `experimentalAnalysisContract: compatibility_group must differ from '${VALIDATED_COMPATIBILITY_GROUP}'`,
    );
  }
  const fields: AnalysisContractFields = {
    experimental: true,
    experiment_version: experimentVersion,
    validation_status: "experimental",
    compatibility_group: compatibilityGroup,
  };
  assertAnalysisContract(fields);
  return fields;
}

/**
 * Faithful mirror of `analyses_experimental_contract_valid`. Returns true iff the DB
 * would accept the row. Kept structurally identical to the SQL so drift is obvious.
 */
export function analysisContractSatisfiesConstraint(fields: AnalysisContractFields): boolean {
  const validated =
    !fields.experimental &&
    fields.experiment_version == null &&
    fields.compatibility_group === VALIDATED_COMPATIBILITY_GROUP;
  const experimental =
    fields.experimental &&
    fields.experiment_version != null &&
    fields.validation_status === "experimental" &&
    fields.compatibility_group !== VALIDATED_COMPATIBILITY_GROUP;
  return validated || experimental;
}

/** Throw a descriptive error when a contract would violate the DB rule. */
export function assertAnalysisContract(fields: AnalysisContractFields): void {
  if (!analysisContractSatisfiesConstraint(fields)) {
    throw new Error(
      "analyses_experimental_contract_valid violated: " +
        JSON.stringify({
          experimental: fields.experimental,
          experiment_version: fields.experiment_version,
          validation_status: fields.validation_status,
          compatibility_group: fields.compatibility_group,
        }),
    );
  }
}
