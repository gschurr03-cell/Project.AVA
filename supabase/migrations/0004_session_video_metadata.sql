-- Day 9: intrinsic video metadata on sessions.
-- These describe the uploaded video itself (invariant across analysis runs), so
-- they live on `sessions`, not `analyses`. The analysis worker extracts them
-- with ffprobe and writes them back via the service role. `fps` already exists
-- (added in 0001) and is populated here for the first time.
--
-- All nullable: existing rows and videos that fail extraction simply stay null.

alter table public.sessions
  add column duration_s  numeric,
  add column width       integer,
  add column height      integer,
  add column codec       text,
  add column size_bytes  bigint;
