# Sprint 06 local analysis integration

Evidence classification: deterministic local component integration, not one live end-to-end
database/storage/MediaPipe run.

Passing local gates cover analysis derivation, nullable metric mapping, result foundation,
60 FPS normalization, durable job SQL/worker wiring, orchestration integration/rollback and
an eight-worker/500-job in-memory load simulation with zero duplicate claims. Worker
configuration compiles the analysis pipeline and locates the packaged MediaPipe model.

The repository also contains database integration scripts for atomic claim/heartbeat,
stale-token rejection, retry, dead-letter and duplicate completion. Their rerun was blocked
when the required execution approval was unavailable. Therefore this sprint does not claim
the full upload → database → storage → real pipeline → result lifecycle requested by the
ideal harness.
