# Mobile observability

Every API response carries `x-request-id` and envelope request ID. JSON logs contain service,
request ID, code/result and retryability. Swift sends request IDs/API version and its logger
filters token/password/video/name/notes/report/signed/upload URL keys case-insensitively.

The same request ID can correlate upload initiation/completion, analysis creation/status,
result and deletion. Job/worker IDs remain in existing worker logs. A deployed telemetry
sink, dashboard and alerts are blocked by the absent staging observability project; alert
rules remain those defined in the production operations documents and are not marked tested.
