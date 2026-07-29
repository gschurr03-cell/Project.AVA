-- Versioned panning-analysis provenance. Additive and nullable preserves legacy results.
alter table public.analyses
  add column if not exists recording_mode text,
  add column if not exists recording_mode_version text,
  add column if not exists camera_motion_model_version text,
  add column if not exists dynamic_crop_version text,
  add column if not exists athlete_tracking_version text,
  add column if not exists camera_motion_confidence numeric,
  add column if not exists athlete_tracking_confidence numeric,
  add column if not exists zoom_classification text,
  add column if not exists zoom_confidence numeric,
  add column if not exists camera_transform_summary jsonb,
  add column if not exists unstable_frame_ranges jsonb,
  add column if not exists tracking_loss_ranges jsonb,
  add column if not exists spatial_metric_eligibility text;

alter table public.analyses
  add constraint analyses_recording_mode_valid check (
    recording_mode is null or recording_mode in (
      'static_precision', 'static_usable', 'smooth_pan', 'unstable_pan',
      'pan_with_zoom', 'excessive_camera_motion', 'athlete_tracking_lost',
      'unsupported_recording'
    )
  ),
  add constraint analyses_camera_motion_confidence_valid
    check (camera_motion_confidence is null or camera_motion_confidence between 0 and 1),
  add constraint analyses_athlete_tracking_confidence_valid
    check (athlete_tracking_confidence is null or athlete_tracking_confidence between 0 and 1),
  add constraint analyses_zoom_confidence_valid
    check (zoom_confidence is null or zoom_confidence between 0 and 1),
  add constraint analyses_spatial_metric_eligibility_valid
    check (spatial_metric_eligibility is null or spatial_metric_eligibility in ('eligible', 'conditional', 'withheld'));

create or replace function public.capture_camera_provenance_fields()
returns trigger language plpgsql as $$
begin
  if new.provenance is not null then
    new.recording_mode := new.provenance->>'cameraMode';
    new.recording_mode_version := new.provenance->>'recordingModeVersion';
    new.camera_motion_model_version := new.provenance->>'cameraMotionModelVersion';
    new.dynamic_crop_version := new.provenance->>'dynamicCropVersion';
    new.athlete_tracking_version := new.provenance->>'athleteTrackingVersion';
    new.camera_motion_confidence := (new.provenance->>'cameraMotionConfidence')::numeric;
    new.athlete_tracking_confidence := (new.provenance->>'athleteTrackingConfidence')::numeric;
    new.zoom_classification := new.provenance->>'zoomClassification';
    new.zoom_confidence := (new.provenance->>'zoomConfidence')::numeric;
    new.camera_transform_summary := new.provenance->'transformSummary';
    new.unstable_frame_ranges := new.provenance->'unstableFrameRanges';
    new.tracking_loss_ranges := new.provenance->'trackingLossRanges';
    new.spatial_metric_eligibility := new.provenance->>'spatialMetricEligibility';
  end if;
  return new;
end;
$$;

drop trigger if exists analyses_capture_camera_provenance on public.analyses;
create trigger analyses_capture_camera_provenance
before insert or update of provenance on public.analyses
for each row execute function public.capture_camera_provenance_fields();

comment on column public.analyses.recording_mode is
  'Independent AVA recording classification; user-selected recording mode is intent only.';
comment on column public.analyses.camera_transform_summary is
  'Summary background-affine evidence. Raw video remains the immutable reprocessing source.';
