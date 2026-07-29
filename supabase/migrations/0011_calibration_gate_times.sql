-- Day 64: record WHEN each calibration gate was placed (clip seconds).
--
-- On panning video the two calibration gates are clicked at different moments,
-- with the camera at a different position each time. To convert a gate's frame-x
-- into a stabilized WORLD-x (and so measure the true gate separation), AVA needs
-- the camera offset at the placement time. These nullable columns store that time
-- per gate; existing rows (and static-camera calibrations) simply leave them null
-- and are treated as frame coordinates.

alter table public.sessions
  add column calibration_point_a_time_s numeric,  -- gate A placement time, seconds
  add column calibration_point_b_time_s numeric;  -- gate B placement time, seconds

alter table public.sessions
  add constraint sessions_cal_point_a_time_nonneg
    check (calibration_point_a_time_s is null or calibration_point_a_time_s >= 0),
  add constraint sessions_cal_point_b_time_nonneg
    check (calibration_point_b_time_s is null or calibration_point_b_time_s >= 0);
