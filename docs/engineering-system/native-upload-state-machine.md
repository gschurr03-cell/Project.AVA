# Native upload state machine

The canonical persisted states remain queued, preparing, waiting for connectivity, uploading,
paused, verifying, uploaded, submission pending, complete, recoverable failure, terminal
failure and cancelled. Analysis submission is outside Sprint 05.

Progress is separate, byte-based, monotonic and scoped to one attempt identifier. Late
callbacks after cancellation or a replacement attempt are rejected. Storage transfer
success transitions only to verification; only server confirmation may establish uploaded
or complete state.

One selected file owns one stable idempotency key for initiation and completion retries.
Selecting a different file creates a new logical attempt. Relaunch recovery reconciles
persisted local state, the OS background task and canonical server state before restarting.
