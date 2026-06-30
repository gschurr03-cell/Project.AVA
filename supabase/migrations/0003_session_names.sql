-- Day 4: session naming.
-- Sessions previously identified videos only by their UUID storage path. Add
-- the original uploaded filename (immutable record) and an editable display
-- name for renaming. Both nullable so existing rows remain valid; the UI shows
-- `name ?? original_filename ?? <storage basename>`.
--
-- No RLS changes: the existing "coaches manage sessions for their athletes"
-- policy is FOR ALL, so UPDATE (rename) and DELETE are already authorized.

alter table public.sessions
  add column original_filename text,
  add column name text;
