# Beta analytics

AVA currently derives operational counts from persisted sessions, analyses, jobs, support
requests, feedback, and deletion intake. No third-party client analytics or event pipeline was
added. The restricted dashboard reports real queue/failure/completion counts and labels missing
heartbeat evidence honestly.

Activation, guide-open, result-open, report-open, and funnel rates are not yet measured
reliably. Do not fabricate them. A future telemetry implementation must use pseudonymous IDs and
event names, never raw names, email, video, signed URLs, notes, access tokens, medical context,
or raw metrics without approved necessity and policy.

