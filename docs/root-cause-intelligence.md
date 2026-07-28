# Root Cause Intelligence Engine

RCI is a deterministic evidence-synthesis layer between Interpretation and the future
root-cause-aware Recommendation adapter. It retains multiple possible explanations and
never labels an association as proven biological causality.

Inputs are validated Interpretation results, Digital Twin history, explicit hypothesis
candidates, reviewed research/benchmark references, phase context, measurement quality,
and structured coach actions. Raw pose, frames, pixels, video, experimental metrics,
chat, and generated prose are prohibited by contract.

Each immutable `RootCauseState` stores hypotheses, symptoms, consequences, causal edges,
relative competing support, confidence components, unknowns, evidence requests, coach
audit, trace, versions, and invalidation provenance. Same input and engine version produce
the same state and fingerprint with zero external model calls.

App open reads the active cache only. The state is offline-portable; feedback can be
queued for later authenticated synchronization.
