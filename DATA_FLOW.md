# Intelligence data flow

## Analysis-scoped flow

1. Validated analysis results expose measurements, provenance, quality, and limitations.
2. Observation creates structured descriptive findings.
3. Interpretation provides bounded likely meanings and alternatives.
4. Root Cause evaluates explicit evidence-linked hypotheses.
5. The shadow-first adapter maps hypotheses to existing catalog recommendations.
6. Recommendation performs its established eligibility and safety evaluation.
7. Priority ranks existing recommendations.
8. Coach Report snapshots analysis-scoped conclusions.

## Athlete-scoped longitudinal flow

1. Analysis, recommendation response, priority, benchmark, projection, season, training,
   performance, health context, coach interaction, and RCI feedback events append to the
   Digital Twin timeline.
2. Immutable Twin snapshots derive baselines, trends, memory, archetypes, confidence, and risks.
3. Optimization combines current candidates with longitudinal evidence.
4. Adaptive Coaching converts Optimization dispositions into a cached CoachingState.

## Provenance

Every boundary carries engine/source versions and stable identities. Shared provenance
metadata uses engine ID, engine version, fingerprint, source versions, and source IDs.
Engine-specific contracts retain richer domain provenance.

## Offline flow

Offline envelopes contain already-computed state. They never perform biomechanics or
intelligence evaluation. Queued user/coach actions synchronize through existing mutation
and event mechanisms, then explicitly invalidate affected server caches.

## Data minimization

Active intelligence receives only required structured data. Raw video remains in private
storage for reprocessing and is not embedded in intelligence snapshots.
