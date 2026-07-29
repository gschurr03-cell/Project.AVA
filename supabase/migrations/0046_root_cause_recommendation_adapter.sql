-- Immutable staged Root Cause-to-Recommendation adapter state. No mappings or athlete conclusions are seeded.
create table public.root_cause_recommendation_mapping_registry(
  id uuid primary key default gen_random_uuid(),mapping_id text not null,mapping_version text not null,
  registry_version text not null,status text not null check(status in(
    'DRAFT','SHADOW_VALIDATED','ADVISORY_APPROVED','BOUNDED_INFLUENCE_APPROVED','DEPRECATED','DISABLED'
  )),mapping_snapshot jsonb not null,created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),unique(mapping_id,mapping_version)
);
alter table public.root_cause_recommendation_mapping_registry enable row level security;
-- Registry has no client policies. Administrative/server governance is required.

create table public.root_cause_recommendation_context_snapshots(
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  context_id text not null,analysis_id text not null,
  adapter_version text not null check(adapter_version='ava-root-cause-recommendation-adapter-v1'),
  mapping_registry_version text not null,rollout_mode text not null check(rollout_mode in(
    'OFF','SHADOW','ADVISORY','BOUNDED_INFLUENCE'
  )),invalidation_fingerprint text not null,context_snapshot jsonb not null,
  created_by uuid not null references auth.users(id),created_at timestamptz not null,
  unique(athlete_id,context_id),unique(athlete_id,invalidation_fingerprint)
);
alter table public.root_cause_recommendation_context_snapshots enable row level security;
create policy "coaches read owned adapter snapshots" on public.root_cause_recommendation_context_snapshots
for select using(exists(select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid()));
-- No direct insert/update/delete policy. Snapshots are immutable and RPC-managed.

create table public.active_root_cause_recommendation_contexts(
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  snapshot_id uuid not null references public.root_cause_recommendation_context_snapshots(id),
  updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now()
);
alter table public.active_root_cause_recommendation_contexts enable row level security;
create policy "coaches read owned active adapter state" on public.active_root_cause_recommendation_contexts
for select using(exists(select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid()));

create table public.root_cause_recommendation_invalidations(
  id uuid primary key default gen_random_uuid(),athlete_id uuid not null references public.athletes(id) on delete cascade,
  trigger_id text not null,trigger_type text not null check(trigger_type in(
    'root_cause_state','recommendation_input','recommendation_catalog','root_cause_taxonomy',
    'mapping_registry','adapter_version','coach_rci_feedback','recommendation_override',
    'benchmark_version','research_version','season_context','competition_context',
    'measurement_correction','manual_regeneration'
  )),source_id text not null,occurred_at timestamptz not null,status text not null default 'pending'
  check(status in('pending','processed')),processed_snapshot_id uuid references public.root_cause_recommendation_context_snapshots(id),
  created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
  processed_at timestamptz,unique(athlete_id,trigger_id)
);
alter table public.root_cause_recommendation_invalidations enable row level security;
create policy "coaches read owned adapter invalidations" on public.root_cause_recommendation_invalidations
for select using(exists(select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid()));
-- App open is not an invalidation type.

create or replace function public.enqueue_root_cause_recommendation_invalidation(
  p_athlete_id uuid,p_trigger jsonb
)returns boolean language plpgsql security definer set search_path=public as $$
declare v_inserted integer;
begin
  if not exists(select 1 from public.athletes where id=p_athlete_id and coach_id=auth.uid())
    then raise exception 'athlete ownership required';end if;
  if p_trigger->>'type'='app_open'
    then raise exception 'app open does not invalidate adapter context';end if;
  if coalesce(p_trigger->>'triggerId','')=''or coalesce(p_trigger->>'sourceId','')=''
    then raise exception 'adapter invalidation trigger is incomplete';end if;
  insert into public.root_cause_recommendation_invalidations(
    athlete_id,trigger_id,trigger_type,source_id,occurred_at,created_by
  )values(p_athlete_id,p_trigger->>'triggerId',p_trigger->>'type',p_trigger->>'sourceId',
    (p_trigger->>'occurredAt')::timestamptz,auth.uid())
  on conflict(athlete_id,trigger_id)do nothing;
  get diagnostics v_inserted=row_count;return v_inserted=1;
end $$;
revoke all on function public.enqueue_root_cause_recommendation_invalidation(uuid,jsonb) from public;
grant execute on function public.enqueue_root_cause_recommendation_invalidation(uuid,jsonb) to authenticated;

create table public.root_cause_recommendation_shadow_comparisons(
  id uuid primary key default gen_random_uuid(),athlete_id uuid not null references public.athletes(id) on delete cascade,
  snapshot_id uuid not null references public.root_cause_recommendation_context_snapshots(id),
  comparison_id text not null,comparison_snapshot jsonb not null,
  created_by uuid not null references auth.users(id),created_at timestamptz not null,
  unique(athlete_id,comparison_id)
);
alter table public.root_cause_recommendation_shadow_comparisons enable row level security;
create policy "coaches read owned shadow comparisons" on public.root_cause_recommendation_shadow_comparisons
for select using(exists(select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid()));

