-- Storage bucket for generated pose artifacts (the per-analysis PoseSequence
-- JSON that powers the interactive video overlay). Private: access only through
-- signed URLs or RLS-checked storage policies, exactly like sprint-videos.
insert into storage.buckets (id, name, public)
values ('pose-artifacts', 'pose-artifacts', false)
on conflict (id) do nothing;

-- A coach may read/write objects under a path that begins with an athlete id
-- they own: e.g. `pose-artifacts/<athlete_id>/<session_id>/<analysis_id>.pose.json`.
-- Mirrors the sprint-videos policy so ownership is enforced the same way.
create policy "coaches access their athletes' pose artifacts"
  on storage.objects for all
  using (
    bucket_id = 'pose-artifacts'
    and exists (
      select 1 from public.athletes a
      where a.coach_id = auth.uid()
        and (storage.foldername(name))[1] = a.id::text
    )
  )
  with check (
    bucket_id = 'pose-artifacts'
    and exists (
      select 1 from public.athletes a
      where a.coach_id = auth.uid()
        and (storage.foldername(name))[1] = a.id::text
    )
  );
