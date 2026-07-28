-- Permanent session workspace: the session owns media; analyses are immutable versions.
alter table public.sessions
  add column if not exists timing_mode text not null default 'fly',
  add column if not exists timing_direction text not null default 'auto',
  add column if not exists timing_body_reference text not null default 'torso',
  add column if not exists timing_splits jsonb not null default '[]'::jsonb;
alter table public.sessions add constraint sessions_timing_mode_valid
  check (timing_mode in ('fly','split','custom'));
alter table public.sessions add constraint sessions_timing_direction_valid
  check (timing_direction in ('auto','left_to_right','right_to_left'));
alter table public.sessions add constraint sessions_timing_body_reference_valid
  check (timing_body_reference in ('torso','hips','head'));
alter table public.analyses
  add column if not exists version_number integer,
  add column if not exists parent_analysis_id uuid references public.analyses(id) on delete set null,
  add column if not exists workspace_config jsonb not null default '{}'::jsonb;

with numbered as (
  select id, row_number() over (partition by session_id order by created_at, id)::integer as version_number
  from public.analyses
)
update public.analyses a set version_number = numbered.version_number
from numbered where numbered.id = a.id and a.version_number is null;

with version_parents as (
  select id, lag(id) over (partition by session_id order by version_number) as parent_analysis_id
  from public.analyses
)
update public.analyses a set parent_analysis_id = version_parents.parent_analysis_id
from version_parents
where version_parents.id = a.id
  and a.parent_analysis_id is null
  and version_parents.parent_analysis_id is not null;

update public.analyses set workspace_config = jsonb_build_object(
  'schemaVersion', 'ava-workspace-config-v1',
  'timingZone', input_snapshot #> '{session,timingZone}',
  'calibrationInputs', input_snapshot #> '{session,calibrationInputs}',
  'requestedOptions', input_snapshot #> '{session,requestedOptions}'
)
where workspace_config = '{}'::jsonb and input_snapshot is not null;

alter table public.analyses alter column version_number set not null;
alter table public.analyses add constraint analyses_version_positive check (version_number > 0);
create unique index analyses_session_version_unique
  on public.analyses(session_id, version_number);

create or replace function public.assign_analysis_version()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_parent uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.session_id::text, 0));
  select id into v_parent from public.analyses
    where session_id = new.session_id order by version_number desc limit 1;
  if new.version_number is null then
    select coalesce(max(version_number), 0) + 1 into new.version_number
    from public.analyses where session_id = new.session_id;
  end if;
  if new.parent_analysis_id is null then new.parent_analysis_id := v_parent; end if;
  if new.workspace_config = '{}'::jsonb and new.input_snapshot is not null then
    new.workspace_config := jsonb_build_object(
      'schemaVersion', 'ava-workspace-config-v1',
      'timingZone', new.input_snapshot #> '{session,timingZone}',
      'calibrationInputs', new.input_snapshot #> '{session,calibrationInputs}',
      'requestedOptions', new.input_snapshot #> '{session,requestedOptions}'
    );
  end if;
  return new;
end;
$$;

create trigger analyses_assign_version before insert on public.analyses
for each row execute function public.assign_analysis_version();

comment on column public.analyses.version_number is
  'Immutable user-facing version number within a session.';
comment on column public.analyses.workspace_config is
  'Versioned calibration, timing, and review configuration captured at queue time.';
