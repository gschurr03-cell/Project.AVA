import { RESEARCH_METRIC_DEFINITIONS, TERMINOLOGY_MAPPINGS } from "./taxonomy";

export function normalizeResearchTerm(term: string): {
  originalTerm: string; normalizedKey: string | null;
  relationship: string; preserveDistinct: boolean; trace: string[];
} {
  const normalized = term.toLowerCase().trim();
  const mapping = TERMINOLOGY_MAPPINGS.find((item) => item.originalTerm === normalized);
  return mapping
    ? {
        originalTerm: term, normalizedKey: mapping.normalizedKey,
        relationship: mapping.relationship, preserveDistinct: mapping.preserveDistinct,
        trace: [`mapping:${mapping.version}`, `relationship:${mapping.relationship}`],
      }
    : { originalTerm: term, normalizedKey: null, relationship: "unknown", preserveDistinct: true, trace: ["mapping:not_found"] };
}

export function metricsAreComparable(
  left: { metricKey: string; unit: string; protocol: string; phase: string | null },
  right: { metricKey: string; unit: string; protocol: string; phase: string | null },
): { comparable: boolean; reasons: string[] } {
  if (left.metricKey !== right.metricKey) return { comparable: false, reasons: ["Canonical metric keys differ."] };
  const definition = RESEARCH_METRIC_DEFINITIONS.find((item) => item.metricKey === left.metricKey);
  if (!definition) return { comparable: false, reasons: ["No reviewed canonical metric definition exists."] };
  const reasons: string[] = [];
  if (left.unit !== right.unit || left.unit !== definition.unit) reasons.push("Units differ from each other or the AVA definition.");
  if (left.protocol !== right.protocol) reasons.push("Measurement protocols differ.");
  if (left.phase !== right.phase) reasons.push("Sprint phases differ.");
  return { comparable: reasons.length === 0, reasons: reasons.length ? reasons : ["Metric key, unit, protocol, and phase match."] };
}

