# Root Cause-to-Recommendation Rollout

1. `OFF`: no mapping computation and byte-compatible baseline recommendations.
2. `SHADOW`: cache mappings, proposed modifiers, gaps, safety checks, and comparison
   records without modifying Recommendation output.
3. `ADVISORY`: attach uncertainty-safe structured context; preserve eligibility, order,
   status, warnings, text, and safety.
4. `BOUNDED_INFLUENCE`: allow approved, gated, clamped relevance metadata for already
   eligible recommendations.

Promotion requires catalog-level evidence that recommendation membership remains stable,
protected classes are never suppressed, mappings have adequate coverage, ambiguity is
low, coach agreement is acceptable, and no unsafe elevation occurs.

App open reads only the active immutable cache. Version, input, RCI, catalog, registry,
feedback, override, evidence, or context changes explicitly invalidate it.
