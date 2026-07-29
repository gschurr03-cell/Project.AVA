import type { Observation } from "@/lib/observations";

import type { EvidenceQuality } from "./types";

export function determineEvidenceQuality(
  observations: Observation[],
  kind: "availability" | "descriptive" | "associative",
): { quality: EvidenceQuality; reasons: string[] } {
  if (!observations.length)
    return { quality: "unavailable", reasons: ["No accepted observation evidence."] };
  const direct = observations.flatMap((item) => item.evidence).filter((item) => item.directness === "direct").length;
  const experimental = observations.some((item) => item.experimental);
  if (kind === "associative") {
    return {
      quality: experimental ? "limited" : "heuristic",
      reasons: [
        "The measured pattern is real evidence, but its performance meaning is associative.",
        ...(experimental ? ["Experimental evidence limits interpretation quality."] : []),
      ],
    };
  }
  if (experimental)
    return { quality: "limited", reasons: ["The interpretation depends on experimental evidence."] };
  if (direct > 0 && observations.length > 1)
    return { quality: "strong", reasons: ["Multiple observations include direct measured evidence."] };
  if (direct > 0)
    return { quality: "moderate", reasons: ["The interpretation includes direct measured evidence."] };
  return { quality: "limited", reasons: ["Only derived or contextual evidence is available."] };
}
