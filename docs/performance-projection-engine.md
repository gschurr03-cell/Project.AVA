# AVA Performance Projection Engine

## Purpose

The engine estimates the direction and bounded range of a directly measured athlete
metric. It answers what the current compatible evidence supports now and over explicit
horizons. It does not synthesize future race times, guarantee improvement, infer genetic
potential, predict injury, or make scholarship or selection claims.

The engine sits after Research Knowledge and the Benchmark Engine:

`compatible history → structured findings → reviewed evidence → compatible benchmarks → projection`

Raw pose landmarks are prohibited from the input contract. Inputs are immutable references
to metric history, fingerprints, observations, interpretations, recommendations,
priorities, benchmark comparisons, research confidence, and known athlete context.

## Architecture

- `contracts.ts` defines the versioned input, limiter, evidence, output, and snapshot
  contracts.
- `trajectory.ts` isolates the dominant compatibility group and performs deterministic
  least-squares trend analysis.
- `confidence.ts` applies a weakest-link policy across history, measurement confidence,
  session quality, biomechanical consistency, research confidence, benchmark
  compatibility, and missing context.
- `limiters.ts` adapts only explicit upstream findings. Missing evidence references cause
  the limiter to be withheld.
- `projection.ts` applies horizon damping, limits extrapolation relative to the observed
  history span, and returns conservative/expected/best evidence cases.
- `snapshots.ts` creates immutable versioned audit records.

## Safety behavior

Three or more compatible observations are required. Mixed protocol groups are excluded,
not averaged. Numeric output is withheld when evidence is insufficient. Career peak is
unsupported until a validated maturation model exists. Return-from-injury output is
withheld even with clearance until a validated recovery model exists; lack of clearance is
an additional hard stop.

“Peak potential” means an evidence-bounded favorable case within current observations and
model limits. It is never a statement of biological or genetic ceiling.

The development UI is restricted by both `performanceProjectionEngine` and
`projectionDeveloperUi`. Athlete-facing projections remain separately disabled.

## Persistence

`performance_projection_snapshots` stores exact input and output JSON with engine and
schema versions. Athlete ownership is enforced by RLS. There is no update policy, so a
past projection cannot silently change when the model evolves. The migration seeds no
projection or benchmark values.

