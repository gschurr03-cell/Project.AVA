-- Day 95 audit (Part 7): the worker's mid-job `sessions.status = 'analyzing'`
-- update used a raw `.from("sessions").update(...)` — `service_role` has no
-- UPDATE grant on `sessions` (the same deliberate lockdown that caused the
-- `sessions.fps` silent-write bug fixed in migration 0069), and the worker
-- never checked this call's result, so it has always failed silently. The
-- session simply never visibly moved to "analyzing" during processing.
--
-- Narrow SECURITY DEFINER RPC, scoped to exactly one column and gated on
-- proof of an active claimed job for that session (same claim_token +
-- worker_id + live-lease check `heartbeat_analysis_job`/`set_analysis_job_stage`
-- already use) — never a bare session_id, so it can't be used to touch a
-- session with no active job. service_role's table-level grants are
-- unchanged.

create or replace function public.set_session_analyzing_status(
  p_job_id uuid, p_claim_token uuid, p_worker_id text
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_session_id uuid;
begin
  select session_id into v_session_id
  from public.analysis_jobs
  where id = p_job_id and claim_token = p_claim_token and claimed_by = p_worker_id
    and lease_expires_at > now();

  if v_session_id is null then
    return false;
  end if;

  update public.sessions set status = 'analyzing' where id = v_session_id;
  return found;
end;
$$;

revoke all on function public.set_session_analyzing_status(uuid, uuid, text) from public;
grant execute on function public.set_session_analyzing_status(uuid, uuid, text) to service_role;
