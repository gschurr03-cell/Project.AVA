# Coach Report contract

`CoachReport` is versioned by `ava-coach-report-v1` and
`ava-coach-report-template-v1`. It records the analysis/session/athlete IDs, audience,
status, generation time, every upstream engine version, trust banner, executive summary,
priorities, strengths, metric highlights, technique findings, monitoring plan, next
capture, unavailable evidence, limitations, methodology, and optional trace.

Statuses are `ready`, `limited`, `technique_only`, `timing_only`, `experimental`,
`insufficient_evidence`, `processing`, and `failed`. Metric presentation statuses are
`trusted`, `limited`, `experimental`, `withheld`, and `unavailable`.

Validation rejects cross-analysis inputs, unresolved priority-to-recommendation links,
duplicate report priorities, unsafe language, and values attached to withheld or
unavailable metrics.

