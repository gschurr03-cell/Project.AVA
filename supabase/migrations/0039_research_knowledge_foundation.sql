-- Reviewer-gated Research Knowledge Engine foundation.
-- No ordinary authenticated user receives research access by default.

create table public.research_reviewers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('reviewer','senior_reviewer','research_admin')),
  active boolean not null default true,
  appointed_by uuid references auth.users(id),
  appointed_at timestamptz not null default now()
);
alter table public.research_reviewers enable row level security;
create policy "reviewers read own membership" on public.research_reviewers
  for select using (auth.uid() = user_id);

create or replace function public.is_research_reviewer()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.research_reviewers where user_id=auth.uid() and active) $$;
revoke all on function public.is_research_reviewer() from public;
grant execute on function public.is_research_reviewer() to authenticated;

create table public.research_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  source_type text not null,
  title text not null,
  metadata jsonb not null default '{}'::jsonb,
  doi text,
  pmid text,
  normalized_title text not null,
  document_hash text,
  access_status text not null,
  license_status text not null,
  review_status text not null default 'unreviewed',
  ingestion_status text not null default 'queued',
  retracted boolean not null default false,
  expression_of_concern boolean not null default false,
  superseded_by uuid references public.research_sources(id),
  correction_notice text,
  version integer not null default 1 check(version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint research_sources_review_status check
    (review_status in ('unreviewed','under_review','changes_requested','approved_internal','approved_production','rejected','archived'))
);
create unique index research_sources_doi_unique on public.research_sources(lower(doi)) where doi is not null;
create unique index research_sources_pmid_unique on public.research_sources(pmid) where pmid is not null;
create index research_sources_title_idx on public.research_sources(normalized_title);
alter table public.research_sources enable row level security;
create policy "reviewers read research sources" on public.research_sources
  for select using (public.is_research_reviewer());

