alter table public.sessions
  add column if not exists pose_engine text not null default 'mediapipe';

alter table public.sessions
  add constraint sessions_pose_engine_valid check (pose_engine in ('mediapipe', 'rtmpose'));
