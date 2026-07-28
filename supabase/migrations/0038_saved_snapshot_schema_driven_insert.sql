-- Insert only ordinary copied columns. Using populated_record.* supplies every
-- table column, including generated fields, even when their JSON keys are
-- absent. Build the ordinary-column list from PostgreSQL metadata so future
-- generated columns cannot break saved snapshots.
create or replace function public.save_working_analysis_snapshot(
  p_session_id uuid, p_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_source public.analyses;
  v_json jsonb;
  v_saved_id uuid;
  v_number integer;
  v_columns text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  select * into v_source from public.analyses
    where session_id=p_session_id and is_current_working for update;
  if v_source.id is null or v_source.status <> 'complete' then
    raise exception 'only a completed working analysis can be saved';
  end if;
  select coalesce(max(saved_version_number),0)+1 into v_number
    from public.analyses where session_id=p_session_id and analysis_kind='saved';
  v_json := (to_jsonb(v_source) - 'id' - 'version_number') || jsonb_build_object(
    'analysis_kind','saved', 'is_current_working',false,
    'saved_version_number',v_number, 'saved_at',now(),
    'saved_notes',nullif(left(trim(coalesce(p_notes,'')),1000),''),
    'created_at',now(), 'parent_analysis_id',v_source.id
  );
  select string_agg(quote_ident(attname), ',' order by attnum) into v_columns
    from pg_attribute
    where attrelid='public.analyses'::regclass
      and attnum>0 and not attisdropped and attgenerated=''
      and attname not in ('id','version_number');
  execute format(
    'insert into public.analyses (%1$s) select %1$s from jsonb_populate_record(null::public.analyses, $1) returning id',
    v_columns
  ) using v_json into v_saved_id;
  return v_saved_id;
end;
$$;

revoke all on function public.save_working_analysis_snapshot(uuid,text) from public;
grant execute on function public.save_working_analysis_snapshot(uuid,text) to service_role;
