# AVA Athlete Progress Center

## Architecture

```text
athlete
  └─ sessions (recording date, FPS, calibration, analysis type)
       └─ completed analyses (timestamp, original metrics, version/current pointer)
            ↓
canonical analysis per session
            ↓
read-only historical timeline
  ├─ stored metric series
  ├─ derived recording/confidence/priority context
  ├─ PB / season / recent bests
  ├─ trends and evidence-backed summaries
  ├─ limiter evolution
  └─ deterministic two-analysis comparison
            ↓
responsive Progress Center dashboard
```

No new database table is introduced. Original results remain the source of truth and are not copied. The aggregation layer returns chart-ready data on each request.

## Historical dependency audit

| Data | Existing source | Availability |
|---|---|---|
| Athlete relationship | `sessions.athlete_id` | Stored |
| Session/recording dates | `sessions.recorded_at`, `created_at` | Stored |
| Analysis timestamps/history | `analyses.created_at`, `completed_at`, working/version fields | Stored |
| Peak velocity, stride length, frequency, contact, flight, pose angles | fly `analyses.metrics` | Stored when worker produced them |
| Acceleration, peak/average velocity, splits, stride summary | acceleration `analyses.metrics` | Stored |
| Personal records | athlete 60/100/200 m PB fields | Stored |
| Body profile | height, weight, leg/trochanter length, sex, DOB | Stored |
| Calibration/recording context | session FPS and calibration fields | Stored |
| Trusted session overlay measurements | calculated live from pose artifacts | Not historically persisted |
| Asymmetry | analyzer/intermediate intelligence output | Not consistently persisted |
| Recording Quality | calculated live from frames | Not persisted; metadata-only historical proxy is labeled derived |
| Measurement Confidence | calculated live | Recomputed deterministically from available historical evidence and labeled derived |
| Sprint Intelligence finding | calculated live | Reconstructed only from stored, threshold-supported metrics and labeled derived |

Unavailable metrics remain absent. The engine does not substitute zeros.

## Canonical history policy

Exactly one completed analysis contributes per session. A current-working analysis wins; otherwise the newest completed analysis wins. Saved reruns therefore do not duplicate a session in charts.

Stored metric values are copied into the in-memory timeline without recalculation. Every timeline value records `source: stored | derived`.

## Trend and PB policy

- Series are ordered oldest to newest.
- Changes below 1% are stable.
- Direction respects whether higher or lower is better.
- Personal best uses all comparable points.
- Season best uses January 1 through the supplied current date.
- Recent best uses the previous 30 days.
- A trend requires at least two comparable points.
- Insights are templated directly from the metric label, percentage change, direction, and measured session count.

## Charts and comparison

Charts use the same timeline values shown by comparisons. The client offers 30-day, 90-day, and all-time filters, a visible-session zoom control, native hover values, metric switching, responsive horizontal overflow, and SVG rendering without a chart dependency.

Comparison mode accepts any two canonical analyses and reports improved, unchanged, or declined using the same 1% band and metric direction metadata. It also compares limiter state, confidence, and recording-quality context.

## Scalability and performance

Aggregation is linear in completed analyses plus metric families: `O(analyses × metrics)`. Current implementation makes two RLS-scoped reads—sessions and completed analyses—then performs pure in-memory work. No per-session network waterfall, writes, frame loading, or pose computation occurs. For club-scale usage, the same engine can consume a paginated/server-cached dataset or database view without changing its contract.

## Extension points

- Persist a versioned trusted-metric snapshot when an analysis completes.
- Persist exact recording-quality evidence and confidence contracts.
- Add environment/competition conditions to session metadata.
- Add compatible-protocol grouping before cross-protocol comparison.
- Add club/team aggregation using the same athlete report contract.

