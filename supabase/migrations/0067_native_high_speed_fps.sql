-- Native high-speed FPS support (variable-frame-rate audit).
--
-- Before this migration, any source above ~60.5 FPS was hard-collapsed onto a
-- forced 60 FPS analysis identity ("high_speed_source_normalized_to_60"): a
-- genuine 120 or 240 FPS recording was processed and stored as if it were 60
-- FPS, discarding its real temporal resolution. `complete_analysis_job` also
-- hard-required `analysisFps = 60` exactly, so there was no way for a higher
-- native rate to ever complete.
--
-- This migration is purely additive: existing 30/60 FPS rows and completion
-- behavior are unchanged bit-for-bit. It only (a) allows the new
-- `validated_high_speed_native_class` classification value alongside the
-- historical `high_speed_source_normalized_to_60` (kept so old rows keep
-- validating — never produced by current worker code), and (b) widens
-- `complete_analysis_job`'s identity check to also accept a native analysis
-- rate above 60 (up to 300) when the provenance says so, storing that real
-- rate in `analyses.analysis_fps` instead of always overwriting it to 60.

alter table public.sessions drop constraint if exists sessions_fps_classification_valid;
alter table public.sessions add constraint sessions_fps_classification_valid check (
  fps_classification is null or fps_classification in (
    'experimental_30_fps_class',
    'validated_60_fps_class',
    'validated_high_speed_native_class',
    'high_speed_source_normalized_to_60',
    'unsupported_source_fps',
    'unsupported_below_60_fps_class'
  )
);

create or replace function public.complete_analysis_job(
  p_job_id uuid, p_claim_token uuid, p_worker_id text, p_model_version text,
  p_metrics jsonb, p_provenance jsonb, p_input_snapshot jsonb, p_result_payload jsonb,
  p_keypoints_path text, p_source_fps numeric, p_artifact_paths jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_job public.analysis_jobs; v_analysis_fps numeric;
begin
  select * into v_job from public.analysis_jobs where id = p_job_id for update;
  if v_job.status = 'completed' then return true; end if;
  if v_job.claim_token is distinct from p_claim_token or v_job.claimed_by is distinct from p_worker_id
     or v_job.lease_expires_at <= now() then raise exception 'stale job claim'; end if;
  v_analysis_fps := (p_provenance->>'analysisFps')::numeric;
  if not (
       (coalesce(v_analysis_fps, 0) = 60 and p_provenance->>'sourceFpsClassification' = 'validated_60_fps_class')
       or (
         coalesce(v_analysis_fps, 0) > 60 and coalesce(v_analysis_fps, 0) <= 300
         and p_provenance->>'sourceFpsClassification' = 'validated_high_speed_native_class'
       )
     )
     or p_provenance->>'poseModelName' <> 'mediapipe'
     or p_input_snapshot is distinct from (select input_snapshot from public.analyses where id=v_job.analysis_id)
     or p_result_payload->>'analysisId' <> v_job.analysis_id::text
     or p_result_payload->>'sessionId' <> v_job.session_id::text
     or p_result_payload->>'athleteId' <> v_job.athlete_id::text then
    raise exception 'invalid production result identity or provenance';
  end if;
  update public.analyses set status='complete', model_version=p_model_version,
    metrics=p_metrics, provenance=p_provenance, input_snapshot=p_input_snapshot,
    result_payload=p_result_payload, analysis_fps=v_analysis_fps, source_fps=p_source_fps,
    keypoints_path=p_keypoints_path, error=null, completed_at=now()
  where id=v_job.analysis_id and status <> 'complete';
  update public.sessions set status='complete' where id=v_job.session_id;
  update public.analysis_jobs set status='completed', completed_at=now(),
    output_artifact_paths=coalesce(p_artifact_paths,'{}'::jsonb),
    claim_token=null, claimed_by=null, claimed_at=null, lease_expires_at=null,
    heartbeat_at=null, updated_at=now() where id=p_job_id;
  return true;
end;
$$;
