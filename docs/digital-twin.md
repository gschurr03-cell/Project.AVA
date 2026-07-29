# AVA Athlete Digital Twin

## Purpose

The Athlete Digital Twin is AVA’s versioned longitudinal intelligence object. It
aggregates immutable outputs from analyses, reports, recommendations, priorities,
benchmarks, projections, competition records, training context, and coach interactions.
It does not replace those source systems or recalculate their historical conclusions.

The twin answers what repeatedly characterizes an athlete, what changed, what remains
uncertain, and how strong the historical evidence is. It does not generate
recommendations, predict performance, diagnose health conditions, or alter biomechanics.

## Flow

`versioned upstream snapshot → append-only timeline event → deterministic aggregation → immutable twin snapshot → audited active pointer`

Every event carries athlete identity, event identity, occurrence and recording time,
source version, optional compatibility key, confidence, and a strongly typed payload.
Identical event IDs deduplicate; conflicting content under the same ID fails closed.

Persistence uses owner-scoped database functions rather than direct client inserts.
`append_athlete_timeline_event` validates athlete identity and performs an idempotent
append. `append_and_activate_athlete_digital_twin_snapshot` creates the immutable snapshot,
selects it as active, and appends its audit event in one transaction.

The twin contains identity, competition profile, performance and season history,
mechanical baselines, fingerprint, adaptations, training and reported health context,
recommendation and priority memory, benchmarks, projections, reports, trends,
archetypes, coach memory, non-clinical risk flags, unknowns, and data quality.

## Versioning and rollback

Twin snapshots are immutable and link to the previous snapshot. The active-state row is
the only mutable object. Selecting an older snapshot records the previous and selected
snapshot, actor, reason, and timestamp in an append-only audit table. Later events and
snapshots remain intact.

A deterministic major-update policy requests a snapshot for the initial twin, material
event accumulation, season or reported-health changes, a verified PB event, a new
compatible baseline, a new evidence-backed archetype, or a confidence-band change. No
snapshot is created when historical truth is unchanged.

## Integration boundary

Upstream ingestion must append only finalized, versioned results. Experimental or invalid
analyses remain in historical audit context but are excluded from mechanical baselines.
Working analysis results must not be promoted until explicitly saved or finalized.

The dashboard is `/athlete/intelligence?athleteId=…`, protected by athlete ownership and
feature flags. It exposes no synthetic production data.
