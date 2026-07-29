# Root Cause-to-Recommendation Adapter audit

Audit date: 2026-07-17

## Conclusion

Recommendation generation is deterministic and already has strong eligibility, evidence,
phase/event, feature, contraindication, safety-tier, duplicate, and conflict gates. Its
catalog is the sole content source. The safe adapter hook is after Recommendation has
created and classified its final existing outputs.

The adapter must therefore consume an immutable baseline `RecommendationResult`; it may
attach context to those recommendations and, only in an explicitly approved mode, produce
a bounded relevance proposal. It must never feed candidates back into eligibility.

Default rollout is `SHADOW`. `OFF` returns the exact baseline object. `SHADOW` computes and
caches comparisons without changing it. `ADVISORY` adds structured context only.
`BOUNDED_INFLUENCE` adds a clamped relevance modifier to already eligible outputs, but the
existing Recommendation result arrays, status, content, safety tier, contraindications,
and warnings remain authoritative.

## Component audit

| Component | Readiness | Safe integration | Risks and gaps |
| --- | --- | --- | --- |
| Recommendation input/result | Production-safe deterministic foundation | Wrap existing generation; preserve baseline result | Direct pre-eligibility RCI input could accidentally authorize content. |
| Catalog | 16 enabled static entries | Validate mapping IDs against `libraryItemId` | Catalog has no deprecation field; disabled entries are treated as unavailable. |
| Eligibility | Strong | Run before adapter | Adapter must never create candidates. |
| Ranking/deduplication | Deterministic internal order | Preserve baseline ordering in OFF/SHADOW/ADVISORY | Priority, not Recommendation, performs final coaching priority ranking. |
| Contraindications/safety | Strong | Treat all safety fields as protected | Negative influence must never suppress warnings, monitoring, review, or contraindications. |
| Explanation text | Static catalog templates | Add separate uncertainty-safe structured wording | Never rewrite catalog title, cue, drill, or prescription fields. |
| RootCauseState | Versioned and evidence-bounded | Consume immutable hypotheses/trace/requests | Competing hypotheses and shared evidence require deduplication. |
| Priority | Consumes RecommendationResult | Carry optional provenance; no rescoring in this pass | Future display adapter may expose context, but must not add weight. |
| Optimization/Adaptive | Consume normalized downstream candidates | Context only | RCI modifier must never be applied again. |
| Cache/audit | Existing immutable snapshot pattern | Add adapter-specific snapshot, active pointer, invalidation, shadow and audit | Requires staged RPC/RLS validation. |
| Feature flags | Centralized | Add enabled, rollout, dashboard, persistence, shadow metrics | Default must be SHADOW. |

## Mapping gaps and validation assumptions

- Only explicit static mappings are allowed. No string-similarity or taxonomy-order mapping.
- The initial registry covers posture, front-side organization, stride rhythm, and
  symmetry entries already present in the catalog.
- Initial mappings are `SHADOW_VALIDATED`; none is approved for bounded production
  influence. Tests use an isolated approved fixture registry.
- Relationship and modifier thresholds require catalog-level shadow/advisory field
  validation before production activation.

## Internal implementation plan

1. Add strict adapter input/output, recommendation-context, trace, shadow, offline, and
   rollout contracts.
2. Add static versioned registry, deterministic templates, and fail-closed validation
   against the existing catalog and RCI taxonomy.
3. Evaluate explicit mappings independently, deduplicate shared evidence, store confidence
   components, preserve competition/season/unknown/contradiction context, and clamp modifiers.
4. Implement OFF, SHADOW, ADVISORY, and BOUNDED_INFLUENCE without touching eligibility,
   safety, content, statuses, warnings, or baseline result membership.
5. Add an optional post-generation wrapper to Recommendation Engine. Existing
   `generateRecommendations` remains byte-compatible.
6. Add downstream provenance declaring the modifier already applied; do not change
   Priority, Optimization, or Adaptive scoring.
7. Add immutable cache, transactional activation/shadow/audit, invalidation, feature-gated
   cache-only dashboard, offline envelope, documentation, and full regression coverage.

## Completed in this pass

- Added versioned adapter input, output, per-recommendation context, mapping, confidence
  gate, decision trace, shadow comparison, and offline contracts.
- Added an explicit static registry and fail-closed catalog/taxonomy/template/bounds/status
  validator. Production entries are shadow-only.
- Added OFF, SHADOW, ADVISORY, and gated BOUNDED_INFLUENCE evaluation. Synthetic bounded
  tests use an isolated approved registry and do not alter production status.
- Added post-eligibility context attachment. Existing `generateRecommendations` behavior
  remains unchanged and the integration wrapper returns the exact baseline on failure.
- Added conservative modifier components, mapping/global clamps, competing-hypothesis
  preservation, ambiguity rejection, contradiction/unknown gates, coach feedback factors,
  and shared-evidence deduplication.
- Marked applied influence with `downstreamReapplicationAllowed: false`; Priority,
  Optimization, and Adaptive scoring remain unchanged.
- Added migration 0046 with registry governance foundation, immutable snapshots, active
  pointer, valid-trigger invalidations, shadow comparisons, transactional activation,
  audit, owner-scoped reads, and cache-only RPC.
- Added centralized feature flags with default SHADOW rollout, cache-only dashboard,
  offline envelope, five requested documents, and deterministic staged-rollout coverage.

## Remaining production work

- Accumulate and review real shadow comparisons before approving advisory mappings.
- Validate advisory context wording with coaches and athletes before enabling it.
- Do not approve bounded influence until catalog-level validation demonstrates zero
  eligibility creation, safety bypass, protected-class suppression, or unstable ordering.
- Apply migration 0046 in staging and validate RLS, registry governance, invalidation
  replay, transactional activation, and cached dashboard access.
- Add explicit first-party aggregate validation reporting once sufficient shadow volume
  exists; no third-party analytics were introduced.
