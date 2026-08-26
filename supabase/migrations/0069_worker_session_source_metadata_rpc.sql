-- Fix a silent, pre-existing permission gap discovered during the FPS runtime
-- audit: `service_role` has only SELECT/DELETE on `public.sessions` (a
-- deliberate lockdown — see migrations 0058/0060). The worker's mid-processing
-- write of detected source video metadata (`sessions.fps`, `fps_classification`,
-- `fps_metadata`, `duration_s`, `width`, `height`, `codec`) uses the service
-- client and therefore has ALWAYS failed with a permission error — silently,
-- because the worker never checked that call's result. `sessions.fps` was
-- consequently never actually persisted by that code path, in any
-- classification tier, since this table was locked down.
--
-- Rather than widen the service_role grant (which would undo the deliberate
-- lockdown), add a narrow SECURITY DEFINER RPC scoped to exactly these seven
-- source-metadata columns — the same pattern already used for
-- `complete_analysis_job`/`replace_working_analysis`. The worker is updated in
-- the same change to call this RPC (and to check its result) instead of the
-- silently-failing raw table update.

create or replace function public.update_session_source_metadata(
  p_session_id uuid,
  p_fps numeric,
  p_fps_classification text,
  p_fps_metadata jsonb,
  p_duration_s numeric,
  p_width integer,
  p_height integer,
  p_codec text
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.sessions set
    fps = p_fps,
    fps_classification = p_fps_classification,
    fps_metadata = p_fps_metadata,
    duration_s = p_duration_s,
    width = p_width,
    height = p_height,
    codec = p_codec
  where id = p_session_id;
  return found;
end;
$$;

revoke all on function public.update_session_source_metadata(
  uuid, numeric, text, jsonb, numeric, integer, integer, text
) from public;
grant execute on function public.update_session_source_metadata(
  uuid, numeric, text, jsonb, numeric, integer, integer, text
) to service_role;
