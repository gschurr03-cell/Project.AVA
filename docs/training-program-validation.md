# Training program validation

Validation returns version, status, errors, warnings, review items and evidence requests.
V1 checks approved catalog IDs/versions, seven-day structure, duration, competition
protection, maximum high-intensity days, maximum-velocity recovery and prior adverse
response review. Blocking errors prevent a snapshot.

Candidate selection is bounded and deterministic: it selects the earliest available
competition-safe days satisfying separation, preserves upstream objective allocation,
uses compatible catalog templates, then validates. Rejected structures fail with reasons;
no combinatorial unbounded search is used.

