import {
  CITATION_FORMATTER_VERSION, citationSchema,
  type ResearchCitation, type ResearchSource,
} from "./contracts";

export function formatCitation(
  source: ResearchSource,
  usageContext: ResearchCitation["usageContext"],
  generatedAt: string,
  pageReferences: string[] = [],
): ResearchCitation {
  const author = source.authors.length
    ? `${source.authors[0]}${source.authors.length > 1 ? " et al." : ""}` : "Unknown author";
  const year = source.publicationYear?.toString() ?? "n.d.";
  const publication = source.publication ? ` ${source.publication}.` : "";
  const productionApproved = source.reviewStatus === "approved_production" && !source.retracted;
  return citationSchema.parse({
    citationId: `citation:${source.sourceId}:${usageContext}`,
    sourceId: source.sourceId,
    formattedCitation: `${source.authors.join(", ") || "Unknown author"} (${year}). ${source.title}.${publication}`.replace(/\.\./g, "."),
    shortCitation: `${author}, ${year}`,
    doi: source.doi, pmid: source.pmid,
    // Never expose a private storage reference. Only the reviewed external URL is eligible.
    url: source.url, accessStatus: source.accessStatus,
    athleteFacingAllowed: productionApproved && source.accessStatus !== "restricted",
    coachFacingAllowed: productionApproved,
    pageReferences, usageContext, generatedAt,
    formatterVersion: CITATION_FORMATTER_VERSION,
  });
}

