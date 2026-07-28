# Local analysis queue

The local queue uses the same Postgres `analysis_jobs` model and service-role RPCs intended
for deployment. Polling is a delivery adapter, not the source of truth. Enqueue is unique per
analysis; claims use `FOR UPDATE SKIP LOCKED`, claim tokens and leases; acknowledgement is an
explicit terminal RPC; retries and dead letters survive process restart.

Static job/worker sanity passes in this sprint. Database claim/retry integration scripts
exist, but rerunning them required an execution approval that was unavailable during this
pass; no result is claimed for that rerun.
