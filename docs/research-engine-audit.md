# Research Knowledge Engine audit

Audit date: 2026-07-17

## Current evidence architecture

AVA has no scientific-source, claim, citation, or review database. Existing uses of the
word “evidence” describe internal measurement provenance rather than external research.

| Existing area | Evidence-related fields | Readiness and decision |
| --- | --- | --- |
| Observation Engine | structured metric evidence, confidence, availability, limitations | Keep unchanged. This proves what AVA measured, not what research supports. |
| Interpretation Engine | `evidenceQuality`, reasons, source observation IDs, alternatives, exclusions | Keep. Add optional research attachment outside the interpretation result so research cannot manufacture a cause. |
| Recommendation Engine | `interventionEvidenceQuality`, `evidenceBasis`, supporting observations, excluded claims | Partially supported. Library grades are manually assigned and have no citations. Research retrieval may explain or downgrade these labels, never upgrade athlete-finding confidence. |
| Priority Engine | expected impact, supporting evidence, recommendation links | Keep ranking unchanged. Research volume must not override athlete relevance. |
| Coach Report | metric evidence and upstream engine versions | Add optional approved evidence presentation. Saved reports must retain their original evidence snapshot. |
| Drill and cue libraries | heuristic/limited/moderate `evidenceBasis` values | No source linkage. Preserve labels and treat them as heuristic until reviewed claims exist. |
| Benchmark logic | database reference values and comparison math | Values have operational source strings but no structured study population, protocol, uncertainty, or evidence grade. Do not create new benchmark values. |
| Discovery Engine | experimental discoveries with validation requirements | Convert only to unreviewed internal-discovery proposals. Never production evidence automatically. |

## Existing claims and debt

- Recommendation library entries contain manually assigned `strong`, `moderate`,
  `limited`, `heuristic`, or `unknown` evidence bases.
- Several coaching-rule strings describe performance relationships without scientific
  citations. They remain product heuristics and must not be represented as reviewed
  research.
- Existing benchmark rows are validation references, not elite population norms.
- Interpretation and recommendation language guards already prohibit certainty,
  diagnosis, injury-risk, and guaranteed-outcome wording.
- There is no AI provider, vector database, scholarly metadata client, document parser,
  citation formatter, or licensed research-document storage bucket.
- Existing video and pose buckets are athlete-scoped and must not be reused for
  copyrighted research files.
- Saved analysis/report behavior is immutable or fails closed; research citation
  snapshots must follow the same rule.

## Authorization and persistence blockers

AVA authentication currently models coaches/owners, not research reviewers. A dedicated
reviewer membership table and RLS boundary are required. Research full text must be
private and inaccessible by default. Approval needs append-only audit events and explicit
reviewer identity.

## Selected production-safe vertical

1. Add versioned source, claim, evidence-link, citation, metric-definition, terminology,
   review, retrieval, internal-discovery, validation-study, and benchmark-foundation
   contracts.
2. Add deterministic duplicate detection, grading, applicability, consensus, citation,
   search/retrieval, language safety, and discovery-proposal services.
3. Add relational reviewer-gated persistence with RLS, version fields, soft archival, and
   append-only audit records.
4. Add a reviewer-only Research Workspace with source, claim, conflict, review, metric,
   discovery, validation, and audit inspection.
5. Integrate retrieval through optional evidence attachments. It may downgrade an
   intervention evidence label and add approved citations, but cannot create a
   recommendation or raise biomechanics confidence.
6. Add deterministic synthetic fixtures. They are explicitly non-genuine and cannot be
   written as production-approved research.

Automated DOI/PubMed fetching, PDF extraction, semantic/vector search, production approval
actions, and full-text upload are deferred until provider, copyright, malware scanning,
reviewer operations, and deployment controls are approved.

## Completed in this pass

- Added versioned source, claim, evidence-link, citation, retrieval, metric-definition,
  terminology, audit, discovery-proposal, validation-study, and benchmark-foundation
  contracts.
- Added deterministic duplicate detection, evidence grading, applicability, consensus,
  terminology normalization, metric comparability, citation formatting, search/retrieval,
  language safety, reviewer authorization, and candidate extraction boundaries.
- Added reviewer membership, source, claim, evidence-link, metric-definition,
  terminology, and append-only audit persistence with RLS.
- Added atomic claim review with stricter internal/production roles and a mandatory
  reviewed, production-approved, non-retracted supporting source.
- Added a narrow authenticated report-retrieval RPC that exposes approved summaries and
  citations but never raw text, storage paths, reviewer notes, retracted sources, or
  synthetic fixtures.
- Added the protected workspace, source detail, and claim detail routes.
- Added Recommendation, Interpretation, Discovery, and Coach Report integration
  boundaries without changing intelligence generation or priority ranking.
- Added 20 labeled synthetic scenarios and focused security/integration coverage.
