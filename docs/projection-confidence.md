# Projection confidence policy

Projection confidence describes evidence adequacy, not the probability that a prediction
will be exactly correct.

The v1 score combines compatible history depth, measurement confidence, session quality,
biomechanical consistency, and research confidence. It then applies hard caps:

- fewer than three compatible measurements: insufficient, no numeric projection;
- no compatible benchmark: confidence cannot exceed Moderate;
- supplied but incompatible/low-confidence benchmarks: confidence is capped at Low;
- missing training age or training consistency: confidence is capped;
- inconsistent residuals: confidence is capped at Low;
- all v1 intervals: capped because their coverage has not been prospectively calibrated.

The model reports every applied cap in `projectionConfidence.limitingFactors`. Missing
variables remain explicit in `unknownVariables`; they are never filled with population
averages or hidden defaults.

The confidence interval uses observed compatible-history residuals plus a conservative
minimum spread. Its contract says `evidence_bounded_not_calibrated`: it is a scenario band,
not a validated statistical coverage promise. Prospective field validation must compare
stored projections with later compatible outcomes before stronger probability language is
allowed.

