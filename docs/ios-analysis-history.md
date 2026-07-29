# iOS analysis history

`AnalysisHistoryItem` preserves submission, completion and activation times, analysis type,
protocol, public status, recording quality, active manifest, report/offline availability
and action state. Pure selectors paginate and filter without changing server ordering.
The native list handles empty/offline-compatible records; live paging, deletion and deep-
link ownership resolution await `/api/mobile/v1`.

