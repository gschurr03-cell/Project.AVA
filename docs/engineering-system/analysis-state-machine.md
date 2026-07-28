# Analysis state machine

Canonical durable job states are queued, claimed, downloading, validating, processing,
generating results, uploading artifacts, completing, completed, retry scheduled, failed,
dead-lettered and cancelled.

Claims require a fresh token and lease. Progress moves forward within an attempt. Lease loss
or cancellation invalidates the token; late stage or completion writes fail. Retry scheduling
clears claim fields and retains the canonical analysis identity. Completed, failed,
dead-lettered and cancelled states are terminal except explicit authorized administrative
retry permitted by the database policy.
