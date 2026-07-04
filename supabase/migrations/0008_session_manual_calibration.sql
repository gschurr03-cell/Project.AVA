-- Day 62: manual ground-based calibration points on a session.
--
-- The coach clicks two points on the overlay video that lie on the ground a
-- known real-world distance apart (e.g. the two ends of a 30 m fly zone) and
-- enters that distance. Those two points + the distance give a direct, high-
-- confidence pixel→metre scale that does not depend on timing, athlete depth, or
-- the whole clip spanning a known distance.
--
-- Points are stored normalized to the source frame (0..1), matching how pose
-- landmarks are stored, so they map to pixels with the session's width/height.
-- All columns are nullable so existing rows are unaffected; the app enforces
-- "set all five together, or none" and that the two points differ.

alter table public.sessions
  add column calibration_point_ax        numeric,  -- point A x, normalized 0..1
  add column calibration_point_ay        numeric,  -- point A y, normalized 0..1
  add column calibration_point_bx        numeric,  -- point B x, normalized 0..1
  add column calibration_point_by        numeric,  -- point B y, normalized 0..1
  add column calibration_known_distance_m numeric; -- known distance A→B, metres

alter table public.sessions
  add constraint sessions_cal_point_ax_range
    check (calibration_point_ax is null or (calibration_point_ax between 0 and 1)),
  add constraint sessions_cal_point_ay_range
    check (calibration_point_ay is null or (calibration_point_ay between 0 and 1)),
  add constraint sessions_cal_point_bx_range
    check (calibration_point_bx is null or (calibration_point_bx between 0 and 1)),
  add constraint sessions_cal_point_by_range
    check (calibration_point_by is null or (calibration_point_by between 0 and 1)),
  add constraint sessions_cal_known_distance_pos
    check (calibration_known_distance_m is null or calibration_known_distance_m > 0);
