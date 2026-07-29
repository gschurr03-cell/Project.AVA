-- The idempotent development seed uses the server-only service role to
-- re-assert local fixture rows. RLS remains enabled for every table.
grant insert, update on table public.profiles to service_role;
grant insert, update on table public.benchmarks to service_role;
grant insert, update on table public.athletes to service_role;
grant delete on table public.analyses to service_role;
grant delete on table public.sessions to service_role;
