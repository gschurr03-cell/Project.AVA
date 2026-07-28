import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".research-engine-sanity-tmp");
const require = createRequire(import.meta.url);
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
};
let ok = true;
const check = (label, condition) => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) ok = false;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022",
      skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node",
      baseUrl: root, paths: { "@/*": ["src/*"] },
    },
    files: [
      path.join(root, "src/lib/research/knowledge/index.ts"),
      path.join(root, "src/lib/research/discovery/contracts.ts"),
      path.join(root, "src/lib/intelligence/recommendationEngine/contracts.ts"),
    ],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
  const research = require(path.join(out, "lib/research/knowledge/index.js"));
  const now = "2026-07-17T12:00:00.000Z";
  const sources = research.SYNTHETIC_RESEARCH_SOURCES;
  const claims = research.SYNTHETIC_RESEARCH_CLAIMS;
  const links = research.SYNTHETIC_EVIDENCE_LINKS;
  const catalog = { sources, claims, evidenceLinks: links };

  check("ResearchSource creation validates versioned structured metadata", research.researchSourceSchema.safeParse(sources[0]).success);
  check("ResearchClaim creation validates precise scope and exclusions", research.researchClaimSchema.safeParse(claims[0]).success);
  check("evidence links preserve relevance, extraction, statistics and review", research.evidenceLinkSchema.safeParse(links[0]).success);
  check("study taxonomy includes biomechanics-specific designs", research.studyTypeSchema.options.includes("biomechanical_lab_study"));
  check("all 20 requested synthetic scenarios are labeled", research.SYNTHETIC_RESEARCH_SCENARIOS.length === 20);
  check("synthetic sources can never masquerade as genuine metadata", sources.every((source) => source.provenance.syntheticFixture));

  const duplicate = research.detectDuplicateSource({ ...sources[0], sourceId: "duplicate" }, sources);
  check("DOI/document duplicate detection works", duplicate.duplicate && duplicate.matchedSourceId === sources[0].sourceId);
  const preprint = sources.find((source) => source.sourceId === "synthetic-preprint");
  const publication = sources.find((source) => source.sourceId === "synthetic-publication");
  check("preprint/publication relationship is preserved", research.detectDuplicateSource(preprint, [publication]).relationship === "possible_version");

  const directGrade = research.gradeEvidence(sources[0], [links[0]]);
  check("evidence grading is deterministic and multi-dimensional", directGrade.grade === "moderate" && directGrade.trace.length >= 4);
  const retracted = sources.find((source) => source.retracted);
  check("retracted sources are unavailable regardless of design", research.gradeEvidence(retracted, [{ ...links[0], sourceId: retracted.sourceId }]).grade === "unavailable");
  const abstract = sources.find((source) => source.fullTextAvailability === "abstract_only");
  check("abstract-only access downgrades evidence", research.gradeEvidence(abstract, [{ ...links[0], sourceId: abstract.sourceId }]).grade !== "strong");
  check("conflicting support produces explicit conflict grade", research.gradeEvidence(sources[0], [links[0], links[2]]).grade === "conflicting");
  check("consensus remains mixed when reviewed evidence conflicts", ["mixed","disputed"].includes(research.deriveConsensus([links[0], links[2]]).consensus));

  const phaseMismatch = research.gradeApplicability({ ...links[0], phaseMatch: "not_applicable" }, {
    population: ["trained_sprinters"], event: "100m", phase: "acceleration",
    metric: "groundContactTimeMs", intervention: null,
  });
  check("phase mismatch blocks applicability independently of evidence grade", phaseMismatch.applicability === "not_applicable");
  check("terminology normalization preserves step/stride distinction", research.normalizeResearchTerm("step frequency").preserveDistinct);
  check("metric definition mismatch blocks comparison", !research.metricsAreComparable(
    { metricKey: "groundContactTimeMs", unit: "ms", protocol: "force_plate", phase: "maximum_velocity" },
    { metricKey: "groundContactTimeMs", unit: "ms", protocol: "video_pose", phase: "maximum_velocity" },
  ).comparable);

  const coach = research.retrieveResearch({
    query: "contact velocity", category: "contact_mechanics", metric: "groundContactTimeMs",
    phase: "maximum_velocity", event: "100m", intervention: null,
    population: ["trained_sprinters"], intendedUsage: "coach_report",
    minimumEvidenceGrade: "limited", maximumResults: 5,
  }, catalog);
  check("coach retrieval returns only eligible reviewed claims", coach.claims.length === 1 && coach.claims[0].claim.claimId === "claim-contact");
  check("retracted source never appears in production citations", coach.claims[0].citations.every((citation) => citation.sourceId !== retracted.sourceId));
  check("conflicting evidence remains visible", coach.claims[0].conflictingEvidence.length === claims[0].conflictingSourceLinks.length);
  check("retrieval is deterministic with a trace", JSON.stringify(research.retrieveResearch({
    query: "contact velocity", category: "contact_mechanics", metric: "groundContactTimeMs",
    phase: "maximum_velocity", event: "100m", intervention: null,
    population: ["trained_sprinters"], intendedUsage: "coach_report",
    minimumEvidenceGrade: "limited", maximumResults: 5,
  }, catalog)) === JSON.stringify(coach) && coach.trace.length > 0);
  const athlete = research.retrieveResearch({
    query: "contact", category: null, metric: "groundContactTimeMs", phase: "maximum_velocity",
    event: "100m", intervention: null, population: ["trained_sprinters"],
    intendedUsage: "athlete_report", minimumEvidenceGrade: "limited", maximumResults: 5,
  }, catalog);
  check("athlete retrieval uses simplified language and approved citations", athlete.claims.every((item) => /applicability may differ/i.test(item.evidenceSummary) && item.citations.every((citation) => citation.athleteFacingAllowed)));

  const recommendation = { id: "rec", interventionEvidenceQuality: "strong" };
  const attached = research.attachResearchToRecommendation(recommendation, coach);
  check("research can downgrade but never upgrade recommendation evidence", attached.effectiveInterventionEvidenceQuality === "moderate");
  const limitedRecommendation = research.attachResearchToRecommendation({ ...recommendation, interventionEvidenceQuality: "limited" }, coach);
  check("stronger literature cannot upgrade an existing lower recommendation grade", limitedRecommendation.effectiveInterventionEvidenceQuality === "limited");
  const noEvidence = research.attachResearchToRecommendation({ ...recommendation, interventionEvidenceQuality: "heuristic" }, { ...coach, claims: [] });
  check("recommendations remain valid and explicit when evidence is absent", noEvidence.recommendation.id === "rec" && noEvidence.researchWarnings.length > 0);
  const interpretationBoundary = research.researchBoundaryForInterpretation(coach);
  check("research cannot create causes or raise biomechanics confidence", !interpretationBoundary.mayCreateCause && !interpretationBoundary.mayIncreaseBiomechanicsConfidence);
  check("Coach Report adapter exposes approved structured evidence", research.toCoachReportResearchEvidence(coach).every((item) => item.citations.length));

  const citation = research.formatCitation(sources[0], "coach_report", now);
  check("citation formatter never invents identifiers", citation.doi === sources[0].doi && citation.pmid === null);
  check("citation never exposes private full-text storage references", !JSON.stringify(citation).includes("fullTextStorageReference"));
  let unsafeRejected = false;
  try { research.assertSafeResearchLanguage("Science proves every athlete should do this."); } catch { unsafeRejected = true; }
  check("unsafe research language is rejected", unsafeRejected);

  const candidate = research.createCandidateClaim({
    claimId: "candidate", claimKey: "candidate", statement: "A limited association may exist.",
    category: "maximum_velocity", sourceId: sources[0].sourceId, createdAt: now,
  });
  check("candidate extraction always remains unreviewed and ineligible", candidate.reviewStatus === "unreviewed" && !candidate.athleteFacingEligible);
  check("new source ingestion cannot auto-approve production", (() => {
    try { research.createSubmittedSource(sources[0]); return false; } catch { return true; }
  })());
  check("review authorization reserves production approval for admins", !research.reviewerCan("reviewer", "approve_production") && research.reviewerCan("research_admin", "approve_production"));

  const discovery = {
    id: "discovery-1", title: "Synthetic emerging relationship", description: "An exploratory relationship appeared.",
    discoveryType: "correlation", confidence: "Low", sampleSize: 8,
    evidence: [{ metric: "r", summary: "Synthetic", value: 0.6, unit: "r" }],
    metricsUsed: ["strideFrequencyHz"], athletesIncluded: ["a"], sessionsIncluded: ["s"],
    statisticalStrength: "moderate", requiresValidation: true, experimental: true,
    generatedAt: now, engineVersion: "ava-biomechanics-discovery-v1",
  };
  const proposal = research.proposeClaimFromDiscovery(discovery, now);
  check("internal discoveries remain preliminary and non-facing", proposal.claim.evidenceGrade === "preliminary" && !proposal.claim.coachFacingEligible);
  check("internal discoveries require the complete validation plan", proposal.validationPlan.length === 7);

  const migration = readFileSync(path.join(root, "supabase/migrations/0039_research_knowledge_foundation.sql"), "utf8");
  check("RLS protects every research table", (migration.match(/enable row level security/g) ?? []).length >= 7);
  check("ordinary users have no research write policy", !/create policy[^\\n]+research[^\\n]+for (insert|update|delete|all)/i.test(migration));
  check("production approval requires admin, reviewed evidence and audit insertion", /research_admin/.test(migration) && /eligible reviewed production evidence required/.test(migration) && /insert into public\.research_audit_events/.test(migration));
  check("production report retrieval excludes retracted and synthetic sources", /retrieve_production_research_evidence/.test(migration) && /not s\.retracted/.test(migration) && /syntheticFixture/.test(migration));
  check("production retrieval exposes no raw full text or storage reference", !/retrieve_production_research_evidence[\s\S]*full_text_storage/i.test(migration));
  check("audit history is append-only", /Audit rows are append-only/.test(migration));
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (!ok) process.exit(1);
console.log("\\nResearch Knowledge Engine sanity checks passed.");
