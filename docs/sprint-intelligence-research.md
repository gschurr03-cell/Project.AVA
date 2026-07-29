# Sprint Intelligence — Phase 8: Research Intelligence Engine

Every recommendation AVA makes should eventually answer **"what evidence supports
this?"** Phase 8 transforms structured literature into knowledge that **strengthens**
AVA's coaching intelligence — it never replaces reasoning, and **research never
overrides measured athlete data.**

Location: [`src/lib/intelligence/performanceGap/research/`](../src/lib/intelligence/performanceGap/research/)
(Sprint Intelligence namespace; separate from the repo's unrelated `src/lib/research/`).
Entry: `buildResearchSupport({ interventionIds, metricIds, context })`.

## Combined confidence chain

```
Measured athlete data → Biomechanical reasoning → Scientific evidence → Confidence
```

`applyResearchToConfidence(base, contribution)` nudges an `estimated`/`inferred`
confidence within [0,1] but **leaves `measured` untouched** — measured data is
authoritative.

## Engines

| Engine | File | Purpose |
|--------|------|---------|
| Knowledge base | `knowledgeBase.ts` | Structured research store + tagging keyword config (seed data; ingestion seams). |
| Tagging | `tagging.ts` | Auto-tags a paper's metrics / interventions / root causes / characteristics. |
| Population Matching | `populationMatch.ts` | Weights research by athlete similarity (sex/event/level/sample). |
| Evidence Scoring | `evidenceScore.ts` | Composite strength from quality, replication, design, recency, consistency, internal validation. |
| Consensus + Conflict | `consensus.ts` | Consensus / mixed / conflicting / limited / none + conflict flags. |
| Summarization | `consensus.ts` | Honest, non-overstated summaries. |
| Evidence Linking | `linking.ts` | Attaches weighted research + score + consensus + summary + bounded confidence contribution to a target. |

## Research objects

Each `ResearchPaper` stores title, authors, publication, year, journal, sport,
population (sex/event/level/sample/anthropometrics), study type, research quality, key
findings, limitations, supported metrics/interventions/conclusions, citation, tags, and
a per-target stance. **Ingestion seams** (`sourceVersion`, `approved`) prepare for
future PDF parsing / manual review / human approval / evidence versioning / source
tracking — no ingestion is implemented here.

> The bundled entries are **illustrative seed data** ("Seed Data" placeholders) that
> exercise the engine structure — not real citations. Future ingestion replaces them.

## Evidence scoring

A composite 0–1 score from: study quality × population match (averaged), replication
(saturating count), best study design, recency, consistency (non-conflicting weight),
and an internal-validation bonus. **Never relies on one publication** — a single paper
is capped below "high". Strength bands: high / moderate / low / insufficient.

## Population matching

Weighted similarity so a study on elite female 400 m runners does not carry identical
weight for a male collegiate 100 m sprinter. Per-factor scores (sex/event/level/sample)
are exposed for transparency.

## Consensus + conflict

Classifies the matched body as consensus / mixed / conflicting / limited / none and
flags conflicts, surfacing uncertainty rather than hiding it.

## Summaries

Honest and never overstated — e.g. *"Current evidence suggests that flying sprints are
commonly associated with improvements in maximum velocity … Most supporting studies
involve trained sprinters, though individual responses vary."* A test forbids
"proven / guaranteed / will improve / definitely".

## Confidence contribution

Bounded (±0.15): supportive consensus adds a little, mixed/limited add less, conflicting
subtracts, none contributes nothing — and it can never dominate the measured signal.

## Data models

`ResearchPaper`, `ResearchEvidence`, `EvidenceSummary`, `EvidenceScore`, `ResearchTag`,
`PopulationMatch`, `ResearchRelationship`, `ConsensusModel`, `EvidenceConflict`,
`SupportedRecommendation`.

## Relationships

`buildResearchRelationships()` links each paper to metrics / interventions / root
causes — the join to the rest of the intelligence stack (blueprints, potential,
progress, future coaching).

## Out of scope (per Phase 8 brief)

No UI, no automated PDF ingestion, no What-If Simulator.

## Tests

`npm run research-intelligence:sanity` — 23 checks: tagging, population matching,
evidence scoring (single-paper cap, insufficient case), consensus + conflict detection,
honest summaries, bounded confidence (never overriding measured data), relationships,
serialization, ingestion seams, and graceful no-evidence degradation. Phases 1–5 & 7
suites remain green.
