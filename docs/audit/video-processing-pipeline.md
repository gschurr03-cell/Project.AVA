# Video processing pipeline audit

| Stage | Implementation | Readiness |
| --- | --- | --- |
| Probe | ffprobe average/nominal/real rate, timestamps, frame/duration metadata | Implemented |
| FPS policy | Central 60-class classification and high-speed normalization | Sanity tested |
| Job claim | Postgres leases, heartbeat, retries, failure/dead-letter state | Production-shaped |
| Decode/pose | Python OpenCV/MediaPipe heavy model | Local implementation; hosting/device corpus unproved |
| Athlete/ROI | ROI tracking/dynamic crop and multi-person safeguards | Engineering fixtures only |
| Calibration/gates | manual/world/independent gate tooling and provenance | Mixed validated/experimental |
| Events/metrics | contacts, steps, timing and kinematic derivation | Fixture tested, validation-limited |
| Artifacts | private pose artifact storage and signed reads | Lifecycle gaps |
| Completion | atomic RPC with provenance/activation | Strong foundation |

No synthetic frames are generated. Nominal 59.94-class footage retains real timing;
120/240 sources are deterministically sampled to the 60 Hz analysis timeline with source
indices/timestamps. Below-class footage fails closed and must create no production metrics.

P0 evidence gap: no representative, consented, locked 60/120/240 FPS golden corpus has been
run through the deployed image with independent references.
