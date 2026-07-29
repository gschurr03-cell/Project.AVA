# Technical-debt schedule

- Before continued development: reproducible commits, canonical test commands, schema/type
  drift and release flag controls.
- Before closed beta: callback/RPC ambiguity, legacy/manifest equivalence, immutable report
  reads, zero placeholders, storage cleanup, mobile API/device connection and script evidence
  taxonomy.
- Before App Store: placeholder bundle/signing, native crash/accessibility/device evidence,
  CSP and operational deletion.
- Postlaunch-safe: session-page decomposition, artifact rendering optimization, broad
  benchmark expansion and cosmetic workspace cleanup.
- Remove only after migration/telemetry: legacy callback/reads, duplicate coaching rules,
  experimental production reachability, mock defaults and RTMPose production dependencies.

Broad refactors do not enter the critical path unless they reduce an immediate release risk.
