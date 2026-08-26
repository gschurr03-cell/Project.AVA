-- Phase 7.2B: one database-owned projection from analysis_jobs.status to the
-- parent analysis/session states. Queue transitions are already the lease and
-- lifecycle authority; parent rows must never be updated by a second worker-side
-- path or left behind on terminal/recovery transitions.
create or replace function public.sync_analysis_job_parent_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('queued', 'retry_scheduled') then
    update public.analyses set status = 'queued', error = null
      where id = new.analysis_id and status <> 'complete';
    update public.sessions set status = 'queued'
      where id = new.session_id and status <> 'complete';
  elsif new.status in (
    'claimed', 'downloading', 'validating', 'processing',
    'generating_results', 'uploading_artifacts', 'completing'
  ) then
    update public.analyses set status = 'running'
      where id = new.analysis_id and status <> 'complete';
    update public.sessions set status = 'analyzing'
      where id = new.session_id and status <> 'complete';
  elsif new.status = 'completed' then
    update public.analyses set status = 'complete'
      where id = new.analysis_id;
    update public.sessions set status = 'complete'
      where id = new.session_id;
  elsif new.status in ('failed', 'dead_lettered') then
    update public.analyses set status = 'failed'
      where id = new.analysis_id and status <> 'complete';
    update public.sessions set status = 'failed'
      where id = new.session_id and status <> 'complete';
  end if;
  return new;
end;
$$;

-- Existing trigger `analysis_jobs_sync_parent` continues to call this function.
-- `cancelled` remains deliberately owned by the explicit cancel/reset RPC because
-- cancellation can mean either a user-visible failure or a working-analysis reset.

-- Phase 7.2's temporary worker-side parent writer is now redundant and would
-- leave two callable authorities for the same state. No production caller remains.
drop function if exists public.set_session_analyzing_status(uuid, uuid, text);
