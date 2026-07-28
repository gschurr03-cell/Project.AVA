# Adaptive Coaching Intelligence Engine

## Purpose

The Adaptive Coaching Engine is AVA’s deterministic longitudinal coaching orchestrator.
It selects what matters now from validated structured intelligence already produced by
the Recommendation, Priority, Research, Benchmark, Projection, Report, and Digital Twin
systems.

It is not a chatbot, language-model wrapper, recommendation generator, biomechanics
calculator, or performance predictor.

## Input boundary

The engine accepts a versioned Digital Twin, normalized coaching candidates, competition
schedule, season/training/development context, structured coach overrides, measurement
quality, research/benchmark versions, unknown variables, and processed invalidation
triggers.

Candidates must already link a recommendation, priority, monitoring plan, confidence,
safety tier, evidence, applicability, and upstream versions. Raw landmarks, pose data,
pixels, frames, temporary metrics, experimental output, chat history, and LLM summaries
have no contract path into the engine.

## Decision lifecycle

The engine classifies existing candidates as:

- primary: the highest deterministic value;
- secondary: at most one additional active improvement;
- maintenance: explicit strengths, favorable stored follow-up, or structured coach choice;
- monitoring: limited evidence, missing evidence, development mismatch, competition
  protection, or overflow beyond two active focuses;
- retired: structured coach retirement or stored future applicability marked unsupported.

Internal ranking combines upstream expected impact, confidence, compatible historical
support, priority recurrence, regression context, and a structured coach override.
Candidate ID is the final deterministic tie breaker. Internal scores are not an
athlete-facing truth.

Every focus retains evidence, historical support, confidence, template explanation,
unknown variables, monitoring plan, review time, and engine version.

## Competition and season policy

Within the centralized competition-protection window, a candidate that is not explicitly
competition-safe moves to monitoring. Existing safe candidates may remain. The engine
does not invent a taper, workout, cue, or new recommendation.

## Confidence

Coaching confidence is the weakest of Digital Twin confidence, measurement quality, and
selected-candidate confidence, reduced for unknown variables and capped when evidence is
stale. With no eligible validated focus, confidence names the gap rather than fabricating
direction.

