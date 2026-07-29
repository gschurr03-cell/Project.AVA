alter table public.athletes
  add column if not exists trochanter_height_m numeric;

alter table public.athletes
  add constraint athletes_trochanter_height_m_range
  check (trochanter_height_m between 0.3 and 1.6);
