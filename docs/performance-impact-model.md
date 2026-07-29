# Performance Impact Model

Version `ava-performance-impact-v1` calculates a normalized relative impact score. It is
not a predicted time improvement.

The separately stored weighted components are race-performance influence, potential
improvement, phase and event transfer, historical effectiveness, adherence, candidate
confidence, evidence quality, research support, measurement quality, Digital Twin
maturity, projection confidence, benchmark evidence, and benchmark similarity.

Central policy weights sum to one. The score is then modified by success probability and
athlete specificity, persistence, maintenance cost, diminishing returns, adaptation
profile, explicit dependencies, explicit interactions, season, competition timing,
declared unknowns, confidence, and structured coach overrides. Every modifier stores its
multiplier, score contribution, reason, and source identities.

Expected performance gain is a conservative normalized interval and qualitative class.
`calibratedToRaceTime` is permanently false in this version.