create table public.research_claims (
  id uuid primary key default gen_random_uuid(),
  claim_key text not null,
  statement text not null,
  normalized_statement text not null,
  claim_type text not null,
  category text not null,
  scope jsonb not null default '{}'::jsonb,
  evidence_grade text not null default 'unavailable',
  evidence_grade_reasons jsonb not null default '[]'::jsonb,
  consensus_status text not null default 'unknown',
  applicability text not null default 'unknown',
  limitations jsonb not null default '[]'::jsonb,
  excluded_conclusions jsonb not null default '[]'::jsonb,
  review_status text not null default 'unreviewed',
  athlete_facing_eligible boolean not null default false,
  coach_facing_eligible boolean not null default false,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  version integer not null default 1 check(version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(claim_key, version),
  constraint research_claims_production_audit check (
    review_status <> 'approved_production'
    or (reviewed_by is not null and reviewed_at is not null)
  )
);
create index research_claims_search_idx on public.research_claims using gin
  (to_tsvector('english', statement || ' ' || category));
alter table public.research_claims enable row level security;
create policy "reviewers read research claims" on public.research_claims
  for select using (public.is_research_reviewer());

create table public.research_evidence_links (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.research_sources(id),
  claim_id uuid not null references public.research_claims(id),
  support_type text not null,
  directness text not null,
  extraction jsonb not null default '{}'::jsonb,
  applicability jsonb not null default '{}'::jsonb,
  statistics jsonb not null default '{}'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  reviewer_status text not null default 'unreviewed',
  reviewer_notes text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  version integer not null default 1 check(version > 0),
  created_at timestamptz not null default now(),
  unique(source_id, claim_id, version)
);
alter table public.research_evidence_links enable row level security;
create policy "reviewers read evidence links" on public.research_evidence_links
  for select using (public.is_research_reviewer());

create table public.research_metric_definitions (
  metric_key text not null,
  version integer not null default 1,
  definition jsonb not null,
  review_status text not null default 'unreviewed',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key(metric_key,version)
);
alter table public.research_metric_definitions enable row level security;
create policy "reviewers read metric definitions" on public.research_metric_definitions
  for select using (public.is_research_reviewer());

create table public.research_terminology_mappings (
  id uuid primary key default gen_random_uuid(),
  original_term text not null,
  normalized_key text not null,
  relationship text not null,
  context text,
  preserve_distinct boolean not null default false,
  version integer not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(original_term,normalized_key,version)
);
alter table public.research_terminology_mappings enable row level security;
create policy "reviewers read terminology mappings" on public.research_terminology_mappings
  for select using (public.is_research_reviewer());

create table public.research_audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor_id uuid not null references auth.users(id),
  from_status text,
  to_status text,
  reason text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.research_audit_events enable row level security;
create policy "reviewers read research audit" on public.research_audit_events
  for select using (public.is_research_reviewer());
-- Audit rows are append-only and written only by reviewed security-definer workflows.

create or replace function public.review_research_claim(
  p_claim_id uuid, p_status text, p_reason text
) returns boolean language plpgsql security definer set search_path=public
as $$
declare v_role text; v_previous text;
begin
  select role into v_role from public.research_reviewers
    where user_id=auth.uid() and active for share;
  if v_role is null then raise exception 'research reviewer access required'; end if;
  if p_status not in ('under_review','changes_requested','approved_internal','approved_production','rejected','archived')
    then raise exception 'invalid review status'; end if;
  if length(trim(coalesce(p_reason,''))) < 8 then raise exception 'review reason required'; end if;
  if p_status='approved_internal' and v_role='reviewer' then raise exception 'senior reviewer required'; end if;
  if p_status='approved_production' and v_role<>'research_admin' then raise exception 'research admin required'; end if;
  select review_status into v_previous from public.research_claims where id=p_claim_id for update;
  if v_previous is null then raise exception 'claim not found'; end if;
  if p_status='approved_production' and not exists (
    select 1 from public.research_evidence_links l
    join public.research_sources s on s.id=l.source_id
    where l.claim_id=p_claim_id and l.reviewer_status in ('approved_internal','approved_production')
      and l.support_type in ('supports','partially_supports')
      and not s.retracted and s.review_status='approved_production'
  ) then raise exception 'eligible reviewed production evidence required'; end if;
  insert into public.research_audit_events(entity_type,entity_id,action,actor_id,from_status,to_status,reason)
    values('claim',p_claim_id,'review_status_changed',auth.uid(),v_previous,p_status,p_reason);
  update public.research_claims set
    review_status=p_status, reviewed_by=auth.uid(), reviewed_at=now(), updated_at=now(),
    athlete_facing_eligible=case when p_status='approved_production' then athlete_facing_eligible else false end,
    coach_facing_eligible=case when p_status='approved_production' then coach_facing_eligible else false end
  where id=p_claim_id;
  return true;
end $$;
revoke all on function public.review_research_claim(uuid,text,text) from public;
grant execute on function public.review_research_claim(uuid,text,text) to authenticated;

create or replace function public.get_research_workspace_summary()
returns jsonb language plpgsql stable security definer set search_path=public
as $$
begin
  if not public.is_research_reviewer() then raise exception 'research reviewer access required'; end if;
  return jsonb_build_object(
    'sources', (select count(*) from public.research_sources where archived_at is null),
    'claims', (select count(*) from public.research_claims where archived_at is null),
    'reviewQueue', (
      select count(*) from public.research_sources where review_status in ('unreviewed','under_review','changes_requested')
    ) + (
      select count(*) from public.research_claims where review_status in ('unreviewed','under_review','changes_requested')
    ),
    'conflicts', (select count(*) from public.research_claims where consensus_status in ('mixed','disputed')),
    'metricDefinitions', (select count(*) from public.research_metric_definitions),
    'auditEvents', (select count(*) from public.research_audit_events),
    'recentSources', coalesce((
      select jsonb_agg(jsonb_build_object('id',id,'title',title,'sourceType',source_type,'reviewStatus',review_status,'retracted',retracted) order by created_at desc)
      from (select * from public.research_sources order by created_at desc limit 20) s
    ), '[]'::jsonb),
    'recentClaims', coalesce((
      select jsonb_agg(jsonb_build_object('id',id,'statement',statement,'evidenceGrade',evidence_grade,'consensusStatus',consensus_status,'reviewStatus',review_status) order by created_at desc)
      from (select * from public.research_claims order by created_at desc limit 20) c
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.get_research_workspace_summary() from public;
grant execute on function public.get_research_workspace_summary() to authenticated;

create or replace function public.get_research_source_detail(p_source_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
begin
  if not public.is_research_reviewer() then raise exception 'research reviewer access required'; end if;
  return (
    select jsonb_build_object(
      'source', to_jsonb(s) - 'document_hash',
      'claims', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',c.id,'statement',c.statement,'evidenceGrade',c.evidence_grade,
          'reviewStatus',c.review_status,'supportType',l.support_type,'directness',l.directness
        )) from public.research_evidence_links l
        join public.research_claims c on c.id=l.claim_id where l.source_id=s.id
      ),'[]'::jsonb),
      'audit', coalesce((
        select jsonb_agg(to_jsonb(a) order by a.created_at desc)
        from public.research_audit_events a where a.entity_type='source' and a.entity_id=s.id
      ),'[]'::jsonb)
    ) from public.research_sources s where s.id=p_source_id
  );
end $$;
revoke all on function public.get_research_source_detail(uuid) from public;
grant execute on function public.get_research_source_detail(uuid) to authenticated;

create or replace function public.get_research_claim_detail(p_claim_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
begin
  if not public.is_research_reviewer() then raise exception 'research reviewer access required'; end if;
  return (
    select jsonb_build_object(
      'claim',to_jsonb(c),
      'evidence',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',l.id,'supportType',l.support_type,'directness',l.directness,
          'reviewerStatus',l.reviewer_status,'sourceId',s.id,'sourceTitle',s.title,
          'sourceReviewStatus',s.review_status,'retracted',s.retracted
        )) from public.research_evidence_links l
        join public.research_sources s on s.id=l.source_id where l.claim_id=c.id
      ),'[]'::jsonb),
      'audit',coalesce((
        select jsonb_agg(to_jsonb(a) order by a.created_at desc)
        from public.research_audit_events a where a.entity_type='claim' and a.entity_id=c.id
      ),'[]'::jsonb)
    ) from public.research_claims c where c.id=p_claim_id
  );
