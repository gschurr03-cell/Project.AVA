# Native analysis and result flow

The Swift client has typed analysis submission/status/result/deletion services and safe
result/manifest models. Status values are queued, validating, processing,
awaiting-activation, completed, failed, unsupported and deletion-pending. Polling must be
bounded by server retry hints and restored analysis ID.

The result displays only server-allowlisted metrics plus unavailable fields, confidence,
recording quality, safe summary, limitations and a nonsecret fingerprint. Full coach report
and training UI are outside Batch 01.
