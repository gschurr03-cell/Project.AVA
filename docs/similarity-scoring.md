# Similarity scoring

Similarity first applies hard filters for sex population, event, and sprint phase.
Disqualified datasets receive an unavailable result and cannot win through other factors.

Eligible populations use transparent categorical/range matching:

- sex and event: 20 points each;
- phase: 15;
- competition level: 10;
- age and performance range: 8 each;
- height and weight: 5 each;
- training age: 4;
- surface: 3;
- environment: 2.

The score is the matched known weight divided by total known weight. Missing optional
fields reduce confidence rather than count as a match or mismatch. Every factor and
weight appears in the trace. Ties resolve by stable dataset ID.

Fingerprint similarity uses standardized mean differences across shared compatible
metrics. It returns similarity, shared characteristics, major differences, confidence,
and warnings—not performance equivalence or training advice.

