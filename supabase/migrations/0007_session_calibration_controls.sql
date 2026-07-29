-- Day 61: coach-controlled calibration inputs on a session.
--
-- Two independent controls, both nullable so existing rows are unaffected:
--   * fps_override — the true frame rate, when ffprobe's detected `fps` is wrong.
--     Kept separate from `fps` so the detected value's provenance is preserved
--     and the override is reversible.
--   * calibration zone — a known real-world distance covered between two clip
--     timestamps (e.g. a 30 m fly zone), used for a high-confidence scale and a
--     direct segment velocity. Distinct from `distance_m` (a whole-clip distance).
--
-- Range checks double as unit validation and mirror the app-side bounds
-- (MIN_FPS/MAX_FPS in src/lib/video/fps.ts and the zod schema in the action).

alter table public.sessions
  add column fps_override                numeric,  -- true frame rate override
  add column calibration_zone_start_s    numeric,  -- zone start, seconds
  add column calibration_zone_end_s      numeric,  -- zone end, seconds
  add column calibration_zone_distance_m numeric;  -- known zone distance, metres

alter table public.sessions
  add constraint sessions_fps_override_range
    check (fps_override is null or (fps_override between 1 and 1000)),
  add constraint sessions_cal_zone_start_nonneg
    check (calibration_zone_start_s is null or calibration_zone_start_s >= 0),
  add constraint sessions_cal_zone_end_nonneg
    check (calibration_zone_end_s is null or calibration_zone_end_s >= 0),
  add constraint sessions_cal_zone_distance_pos
    check (calibration_zone_distance_m is null or calibration_zone_distance_m > 0);
