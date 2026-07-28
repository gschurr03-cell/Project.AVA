# Root Cause-to-Recommendation Safety

Recommendation Engine eligibility and safety are authoritative. The adapter never
activates absent or suppressed recommendations and never changes safety tier, warnings,
contraindications, stop conditions, catalog text, cue text, or drill selection.

Recording actions, evidence collection, monitoring, coach/medical review, warnings,
contraindications, and risk flags are protected. Negative context cannot suppress them.
Uncertainty and missing mappings produce zero applied influence.

Approved wording uses “may be related to,” “is consistent with,” “could be influenced
by,” and similar uncertainty-preserving templates. “Caused by,” “proves,” “definitely,”
“guarantees,” and “will fix” are prohibited.

Invalid state, mapping, taxonomy, catalog, confidence, or runtime input fails closed to
the baseline Recommendation result with no partial changes.
