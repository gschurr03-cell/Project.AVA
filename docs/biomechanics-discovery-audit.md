# Biomechanics Discovery Engine audit

Audit date: 2026-07-17

## Current state

AVA has no discovery or research engine. It does have the foundations needed for a safe
experimental implementation:

- completed analyses persist versioned explainable measurement results;
- analysis-history compatibility requires an exact production identity;
- metric values already carry availability, confidence, validation, and experimental
  state;
- sessions connect analyses to athletes;
- authentication and RLS scope server reads to the signed-in coach;
- developer diagnostics already provide a non-customer feature boundary.

The existing trend helpers are athlete-facing descriptive summaries. They are not
appropriate discovery infrastructure and must not be expanded into population research.
The Observation, Interpretation, Recommendation, Priority, and Coach Report engines must
remain downstream-product systems; discoveries may not feed them automatically.

## Production-readiness assessment

| Area | State | Decision |
| --- | --- | --- |
| Research dataset contract | Missing | Add a strict, versioned, de-identified analytical row contract. |
| Correlations | Missing | Add deterministic Pearson associations with minimum samples and conservative thresholds. |
| Clustering | Missing | Add deterministic standardized k-means for exploratory signatures only. |
| Outliers | Missing | Add standardized population-distance flags with explicit cohort context. |
| Athlete fingerprint | Missing | Add descriptive repeatability summaries, never normative advice. |
| Elite comparison | Missing | Add interfaces only; no elite data or claims. |
| Persistence | Missing | Add a versioned snapshot serialization boundary. Do not add a database table until retention, de-identification, and research-consent policy are approved. |
| UI | Missing | Add an authenticated, development-only page. |
| Statistical validation | Missing | Label every output experimental and validation-required. No scientific-truth claims. |

## Dependencies and technical debt

- The database does not contain a research-consent or cross-coach aggregation model.
- RLS prevents a coach from becoming an accidental global research administrator.
- Existing production data may have few compatible completed analyses, so empty and
  insufficient-sample states are expected.
- Phase labels are not consistently persisted per measurement.
- No validated elite reference dataset exists.
- No multiple-testing correction, causal model, preregistration workflow, or external
  replication process exists.

## Implementation plan

1. Create one versioned discovery contract and normalized dataset boundary.
2. Enforce compatibility, trusted metric availability, minimum samples, experimental
   labeling, and validation requirements centrally.
3. Implement deterministic correlation, cluster, outlier, and personal-fingerprint
   modules.
4. Add elite cohort interfaces without data.
5. Add snapshot serialization/validation without introducing premature database storage.
6. Add a development-only, authenticated, RLS-scoped `/research/discovery` page.
7. Add deterministic tests, documentation, and regression validation.

## Completed in this pass

- Added the versioned discovery, research-sample, fingerprint, elite-cohort, result, and
  persistence snapshot contracts.
- Added deterministic correlation, cluster, outlier, and personal-fingerprint modules.
- Added centralized compatibility, metric-trust, minimum-sample, experimental, and
  validation-required safety boundaries.
- Added a versioned snapshot serializer/parser while deliberately withholding database
  storage until research governance exists.
- Added the authenticated, RLS-scoped, non-production `/research/discovery` interface
  with correlations, clusters, outliers, fingerprints, timeline, warnings, and empty
  states.
- Added focused coverage for statistical modules, cluster stability, fingerprints,
  cohort separation, persistence, determinism, elite provenance, and no-advice behavior.
