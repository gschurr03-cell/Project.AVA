create table public.intelligence_shadow_manifests (
  id uuid primary key default gen_random_uuid(),
  execution_plan_id uuid not null unique references public.intelligence_execution_plans(id),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  pipeline_version text not null,registry_version text not null,
  input_fingerprint text not null,engine_versions jsonb not null,adapter_versions jsonb not null,
  snapshot_references jsonb not null,input_provenance jsonb not null default '{}',
  integrity_fingerprint text not null,status text not null default 'shadow'
    check(status in ('shadow','comparison_complete','failed','replayed')),
  authoritative boolean not null default false check(authoritative=false),
  source_replay_run_id uuid,created_at timestamptz not null default now()
);
create index intelligence_shadow_manifest_history_idx on public.intelligence_shadow_manifests(athlete_id,created_at desc);
alter table public.intelligence_shadow_manifests enable row level security;

create table public.intelligence_shadow_comparisons (
  id uuid primary key default gen_random_uuid(),
  shadow_manifest_id uuid not null unique references public.intelligence_shadow_manifests(id) on delete cascade,
  execution_plan_id uuid not null references public.intelligence_execution_plans(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  report_version text not null,baseline_mode text not null,
  execution_plan_fingerprint text not null,summary jsonb not null,
  per_engine_results jsonb not null,readiness text not null check(readiness in ('ready','blocked')),
  blocker_reasons jsonb not null default '[]',started_at timestamptz not null,
  completed_at timestamptz not null,created_at timestamptz not null default now(),
  check(octet_length(summary::text)<=65536),
  check(octet_length(per_engine_results::text)<=262144)
);
create index intelligence_shadow_comparison_history_idx on public.intelligence_shadow_comparisons(athlete_id,created_at desc);
alter table public.intelligence_shadow_comparisons enable row level security;

create table public.intelligence_replay_runs (
  id uuid primary key,source_execution_plan_id uuid not null references public.intelligence_execution_plans(id),
  replay_execution_plan_id uuid references public.intelligence_execution_plans(id),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  cache_mode text not null check(cache_mode in ('enabled','bypass')),
  target_engine_ids jsonb not null,version_availability jsonb not null,
  reason text not null,authoritative boolean not null default false check(authoritative=false),
  state text not null default 'queued' check(state in ('queued','running','succeeded','failed','cancelled')),
  created_at timestamptz not null default now(),completed_at timestamptz
);
create index intelligence_replay_history_idx on public.intelligence_replay_runs(athlete_id,created_at desc);
alter table public.intelligence_replay_runs enable row level security;

create table public.intelligence_dead_letters (
  id uuid primary key default gen_random_uuid(),
  execution_plan_id uuid not null references public.intelligence_execution_plans(id),
  execution_job_id uuid not null references public.intelligence_execution_jobs(id),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  engine_id text not null,engine_version text not null,adapter_version text not null,
  failure_classification text not null,failed_stage text not null,attempts integer not null,
  first_failure_at timestamptz not null,terminal_failure_at timestamptz not null,
  dependency_states jsonb not null,staged_snapshots_exist boolean not null,
  replay_eligibility text not null check(replay_eligibility in ('eligible','ineligible')),
  replay_reason text not null,recommended_action text not null,
  review_state text not null default 'unreviewed' check(review_state in ('unreviewed','acknowledged','reviewed')),
  internal_note text check(internal_note is null or length(internal_note)<=500),
  reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(execution_job_id)
);
create index intelligence_dead_letter_queue_idx on public.intelligence_dead_letters(athlete_id,review_state,created_at desc);
alter table public.intelligence_dead_letters enable row level security;

create table public.intelligence_health_evaluations (
  id uuid primary key default gen_random_uuid(),scope_id text not null,
  state text not null check(state in ('healthy','degraded','unhealthy','execution_disabled','validation_incomplete')),
  reasons jsonb not null,metrics jsonb not null,thresholds jsonb not null,
  evaluated_at timestamptz not null default now(),
  check(octet_length(metrics::text)<=32768)
);
alter table public.intelligence_health_evaluations enable row level security;
create table public.intelligence_cutover_evaluations (
  id uuid primary key default gen_random_uuid(),ready boolean not null,gates jsonb not null,
  evaluated_at timestamptz not null,created_at timestamptz not null default now(),
  check(octet_length(gates::text)<=131072)
);
alter table public.intelligence_cutover_evaluations enable row level security;

create function public.create_shadow_intelligence_manifest(p_execution_plan_id uuid,p_replay_run_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_plan public.intelligence_execution_plans;v_refs jsonb;v_adapters jsonb;v_integrity text;v_id uuid;
begin
  select * into v_plan from public.intelligence_execution_plans where id=p_execution_plan_id for update;
  if v_plan.id is null or not v_plan.shadow_execution then raise exception 'shadow plan required'; end if;
  if exists(select 1 from public.intelligence_execution_jobs where execution_plan_id=v_plan.id and state<>'succeeded')
  then raise exception 'shadow jobs incomplete';end if;
  select jsonb_object_agg(engine_id,id),jsonb_object_agg(engine_id,adapter_version)
    into v_refs,v_adapters from public.intelligence_staged_snapshots where execution_plan_id=v_plan.id;
  if (select count(*) from jsonb_object_keys(coalesce(v_refs,'{}'::jsonb)))<>jsonb_array_length(v_plan.snapshot_targets)
  then raise exception 'shadow snapshots incomplete';end if;
  v_integrity:=encode(extensions.digest(convert_to(jsonb_build_object(
    'plan',v_plan.input_fingerprint,'pipeline',v_plan.pipeline_version,'registry',v_plan.registry_version,
    'engines',v_plan.engine_versions,'adapters',v_adapters,'snapshots',v_refs)::text,'UTF8'),'sha256'),'hex');
  insert into public.intelligence_shadow_manifests(
    execution_plan_id,athlete_id,analysis_id,pipeline_version,registry_version,input_fingerprint,
    engine_versions,adapter_versions,snapshot_references,input_provenance,integrity_fingerprint,source_replay_run_id
  ) values(v_plan.id,v_plan.athlete_id,v_plan.analysis_id,v_plan.pipeline_version,v_plan.registry_version,
    v_plan.input_fingerprint,v_plan.engine_versions,v_adapters,v_refs,
    jsonb_build_object('analysisId',v_plan.analysis_id),v_integrity,p_replay_run_id)
  on conflict(execution_plan_id) do update set execution_plan_id=excluded.execution_plan_id
  returning id into v_id;
  insert into public.intelligence_orchestration_audit(athlete_id,execution_plan_id,actor_type,actor_id,action,details)
    values(v_plan.athlete_id,v_plan.id,'system','shadow-coordinator','shadow_manifest_created',
      jsonb_build_object('manifestId',v_id,'authoritative',false));
  return v_id;
end $$;

create function public.persist_shadow_intelligence_comparison(
  p_execution_plan_id uuid,p_shadow_manifest_id uuid,p_report jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_manifest public.intelligence_shadow_manifests;v_id uuid;
begin
  if octet_length(p_report::text)>327680 then raise exception 'comparison report too large';end if;
  if p_report ? 'rawVideo' or p_report ? 'engineInputs' then raise exception 'sensitive comparison payload prohibited';end if;
  select * into v_manifest from public.intelligence_shadow_manifests
    where id=p_shadow_manifest_id and execution_plan_id=p_execution_plan_id for update;
  if v_manifest.id is null or v_manifest.authoritative then raise exception 'invalid shadow manifest';end if;
  insert into public.intelligence_shadow_comparisons(
    shadow_manifest_id,execution_plan_id,athlete_id,report_version,baseline_mode,
    execution_plan_fingerprint,summary,per_engine_results,readiness,blocker_reasons,started_at,completed_at
  ) values(v_manifest.id,v_manifest.execution_plan_id,v_manifest.athlete_id,
    p_report->>'reportVersion',p_report->>'baselineMode',p_report->>'executionPlanFingerprint',
    p_report-'results'-'baselineSources',coalesce(p_report->'results','[]'),
    p_report->>'readiness',coalesce(p_report->'blockerReasons','[]'),
    (p_report->>'startedAt')::timestamptz,(p_report->>'completedAt')::timestamptz)
  on conflict(shadow_manifest_id) do nothing returning id into v_id;
  select coalesce(v_id,id) into v_id from public.intelligence_shadow_comparisons where shadow_manifest_id=v_manifest.id;
  update public.intelligence_shadow_manifests set status='comparison_complete' where id=v_manifest.id;
  return v_id;
end $$;

create function public.get_orchestration_operational_dashboard(p_athlete_id uuid,p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if p_limit not between 1 and 100 then raise exception 'invalid dashboard limit';end if;
  if not exists(select 1 from public.athletes where id=p_athlete_id and coach_id=auth.uid()) then return null;end if;
  return jsonb_build_object(
    'shadowRuns',coalesce((select jsonb_agg(x) from(select id,status,created_at from public.intelligence_shadow_manifests
      where athlete_id=p_athlete_id order by created_at desc limit p_limit)x),'[]'),
    'comparisons',coalesce((select jsonb_agg(x) from(select id,readiness,blocker_reasons,created_at from public.intelligence_shadow_comparisons
      where athlete_id=p_athlete_id order by created_at desc limit p_limit)x),'[]'),
    'replays',coalesce((select jsonb_agg(x) from(select id,state,cache_mode,created_at from public.intelligence_replay_runs
      where athlete_id=p_athlete_id order by created_at desc limit p_limit)x),'[]'),
    'deadLetters',coalesce((select jsonb_agg(x) from(select id,engine_id,failure_classification,review_state,replay_eligibility,created_at
      from public.intelligence_dead_letters where athlete_id=p_athlete_id order by created_at desc limit p_limit)x),'[]'),
    'health',(select to_jsonb(x) from(select state,reasons,metrics,evaluated_at from public.intelligence_health_evaluations
      order by evaluated_at desc limit 1)x),
    'readiness',(select to_jsonb(x) from(select ready,gates,evaluated_at from public.intelligence_cutover_evaluations
      order by evaluated_at desc limit 1)x)
  );
end $$;

revoke all on public.intelligence_shadow_manifests,public.intelligence_shadow_comparisons,
  public.intelligence_replay_runs,public.intelligence_dead_letters,
  public.intelligence_health_evaluations,public.intelligence_cutover_evaluations from anon,authenticated;
revoke execute on function public.create_shadow_intelligence_manifest(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.persist_shadow_intelligence_comparison(uuid,uuid,jsonb) from public,anon,authenticated;
revoke execute on function public.get_orchestration_operational_dashboard(uuid,integer) from public,anon;
grant execute on function public.create_shadow_intelligence_manifest(uuid,uuid) to service_role;
grant execute on function public.persist_shadow_intelligence_comparison(uuid,uuid,jsonb) to service_role;
grant execute on function public.get_orchestration_operational_dashboard(uuid,integer) to authenticated;
