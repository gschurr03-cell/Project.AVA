# Analysis lifecycle

AVA accepts analysis only from an authenticated, owned, canonically completed upload.
Submission is idempotent per authenticated user and creates or recovers one analysis and one
durable job. The database job is authoritative; in-memory polling is only a worker delivery
mechanism.

Workers claim through a service-role RPC with worker identity, unique claim token and lease.
They heartbeat, validate the immutable input snapshot, retrieve only the server-controlled
object, execute the explicit MediaPipe-backed 60 FPS pipeline, persist versioned
results/artifacts, and complete through a token/lease-checked atomic RPC. Failures are
classified, bounded and either rescheduled, failed or dead-lettered. Cancellation and stale
claims cannot become successful terminal writes.
