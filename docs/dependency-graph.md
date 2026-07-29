# Performance Dependency Graph

Dependencies are directed, evidence-linked edges from prerequisite focus to unlocked
focus. Candidate identities must exist in the same optimization input. Self-edges,
cycles, and missing nodes fail closed.

Only submitted edges affect a score. AVA never infers a causal dependency from category
names or generic biomechanics knowledge. Selected downstream focuses expose required
prerequisites and whether each prerequisite is also selected.

Interactions are separate directed edges with positive, negative, neutral, or unknown
effect. Neutral and unknown contribute no score. Positive and negative effects are
bounded by the centralized policy.