end $$;
revoke all on function public.get_research_claim_detail(uuid) from public;
grant execute on function public.get_research_claim_detail(uuid) to authenticated;

-- Narrow production-read boundary: reviewed summaries and citations only.
create or replace function public.retrieve_production_research_evidence(
  p_metric_keys text[], p_usage text, p_limit integer default 5
) returns jsonb language plpgsql stable security definer set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_usage not in ('coach_report','athlete_report') then raise exception 'invalid usage'; end if;
  return coalesce((
    select jsonb_agg(result order by evidence_rank desc, claim_id)
    from (
      select c.id as claim_id,
        case c.evidence_grade when 'strong' then 4 when 'moderate' then 3 when 'limited' then 2 else 1 end as evidence_rank,
        jsonb_build_object(
          'claimId',c.id,'evidenceGrade',c.evidence_grade,
          'summary',case when p_usage='athlete_report'
            then initcap(c.evidence_grade)||' research evidence supports this general area. Applicability may differ for each athlete.'
            else initcap(c.evidence_grade)||' reviewed evidence relates to this precise claim.' end,
          'applicability',c.applicability,
          'conflicting',c.consensus_status in ('mixed','disputed'),
          'citations',coalesce(jsonb_agg(distinct jsonb_build_object(
            'shortCitation',coalesce(s.metadata->>'shortCitation',s.title),
            'formattedCitation',coalesce(s.metadata->>'formattedCitation',s.title),
            'url',case when s.access_status='restricted' then null else s.metadata->>'url' end
          )) filter (where s.id is not null),'[]'::jsonb)
        ) as result
      from public.research_claims c
      join public.research_evidence_links l on l.claim_id=c.id
        and l.reviewer_status='approved_production'
        and l.support_type in ('supports','partially_supports','contextual')
      join public.research_sources s on s.id=l.source_id
        and s.review_status='approved_production' and not s.retracted
      where c.review_status='approved_production' and c.coach_facing_eligible
        and (p_usage<>'athlete_report' or c.athlete_facing_eligible)
        and c.evidence_grade in ('strong','moderate','limited')
        and coalesce((s.metadata->>'syntheticFixture')::boolean,false)=false
        and (coalesce(array_length(p_metric_keys,1),0)=0 or (c.scope->'applicableMetrics') ?| p_metric_keys)
      group by c.id,c.evidence_grade,c.applicability,c.consensus_status
      limit greatest(1,least(coalesce(p_limit,5),10))
    ) ranked
  ),'[]'::jsonb);
end $$;
revoke all on function public.retrieve_production_research_evidence(text[],text,integer) from public;
grant execute on function public.retrieve_production_research_evidence(text[],text,integer) to authenticated;
