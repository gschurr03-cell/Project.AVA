-- Day 104 (Part 8): real, frame-throughput-based analysis progress.
--
-- Previously the UI's ETA (`src/lib/analysisProgress/model.ts`) could only
-- derive a coarse, provisional per-status-band estimate — it had no access
-- to how many frames of the CURRENT job the worker has actually processed.
-- `analysis_jobs.progress` carries the worker's latest real progress
-- snapshot (frames completed / total frames / stage / source fps /
-- resolution / when it was captured), written via the worker's EXISTING
-- heartbeat cadence (no new timer or write path) and read through the same
-- `get_analysis_job_status` RPC the progress card already polls — so a page
-- refresh recovers the real, server-authoritative estimate for free.

alter table public.analysis_jobs
  add column if not exists progress jsonb;

comment on column public.analysis_jobs.progress is
  'Day 104: latest real processing-progress snapshot from the worker, e.g. '
  '{"stage":"pass1","framesCompleted":1200,"totalFrames":2348,"sourceFps":239.48,'
  '"width":1920,"height":1080,"capturedAtMs":1234567890}. Null until the first '
  'heartbeat carrying progress data lands; never fabricated client-side.';

-- Adds an optional trailing `p_progress` parameter — dropped and recreated
-- (rather than a second overload) so callers never face an ambiguous-
-- overload error, and so the old 4-arg signature stops being independently
-- callable (it always carried the full worker-authority contract already).
drop function if exists public.heartbeat_analysis_job(uuid, uuid, text, integer);

create function public.heartbeat_analysis_job(
  p_job_id uuid, p_claim_token uuid, p_worker_id text, p_lease_seconds integer default 120,
  p_progress jsonb default null
) returns boolean language sql security definer set search_path = public as $$
  update public.analysis_jobs set heartbeat_at = now(),
    lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now(),
    progress = coalesce(p_progress, progress)
  where id = p_job_id and claim_token = p_claim_token and claimed_by = p_worker_id
    and lease_expires_at > now()
    and status in ('claimed','downloading','validating','processing','generating_results','uploading_artifacts','completing')
  returning true;
$$;

revoke all on function public.heartbeat_analysis_job(uuid,uuid,text,integer,jsonb) from public;
grant execute on function public.heartbeat_analysis_job(uuid,uuid,text,integer,jsonb) to service_role;

drop function if exists public.get_analysis_job_status(uuid);

create function public.get_analysis_job_status(p_analysis_id uuid)
returns table(status public.analysis_job_status, user_message text, attempt_count integer, updated_at timestamptz, progress jsonb)
language sql security definer set search_path = public as $$
  select j.status, j.user_message, j.attempt_count, j.updated_at, j.progress
  from public.analysis_jobs j join public.sessions s on s.id=j.session_id
  join public.athletes a on a.id=s.athlete_id
  where j.analysis_id=p_analysis_id and a.coach_id=auth.uid();
$$;

revoke all on function public.get_analysis_job_status(uuid) from public;
grant execute on function public.get_analysis_job_status(uuid) to authenticated;
