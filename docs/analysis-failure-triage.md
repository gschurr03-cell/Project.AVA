# Analysis failure triage

Triage by sanitized category: upload incomplete, unsupported/invalid video, download failure,
calibration or timing-zone invalid, tracking failure, insufficient valid steps, metric or
intelligence generation failure, artifact upload failure, worker timeout/termination, database,
storage, or unknown.

Recording/input failures usually require recording guidance, replacement footage, or Timing
Workspace correction. Retry infrastructure failures only when retry eligibility is explicit.
Preserve the prior attempt, its calibration/timing revision, failure category, stage, worker
version, and timestamps. Never reset a database status manually and never expose raw exceptions
to users. Escalate repeated same-version failures as an incident.

