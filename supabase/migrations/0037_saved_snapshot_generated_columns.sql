-- Saved snapshots copy source JSON into a new analyses row. Generated columns
-- must be omitted so PostgreSQL derives them from experimental_result.
create or replace function public.save_working_analysis_snapshot(
  p_session_id uuid, p_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_source public.analyses; v_json jsonb; v_saved_id uuid; v_number integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  select * into v_source from public.analyses
    where session_id=p_session_id and is_current_working for update;
  if v_source.id is null or v_source.status <> 'complete' then
    raise exception 'only a completed working analysis can be saved';
  end if;
  select coalesce(max(saved_version_number),0)+1 into v_number
    from public.analyses where session_id=p_session_id and analysis_kind='saved';
  v_json := (
    to_jsonb(v_source)
    - 'id' - 'version_number'
    - 'experimental_raw_fly_time_seconds'
    - 'experimental_reported_fly_time_seconds'
    - 'experimental_timing_uncertainty_seconds'
    - 'experimental_timing_result_hash'
  ) || jsonb_build_object(
    'analysis_kind','saved', 'is_current_working',false,
    'saved_version_number',v_number, 'saved_at',now(),
    'saved_notes',nullif(left(trim(coalesce(p_notes,'')),1000),''),
    'created_at',now(), 'parent_analysis_id',v_source.id
  );
  insert into public.analyses
    select (jsonb_populate_record(null::public.analyses, v_json)).*
    returning id into v_saved_id;
  return v_saved_id;
end;
$$;

revoke all on function public.save_working_analysis_snapshot(uuid,text) from public;
grant execute on function public.save_working_analysis_snapshot(uuid,text) to service_role;
