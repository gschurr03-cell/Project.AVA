# Root Cause Intelligence audit

Audit date: 2026-07-17

## Conclusion

AVA has no Root Cause Intelligence Engine. Interpretation already emits deterministic
likely meanings, alternative explanations, evidence, limitations, phase, confidence, and
excluded conclusions. Recommendation consumes Interpretation directly and must not be
rewritten until a root-cause-aware adapter is validated against its existing rule catalog.

The production-safe architecture is:

`Interpretation + longitudinal evidence → RootCauseState → Recommendation adapter`

RCI estimates bounded hypotheses; it never promotes association to confirmed biological
causality. Relationships only exist when supplied through versioned, evidence-linked
rules or edges.

## Component audit

| Component | Exists | Readiness | Decision | Debt/dependencies |
| --- | --- | --- | --- | --- |
| Observation and Interpretation | Yes | Strong | Reuse immutable outputs | Interpretation alternatives are not causal claims. |
| Root-cause taxonomy | No | Blocking | Add extensible catalog | Initial catalog must remain non-clinical and sprint-specific. |
| Hypothesis engine | No | Blocking | Add deterministic rule evaluation | No learned causal model or free-text inference. |
| Symptom classification | No | Blocking | Add explicit relationship labels | Every interpretation needs a stored disposition. |
| Causal/dependency network | No | Blocking | Add evidence-linked DAG | Missing nodes, cycles, and unsupported edges fail closed. |
| Confidence model | Partial upstream | Blocking | Compose, never inflate | Bounded by measurement, Interpretation, Twin, evidence, and unknowns. |
| Evidence requests | Partial in Recommendation | Add separate non-recommendation contract | Must not prescribe drills or training. |
| Research/Benchmark | Yes | Good sources | Consume reviewed structured references only | They adjust confidence; they do not prove cause. |
| Digital Twin | Yes | Strong history | Read now; add event kind in a later coordinated migration | Existing timeline union has no root-cause feedback payload. |
| Coach feedback | Generic override history exists | Partial | Add RCI action contract and immutable audit | Timeline integration must be coordinated with Digital Twin schema. |
| Recommendation integration | Direct Interpretation input | Not RCI-aware | Preserve working rules; add adapter after validation | Immediate required-contract replacement would break production callers. |
| Cache/dashboard | No | Missing | Add immutable cache and feature-gated cache-only inspector | Database RPC needs staged validation. |

## Internal implementation plan

1. Add strict contracts for validated structured inputs, hypotheses, classifications,
   evidence links, competing hypotheses, confidence components, requests, trace, and state.
2. Add an extensible non-clinical taxonomy and explicit evidence-linked hypothesis rules.
3. Validate the directed causal graph and reject cycles, missing nodes, and unsupported edges.
4. Calculate deterministic hypothesis confidence bounded by weakest evidence, contradictions,
   missing evidence, unknowns, and coach action.
5. Emit multiple independent hypotheses, symptoms, consequences, and evidence requests.
6. Add immutable owner-scoped cache/invalidation/audit persistence and offline envelope.
7. Add a feature-gated cache-only dashboard, documentation, and synthetic regressions.
8. Preserve Recommendation behavior; follow with a separately validated adapter that maps
   `RootCauseState` to existing recommendation rule inputs without inventing interventions.

## Completed in this pass

- Added versioned structured input, hypothesis, causal-edge, confidence, evidence-request,
  coach-action, offline-cache, trace, and `RootCauseState` contracts.
- Added an extensible 21-key non-clinical sprint limiter taxonomy.
- Added deterministic multiple-hypothesis evaluation with separately stored confidence
  components, contradiction/missing/unknown penalties, phase checks, and coach actions.
- Added explicit symptom classifications, competing relative support, downstream
  consequences, and evidence requests that are permanently marked as non-recommendations.
- Added an evidence-linked DAG validator. Missing nodes, self-edges, and cycles fail closed.
- Added Digital Twin timeline support for immutable root-cause feedback and migration 0045
  RPCs that atomically audit feedback and append the corresponding athlete history event.
- Added immutable owner-scoped state cache, active pointer, invalidation queue, feedback
  audit, cache-only read, offline envelope, and feature-gated `/coaching/root-causes`.
- Added the four required engineering documents and synthetic deterministic coverage.

## Remaining production work

- Build and validate the explicit `RootCauseState → Recommendation` adapter. Existing
  Recommendation rules are deliberately unchanged in this pass.
- Add server orchestration that assembles reviewed candidates/edges from real structured
  Interpretation, Research, Benchmark, Projection, Digital Twin, and coach records.
- Apply migration 0045 in staging and exercise ownership, idempotency, feedback-to-timeline,
  invalidation, and cached-read RPCs against Supabase.
- Field-validate the hypothesis rule catalog, confidence weights, and evidence-request
  thresholds. Current results are relative hypotheses and never confirmed biological cause.
