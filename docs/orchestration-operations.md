# Orchestration operations

Workers claim one dependency-ready job with a lease. Heartbeats extend only current
claims. Completion and terminal states clear claims. Expired running leases and due
deterministic retries recover in bounded 1–200-row pages using `SKIP LOCKED`; completed
and cancelled jobs remain untouched.

Vendor-neutral telemetry includes opaque scope/run/job IDs, engine/adapter versions,
timing, attempts, failure classification and cache outcome. Raw video, engine
inputs/outputs, athlete names, health data and free-form notes are excluded.

Monitor queue age, lease expiry, retry exhaustion, cache ratios, activation failures,
integrity errors and legacy/manifest mismatches. The dashboard remains authenticated,
owner-scoped, read-only and feature-gated.

Operational hardening adds shadow comparisons, replay/dead-letter histories, deterministic
health and cutover evidence. Page load reads bounded histories only. Intervention remains
a separate trusted-server concern; the dashboard exposes no mutation control.
