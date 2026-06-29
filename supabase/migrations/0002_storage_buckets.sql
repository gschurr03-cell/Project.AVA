-- Storage bucket for uploaded sprint videos. Private: access only through
-- signed URLs or RLS-checked storage policies.
insert into storage.buckets (id, name, public)
values ('sprint-videos', 'sprint-videos', false)
on conflict (id) do nothing;

-- A coach may read/write objects under a path that begins with an athlete id
-- they own: e.g. `sprint-videos/<athlete_id>/<session_id>.mp4`.
create policy "coaches access their athletes' videos"
  on storage.objects for all
  using (
    bucket_id = 'sprint-videos'
    and exists (
      select 1 from public.athletes a
      where a.coach_id = auth.uid()
        and (storage.foldername(name))[1] = a.id::text
    )
  )
  with check (
    bucket_id = 'sprint-videos'
    and exists (
      select 1 from public.athletes a
      where a.coach_id = auth.uid()
        and (storage.foldername(name))[1] = a.id::text
    )
  );
