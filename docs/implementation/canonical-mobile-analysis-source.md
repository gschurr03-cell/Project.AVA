# Canonical mobile analysis source

For Batch 01, `analyses` is the canonical mobile record and `analysis_jobs` is its status
detail. A result is active only when `analyses.status = complete`, both `result_payload` and
`provenance` exist, and `result_payload.analysisId` matches the row. The fingerprint covers
identity, payload, provenance and activation time.

The native API never merges legacy UI derivation, shadow manifests or direct intelligence
engine caches. Existing web behavior is untouched. Full manifest-orchestration cutover
(AVA-018/019) remains deferred until equivalence evidence exists.
