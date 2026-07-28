# Root Cause-to-Recommendation Mapping Registry

Mappings explicitly connect one RCI limiter key to one existing recommendation
`libraryItemId`. No name matching, embeddings, generated text, or taxonomy-order inference
is allowed.

Validation checks contract shape, unique IDs, active taxonomy keys, enabled catalog
entries, modifier bounds, templates, lifecycle status, rollout permissions, and review
metadata. Invalid registries disable influence and preserve baseline behavior.

Initial mappings are static and `SHADOW_VALIDATED`. Production bounded influence requires
an independently reviewed version with `BOUNDED_INFLUENCE_APPROVED` entries and explicit
bounded-mode permission. Registry client mutation is intentionally unavailable.

Shared evidence is deduplicated by mapping, recommendation, and evidence identity.
Multiple hypotheses remain separate in trace and context; their aggregate modifier is
clamped once to the global bound.
