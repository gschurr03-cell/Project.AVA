-- Additive experimental 30 FPS profile. Validated 60 FPS rows remain unchanged.
alter table public.sessions drop constraint if exists sessions_fps_classification_valid;
alter table public.sessions add constraint sessions_fps_classification_valid check (
  fps_classification is null or fps_classification in (
    'experimental_30_fps_class',
    'validated_60_fps_class',
    'high_speed_source_normalized_to_60',
    'unsupported_source_fps',
    'unsupported_below_60_fps_class'
  )
);

alter table public.analyses
  add column if not exists experimental boolean not null default false,
  add column if not exists experiment_version text,
  add column if not exists validation_status text not null default 'validated',
  add column if not exists source_fps_tier text,
  add column if not exists source_fps_tier_reason text,
  add column if not exists source_fps_tier_policy_version text,
  add column if not exists compatibility_group text not null default 'validated-60-v1',
  add column if not exists experimental_result jsonb;

alter table public.analyses add constraint analyses_validation_status_valid check (
  validation_status in ('validated', 'experimental', 'unvalidated')
);
alter table public.analyses add constraint analyses_experimental_contract_valid check (
  (not experimental and experiment_version is null and compatibility_group = 'validated-60-v1')
  or
  (experimental and experiment_version is not null and validation_status = 'experimental'
    and compatibility_group <> 'validated-60-v1')
);

comment on column public.analyses.experimental_result is
  'Immutable versioned experimental-profile report; never a validated 60 FPS metric payload.';
comment on column public.analyses.compatibility_group is
  'Default history/benchmark comparisons require an exact compatibility-group match.';

create or replace function public.complete_experimental_analysis_job(
  p_job_id uuid, p_claim_token uuid, p_worker_id text, p_model_version text,
  p_metrics jsonb, p_provenance jsonb, p_input_snapshot jsonb, p_result_payload jsonb,
  p_keypoints_path text, p_source_fps numeric, p_artifact_paths jsonb,
  p_experimental_result jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_job public.analysis_jobs;
begin
  select * into v_job from public.analysis_jobs where id = p_job_id for update;
  if v_job.status = 'completed' then return true; end if;
  if v_job.claim_token is distinct from p_claim_token or v_job.claimed_by is distinct from p_worker_id
     or v_job.lease_expires_at <= now() then raise exception 'stale job claim'; end if;
  if coalesce((p_provenance->>'analysisFps')::numeric, 0) <> 30
     or p_provenance->>'sourceFpsClassification' <> 'experimental_30_fps_class'
     or coalesce((p_provenance->>'experimental')::boolean, false) is not true
     or p_provenance->>'compatibilityGroup' <> 'experimental-30-v1'
     or p_provenance->>'poseModelName' <> 'mediapipe'
     or coalesce((p_experimental_result->>'experimental')::boolean, false) is not true
     or p_experimental_result->>'profileVersion' <> 'ava-sprint-30-experimental-v1'
     or p_input_snapshot is distinct from (select input_snapshot from public.analyses where id=v_job.analysis_id)
     or p_result_payload->>'analysisId' <> v_job.analysis_id::text
     or p_result_payload->>'sessionId' <> v_job.session_id::text
     or p_result_payload->>'athleteId' <> v_job.athlete_id::text then
    raise exception 'invalid experimental result identity or provenance';
  end if;
  update public.analyses set status='complete', model_version=p_model_version,
    metrics=p_metrics, provenance=p_provenance, input_snapshot=p_input_snapshot,
    result_payload=p_result_payload, analysis_fps=30, source_fps=p_source_fps,
    keypoints_path=p_keypoints_path, error=null, completed_at=now(),
    experimental=true, experiment_version='ava-sprint-30-experimental-v1',
    validation_status='experimental', source_fps_tier='experimental_30_fps_class',
    analysis_pipeline_version='ava-sprint-30-experimental-v1',
    source_fps_tier_reason=p_provenance->>'sourceFpsTierReason',
    source_fps_tier_policy_version=p_provenance->>'sourceFpsTierPolicyVersion',
    compatibility_group='experimental-30-v1', experimental_result=p_experimental_result
  where id=v_job.analysis_id and status <> 'complete';
  update public.sessions set status='complete' where id=v_job.session_id;
  update public.analysis_jobs set status='completed', completed_at=now(),
    output_artifact_paths=coalesce(p_artifact_paths,'{}'::jsonb),
    claim_token=null, claimed_by=null, claimed_at=null, lease_expires_at=null,
    heartbeat_at=null, updated_at=now() where id=p_job_id;
  return true;
end;
$$;

revoke all on function public.complete_experimental_analysis_job(
  uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,text,numeric,jsonb,jsonb
) from public;
grant execute on function public.complete_experimental_analysis_job(
  uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,text,numeric,jsonb,jsonb
) to service_role;
