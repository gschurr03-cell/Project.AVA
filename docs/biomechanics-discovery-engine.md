# AVA Biomechanics Discovery Engine

## Purpose

The Biomechanics Discovery Engine is AVA's internal experimental research layer. It looks
for recurring associations and movement signatures in trusted, version-compatible
analysis results. It is not an explanation engine, recommendation engine, clinical tool,
or athlete-facing feature.

The engine is versioned as `ava-biomechanics-discovery-v1`.

## Architecture

The input adapter accepts completed, validated, non-experimental explainable analysis
results. It includes only available metric values with high or moderate confidence.
Withheld, unavailable, low-confidence, and experimental metrics cannot enter discovery.

Samples are separated by a compatibility key containing pose model, analysis pipeline,
metric schema, production compatibility group, and timing compatibility group. The
largest compatible cohort is analyzed; other cohorts are reported as excluded.

The pure engine produces:

- exploratory Pearson correlations;
- deterministic standardized two-cluster groupings;
- standardized cohort-distance outliers;
- athlete movement fingerprints from repeated compatible sessions.

Every discovery includes its ID, title, description, type, confidence, sample size,
structured evidence, metrics, athlete/session membership, statistical strength, engine
version, experimental flag, and mandatory validation status.

## Discovery methods

### Correlations

Metric pairs require at least five paired samples. Coefficients below an absolute 0.5 are
not emitted. Pearson correlation describes linear association only; the engine explicitly
does not infer causation.

### Clusters

Compatible shared metrics are standardized before deterministic k-means with two
farthest-point initial centroids. The fixed initialization, ordering, tie-breaking, and
iteration limit make outputs reproducible. Cluster names describe their most
distinguishing standardized metric and are not performance rankings.

### Outliers

Values at least two population standard deviations from the compatible cohort mean are
flagged. An outlier may reflect recording, pose, event-detection, or context differences
and requires those alternatives to be excluded before biomechanical interpretation.

### Movement fingerprints

Fingerprints require two compatible sessions for one athlete. They contain typical metric
means, variability, repeatability, a descriptive consistency score, and confidence.
Asymmetry direction remains `unknown` until a trusted persisted side-specific metric
contract exists.

## Persistence

The engine provides a strictly versioned JSON snapshot serializer and parser. Invalid or
old snapshots fail closed. No database table was added: AVA does not yet have research
consent, de-identification, retention, cross-coach aggregation, or research administrator
policies. Adding storage before those controls would create a production privacy blocker.

## Developer UI

`/research/discovery` is available only when all of the following are true:

- the runtime is not production;
- `developerDiagnostics` is enabled;
- `biomechanicsDiscovery` is enabled;
- `discoveryDeveloperUi` is enabled;
- the user is authenticated.

Database reads remain subject to Supabase RLS, so the page is not a global population
research view.

## Validation philosophy

All findings are experimental and require independent validation. Sample size and
statistical strength never become scientific truth. Before promotion, a discovery needs
compatible replication, recording-quality review, multiple-testing controls, external
research comparison, domain-expert review, and a documented validation decision.
Discoveries never automatically enter interpretations, recommendations, priorities, or
athlete reports.

## Elite reference interface

`EliteReferenceCohort` defines future provenance, consent/license, metric schema,
compatibility, cohort size, and validation fields. No elite data or elite comparison is
included in this implementation.

## Future AI extensions

Potential research-only extensions include hierarchical clustering, robust covariance,
phase-transition sequence models, uncertainty-aware mixed-effects models, preregistered
hypothesis tracking, and human-reviewed knowledge graph candidates. None should bypass
the validation boundary or directly generate athlete advice.

