import { stableFingerprint } from "../shared/fingerprint";
export const EQUIVALENCE_POLICY_VERSION = "orchestration-equivalence-v1";
export type MismatchSeverity =
  | "identical" | "operational_only" | "acceptable_normalization" | "non_user_visible"
  | "user_visible_low" | "user_visible_material" | "contract_incompatibility"
  | "comparison_impossible";
export interface NumericTolerance { path: string; absolute: number; justification: string; }
export interface EquivalencePolicy {
  policyVersion: string;
  engineId: string;
  contractVersion: string;
  exactPaths: readonly string[];
  fingerprintPaths: readonly string[];
  unorderedCollectionPaths: readonly string[];
  ignoredOperationalPaths: readonly string[];
  timestampPaths: readonly string[];
  numericTolerances: readonly NumericTolerance[];
  optionalPaths: readonly string[];
}
export interface EquivalenceDifference { path: string; severity: MismatchSeverity; baseline: unknown; shadow: unknown; reason: string; }
export interface EquivalenceResult {
  engineId: string; policyVersion: string; severity: MismatchSeverity;
  baselineFingerprint: string | null; shadowFingerprint: string | null;
  differences: EquivalenceDifference[];
}
const severityRank: Record<MismatchSeverity, number> = {
  identical: 0, operational_only: 1, acceptable_normalization: 2, non_user_visible: 3,
  user_visible_low: 4, user_visible_material: 5, contract_incompatibility: 6,
  comparison_impossible: 7,
};
export function defaultEquivalencePolicy(engineId: string, contractVersion: string): EquivalencePolicy {
  return {
    policyVersion: EQUIVALENCE_POLICY_VERSION, engineId, contractVersion,
    exactPaths: [], fingerprintPaths: ["$"], unorderedCollectionPaths: [],
    ignoredOperationalPaths: ["generatedAt", "createdAt", "updatedAt", "activatedAt"],
    timestampPaths: [], numericTolerances: [], optionalPaths: [],
  };
}
export function compareEngineOutputs(input: {
  policy: EquivalencePolicy; baseline: unknown; shadow: unknown;
  baselineContractVersion: string; shadowContractVersion: string;
}): EquivalenceResult {
  const { policy } = input;
  if (input.baseline == null || input.shadow == null)
    return result(policy, "comparison_impossible", input.baseline, input.shadow,
      [{ path: "$", severity: "comparison_impossible", baseline: input.baseline,
        shadow: input.shadow, reason: input.baseline == null ? "baseline_missing" : "shadow_missing" }]);
  if (input.baselineContractVersion !== input.shadowContractVersion ||
      input.shadowContractVersion !== policy.contractVersion)
    return result(policy, "contract_incompatibility", input.baseline, input.shadow,
      [{ path: "$", severity: "contract_incompatibility", baseline: input.baselineContractVersion,
        shadow: input.shadowContractVersion, reason: "contract_version_mismatch" }]);
  const differences: EquivalenceDifference[] = [];
  compareValue("$", normalize(input.baseline, policy, "$"), normalize(input.shadow, policy, "$"), policy, differences);
  const severity = differences.reduce<MismatchSeverity>((highest, item) =>
    severityRank[item.severity] > severityRank[highest] ? item.severity : highest, "identical");
  return result(policy, severity, input.baseline, input.shadow, differences);
}
function compareValue(path: string, baseline: unknown, shadow: unknown, policy: EquivalencePolicy, out: EquivalenceDifference[]) {
  if (Object.is(baseline, shadow)) return;
  const tolerance = policy.numericTolerances.find((item) => item.path === path);
  if (typeof baseline === "number" && typeof shadow === "number" && tolerance &&
      Math.abs(baseline - shadow) <= tolerance.absolute) {
    out.push({ path, severity: "acceptable_normalization", baseline, shadow, reason: tolerance.justification }); return;
  }
  if (Array.isArray(baseline) && Array.isArray(shadow)) {
    if (baseline.length !== shadow.length) out.push(diff(path, baseline, shadow, "array_length_mismatch"));
    const length = Math.min(baseline.length, shadow.length);
    for (let index = 0; index < length; index++) compareValue(`${path}[${index}]`, baseline[index], shadow[index], policy, out);
    return;
  }
  if (isObject(baseline) && isObject(shadow)) {
    const keys = new Set([...Object.keys(baseline), ...Object.keys(shadow)]);
    for (const key of [...keys].sort()) {
      const child = path === "$" ? key : `${path}.${key}`;
      if (policy.ignoredOperationalPaths.includes(child) || policy.ignoredOperationalPaths.includes(key)) continue;
      if (policy.optionalPaths.includes(child) && (!(key in baseline) || !(key in shadow))) continue;
      compareValue(child, baseline[key], shadow[key], policy, out);
    }
    return;
  }
  out.push(diff(path, baseline, shadow, "exact_value_mismatch"));
}
function normalize(value: unknown, policy: EquivalencePolicy, path: string): unknown {
  if (Array.isArray(value)) {
    const normalized = value.map((item, index) => normalize(item, policy, `${path}[${index}]`));
    return policy.unorderedCollectionPaths.includes(path)
      ? normalized.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : normalized;
  }
  if (isObject(value)) return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !policy.ignoredOperationalPaths.includes(key) &&
      !policy.ignoredOperationalPaths.includes(path === "$" ? key : `${path}.${key}`))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, normalize(item, policy, path === "$" ? key : `${path}.${key}`)]));
  return value;
}
function result(policy: EquivalencePolicy, severity: MismatchSeverity, baseline: unknown, shadow: unknown,
  differences: EquivalenceDifference[]): EquivalenceResult {
  return { engineId: policy.engineId, policyVersion: policy.policyVersion, severity,
    baselineFingerprint: baseline == null ? null : stableFingerprint(normalize(baseline, policy, "$")),
    shadowFingerprint: shadow == null ? null : stableFingerprint(normalize(shadow, policy, "$")), differences };
}
function diff(path: string, baseline: unknown, shadow: unknown, reason: string): EquivalenceDifference {
  return { path, baseline, shadow, reason, severity: "user_visible_material" };
}
function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

