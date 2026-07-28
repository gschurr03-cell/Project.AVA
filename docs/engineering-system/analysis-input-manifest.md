# Analysis input manifest

The worker input snapshot is server-derived and versioned. It binds analysis, session,
athlete and upload identities; private object reference; expected size/type/checksum;
recording metadata and source FPS classification; analysis mode; 60 FPS target; pipeline,
model, metric and configuration versions; calibration/eligibility inputs; and submission
timestamps.

Ownership and object references cannot be supplied by the worker or mobile client. Logs use
analysis/job/manifest identifiers, never signed URLs or unrestricted media paths.
