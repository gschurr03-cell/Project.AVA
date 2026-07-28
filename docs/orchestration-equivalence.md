# Output equivalence

Policy version `orchestration-equivalence-v1` supports exact recursive comparison,
fingerprints, unordered collections, ignored operational metadata, optional paths,
timestamp exclusion and explicitly justified path-specific numeric tolerances. Exact is
the default; numeric tolerance is never global.

Severities are identical, operational-only, acceptable normalization, non-user-visible,
low/material user-visible, contract incompatibility and comparison impossible. Tests
cover exact normalized equality, ignored timestamps, unordered collections, a declared
0.001 serialization tolerance, material mismatch, contract mismatch and missing baseline.
Domain outputs are not rewritten to make comparisons pass.

