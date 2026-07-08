-- Optional, display-only anatomical anchor for fly overlay review.
alter table public.sessions
  add column if not exists overlay_trochanter_x numeric,
  add column if not exists overlay_trochanter_y numeric,
  add column if not exists overlay_trochanter_time_s numeric;

alter table public.sessions
  add constraint sessions_overlay_trochanter_x_range check (overlay_trochanter_x between 0 and 1),
  add constraint sessions_overlay_trochanter_y_range check (overlay_trochanter_y between 0 and 1),
  add constraint sessions_overlay_trochanter_time_range check (overlay_trochanter_time_s >= 0);