create table public.root_cause_recommendation_audit(
  id uuid primary key default gen_random_uuid(),athlete_id uuid not null references public.athletes(id) on delete cascade,
  snapshot_id uuid not null references public.root_cause_recommendation_context_snapshots(id),
  action text not null,input_fingerprint text not null,actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.root_cause_recommendation_audit enable row level security;
create policy "coaches read owned adapter audit" on public.root_cause_recommendation_audit
for select using(exists(select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid()));

create or replace function public.append_and_activate_root_cause_recommendation_context(
  p_athlete_id uuid,p_context jsonb,p_trigger_ids jsonb default '[]'::jsonb
)returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_shadow jsonb;
begin
  if not exists(select 1 from public.athletes where id=p_athlete_id and coach_id=auth.uid())
    then raise exception 'athlete ownership required';end if;
  if p_context->>'athleteId' is distinct from p_athlete_id::text
    or p_context->>'adapterVersion'<>'ava-root-cause-recommendation-adapter-v1'
    or (p_context#>>'{computePolicy,externalModelCalls}')::integer<>0
    or (p_context#>>'{provenance,downstreamReapplicationAllowed}')::boolean is not false
    then raise exception 'Adapter context or token-free policy mismatch';end if;
  insert into public.root_cause_recommendation_context_snapshots(
    athlete_id,context_id,analysis_id,adapter_version,mapping_registry_version,rollout_mode,
    invalidation_fingerprint,context_snapshot,created_by,created_at
  )values(p_athlete_id,p_context->>'contextId',p_context->>'analysisId',
    p_context->>'adapterVersion',p_context->>'mappingRegistryVersion',p_context->>'rolloutMode',
    p_context->>'invalidationFingerprint',p_context,auth.uid(),(p_context->>'generatedAt')::timestamptz)
  on conflict(athlete_id,invalidation_fingerprint)do nothing;
  select id into v_id from public.root_cause_recommendation_context_snapshots where
    athlete_id=p_athlete_id and invalidation_fingerprint=p_context->>'invalidationFingerprint';
  if not exists(select 1 from public.root_cause_recommendation_context_snapshots
    where id=v_id and context_snapshot=p_context)then raise exception 'Adapter fingerprint collision';end if;
  v_shadow=p_context->'shadowComparison';
  if v_shadow is not null and v_shadow<>'null'::jsonb then
    insert into public.root_cause_recommendation_shadow_comparisons(
      athlete_id,snapshot_id,comparison_id,comparison_snapshot,created_by,created_at
    )values(p_athlete_id,v_id,v_shadow->>'comparisonId',v_shadow,auth.uid(),
      (v_shadow->>'generatedAt')::timestamptz)on conflict(athlete_id,comparison_id)do nothing;
  end if;
  insert into public.active_root_cause_recommendation_contexts(athlete_id,snapshot_id,updated_by)
    values(p_athlete_id,v_id,auth.uid())on conflict(athlete_id)do update set
    snapshot_id=excluded.snapshot_id,updated_by=excluded.updated_by,updated_at=now();
  update public.root_cause_recommendation_invalidations set status='processed',
    processed_snapshot_id=v_id,processed_at=now()where athlete_id=p_athlete_id and status='pending'
    and trigger_id in(select jsonb_array_elements_text(p_trigger_ids));
  insert into public.root_cause_recommendation_audit(
    athlete_id,snapshot_id,action,input_fingerprint,actor_id
  )values(p_athlete_id,v_id,'activate',p_context->>'invalidationFingerprint',auth.uid());
  return v_id;
end $$;
revoke all on function public.append_and_activate_root_cause_recommendation_context(uuid,jsonb,jsonb) from public;
grant execute on function public.append_and_activate_root_cause_recommendation_context(uuid,jsonb,jsonb) to authenticated;

create or replace function public.get_cached_root_cause_recommendation_context(p_athlete_id uuid)
returns jsonb language plpgsql security definer stable set search_path=public as $$
begin
  if not exists(select 1 from public.athletes where id=p_athlete_id and coach_id=auth.uid())
    then raise exception 'athlete ownership required';end if;
  return coalesce((select snapshot.context_snapshot from public.active_root_cause_recommendation_contexts active
    join public.root_cause_recommendation_context_snapshots snapshot on snapshot.id=active.snapshot_id
    where active.athlete_id=p_athlete_id),'null'::jsonb);
end $$;
revoke all on function public.get_cached_root_cause_recommendation_context(uuid) from public;
grant execute on function public.get_cached_root_cause_recommendation_context(uuid) to authenticated;
