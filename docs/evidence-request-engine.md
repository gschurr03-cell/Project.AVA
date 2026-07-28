# Root Cause Evidence Request Engine

Low-confidence hypotheses emit structured evidence requests, not training
recommendations. Supported request types are additional fly sprint, acceleration trial,
side-view recording, higher-FPS recording, repeated session, coach review, manual tagging,
and benchmark comparison.

Every request identifies the hypothesis, missing evidence, unknowns it may resolve, and
priority. Requests never prescribe drills, volume, lifting, or sprint sessions and carry
`isRecommendation: false`.
