import type { ResearchSource } from "./contracts";

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const normalizedDoi = (value: string | null) =>
  value?.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "").trim() ?? null;

export interface DuplicateDecision {
  duplicate: boolean;
  matchedSourceId: string | null;
  reasons: string[];
  relationship: "same_source" | "possible_version" | "none";
}

export function detectDuplicateSource(candidate: ResearchSource, existing: ResearchSource[]): DuplicateDecision {
  for (const source of existing) {
    const reasons: string[] = [];
    if (candidate.doi && normalizedDoi(candidate.doi) === normalizedDoi(source.doi)) reasons.push("Matching DOI.");
    if (candidate.pmid && candidate.pmid === source.pmid) reasons.push("Matching PMID.");
    if (candidate.provenance.documentHash && candidate.provenance.documentHash === source.provenance.documentHash)
      reasons.push("Matching document hash.");
    if (Object.entries(candidate.externalIdentifiers).some(([key, value]) => source.externalIdentifiers[key] === value))
      reasons.push("Matching external identifier.");
    if (reasons.length) return { duplicate: true, matchedSourceId: source.sourceId, reasons, relationship: "same_source" };
    const titleMatch = normalize(candidate.title) === normalize(source.title);
    const authorOverlap = candidate.authors.some((author) => source.authors.map(normalize).includes(normalize(author)));
    if (titleMatch && candidate.sourceType === "preprint" !== (source.sourceType === "preprint"))
      return {
        duplicate: false, matchedSourceId: source.sourceId,
        reasons: ["Possible preprint and published-version relationship."], relationship: "possible_version",
      };
    if (titleMatch && authorOverlap && candidate.publicationYear === source.publicationYear)
      return {
        duplicate: true, matchedSourceId: source.sourceId,
        reasons: ["Normalized title, author, and publication year match."], relationship: "same_source",
      };
  }
  return { duplicate: false, matchedSourceId: null, reasons: ["No stable identifier or bibliographic match."], relationship: "none" };
}
