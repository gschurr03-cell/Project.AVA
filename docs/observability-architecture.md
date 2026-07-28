# Observability architecture

Telemetry must carry environment, release, service identity, safe correlation ID, job/
analysis/plan IDs, version and retry state. Athlete identity becomes a salted one-way
operational identifier. Tokens, cookies, URLs, paths, pain/restriction details, notes and
request bodies are redacted.

Required signals cover RED service metrics, queue depth/age, worker saturation, upload and
analysis stages, scientific confidence/missingness/drift, plan lifecycle, blocked/stale
attempts and safety-event synchronization. Worker JSON logs, health and metrics exist
locally. No collector, tracing backend, error service, dashboards or alerts is deployed.

Application helpers and the worker recursively redact nested sensitive keys and token-like
values, bound collection depth/size, and truncate strings. Automated tests cover nested
authorization, video-path and pain-description fields.
