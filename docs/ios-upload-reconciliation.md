# Upload reconciliation

Reconciliation compares the persisted upload, active background URLSession task, backend
session, current account, and local file. Explicit outcomes adopt a task, persist progress,
acknowledge server completion, renew an expired session, restart a missing task, wait,
quarantine cross-account work, or fail with a classified reason.

The background session uses a stable environment-specific identifier, launch events,
file-backed upload tasks, connectivity waiting, delegate progress, and completion events.
Task IDs must be persisted by the production upload service. User force-quit prevents
background relaunch; suspension/system termination may continue discretionary OS transfer;
device restart requires later reconciliation. These behaviors are architecture, not yet
device evidence.

The current Supabase backend has no `/api/mobile/v1/uploads` resumable contract. Production
integration should use Supabase Storage's supported resumable mechanism and short-lived
authorization, not a custom chunk protocol. Until initialization/status/completion/
integrity endpoints exist, background upload cannot be staging-integrated.

