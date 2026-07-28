-- AVA Coach Workspace: additive organization/team collaboration architecture.
-- Legacy athletes.coach_id ownership remains authoritative and fully supported.

create type public.organization_role as enum ('owner', 'head_coach', 'assistant_coach', 'read_only_staff');
create type public.coach_note_kind as enum ('session', 'technique', 'training', 'competition');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.organization_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  season_label text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.team_coaches (
  team_id uuid not null references public.teams(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  role public.organization_role not null check (role <> 'owner'),
  created_at timestamptz not null default now(),
  primary key (team_id, coach_id)
);

create table public.team_athletes (
  team_id uuid not null references public.teams(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  joined_at timestamptz not null default now(),
  active boolean not null default true,
  primary key (team_id, athlete_id)
);

alter table public.athletes
  add column if not exists photo_url text,
  add column if not exists primary_event text,
  add column if not exists age_group text;

create table public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  kind public.coach_note_kind not null,
  body text not null check (length(trim(body)) between 1 and 5000),
  tags text[] not null default '{}',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coach_note_revisions (
  id bigint generated always as identity primary key,
  note_id uuid not null references public.coach_notes(id) on delete cascade,
  editor_id uuid not null references public.profiles(id),
  body text not null,
  tags text[] not null,
  pinned boolean not null,
  edited_at timestamptz not null default now()
);

create table public.coach_athlete_preferences (
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  favorite boolean not null default false,
  last_viewed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (coach_id, athlete_id)
);

create index organization_memberships_user_idx on public.organization_memberships(user_id);
create index teams_organization_idx on public.teams(organization_id);
create index team_coaches_coach_idx on public.team_coaches(coach_id);
create index team_athletes_athlete_idx on public.team_athletes(athlete_id);
create index coach_notes_athlete_updated_idx on public.coach_notes(athlete_id, updated_at desc);
create index coach_notes_session_idx on public.coach_notes(session_id);
create index coach_note_revisions_note_idx on public.coach_note_revisions(note_id, edited_at desc);
create index coach_preferences_recent_idx on public.coach_athlete_preferences(coach_id, last_viewed_at desc);

create or replace function public.can_access_athlete(p_athlete_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.athletes a where a.id = p_athlete_id and a.coach_id = auth.uid()
  ) or exists (
    select 1
    from public.team_athletes ta
    join public.teams t on t.id = ta.team_id
    join public.organization_memberships om on om.organization_id = t.organization_id
    left join public.team_coaches tc on tc.team_id = t.id and tc.coach_id = auth.uid()
    where ta.athlete_id = p_athlete_id and ta.active
      and om.user_id = auth.uid()
      and (om.role in ('owner', 'head_coach', 'read_only_staff') or tc.coach_id is not null)
  );
$$;

create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_organization_manager(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id and user_id = auth.uid() and role in ('owner', 'head_coach')
  );
$$;

create or replace function public.can_edit_athlete_notes(p_athlete_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.athletes a where a.id = p_athlete_id and a.coach_id = auth.uid()
  ) or exists (
    select 1
    from public.team_athletes ta
    join public.teams t on t.id = ta.team_id
    join public.organization_memberships om on om.organization_id = t.organization_id and om.user_id = auth.uid()
    left join public.team_coaches tc on tc.team_id = t.id and tc.coach_id = auth.uid()
    where ta.athlete_id = p_athlete_id and ta.active
      and (om.role in ('owner', 'head_coach') or tc.role = 'assistant_coach')
  );
$$;

revoke all on function public.can_access_athlete(uuid) from public;
revoke all on function public.can_edit_athlete_notes(uuid) from public;
grant execute on function public.can_access_athlete(uuid) to authenticated;
grant execute on function public.can_edit_athlete_notes(uuid) to authenticated;
revoke all on function public.is_organization_member(uuid) from public;
revoke all on function public.is_organization_manager(uuid) from public;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.is_organization_manager(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.teams enable row level security;
alter table public.team_coaches enable row level security;
alter table public.team_athletes enable row level security;
alter table public.coach_notes enable row level security;
alter table public.coach_note_revisions enable row level security;
alter table public.coach_athlete_preferences enable row level security;

create or replace function public.create_organization_owner_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.organization_memberships(organization_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;
create trigger organizations_add_owner after insert on public.organizations
for each row execute function public.create_organization_owner_membership();

create policy organizations_member_read on public.organizations for select using (
  created_by = auth.uid() or public.is_organization_member(id)
);
create policy organizations_create on public.organizations for insert with check (created_by = auth.uid());
create policy organizations_owner_update on public.organizations for update using (
  public.is_organization_manager(id)
);
create policy memberships_member_read on public.organization_memberships for select using (
  public.is_organization_member(organization_id)
);
create policy memberships_manager_write on public.organization_memberships for all
  using (public.is_organization_manager(organization_id))
  with check (public.is_organization_manager(organization_id));
create policy teams_member_read on public.teams for select using (
  public.is_organization_member(organization_id)
);
create policy teams_manager_write on public.teams for all
  using (public.is_organization_manager(organization_id))
  with check (public.is_organization_manager(organization_id));
create policy team_coaches_member_read on public.team_coaches for select using (
  exists (select 1 from public.teams t join public.organization_memberships om on om.organization_id = t.organization_id where t.id = team_coaches.team_id and om.user_id = auth.uid())
);
create policy team_coaches_manager_write on public.team_coaches for all using (
  exists (select 1 from public.teams t where t.id = team_coaches.team_id and public.is_organization_manager(t.organization_id))
) with check (
  exists (select 1 from public.teams t where t.id = team_coaches.team_id and public.is_organization_manager(t.organization_id))
);
create policy team_athletes_member_read on public.team_athletes for select using (public.can_access_athlete(athlete_id));
create policy team_athletes_manager_write on public.team_athletes for all using (
  exists (select 1 from public.teams t where t.id = team_athletes.team_id and public.is_organization_manager(t.organization_id))
) with check (
  exists (select 1 from public.teams t where t.id = team_athletes.team_id and public.is_organization_manager(t.organization_id))
);

create policy team_athlete_read on public.athletes for select using (public.can_access_athlete(id));
create policy team_session_read on public.sessions for select using (public.can_access_athlete(athlete_id));
create policy team_analysis_read on public.analyses for select using (
  exists (select 1 from public.sessions s where s.id = analyses.session_id and public.can_access_athlete(s.athlete_id))
);

create policy notes_read on public.coach_notes for select using (public.can_access_athlete(athlete_id));
create policy notes_insert on public.coach_notes for insert with check (
  author_id = auth.uid() and public.can_edit_athlete_notes(athlete_id)
);
create policy notes_update on public.coach_notes for update using (
  author_id = auth.uid() and public.can_edit_athlete_notes(athlete_id)
) with check (author_id = auth.uid() and public.can_edit_athlete_notes(athlete_id));
create policy notes_delete on public.coach_notes for delete using (
  author_id = auth.uid() and public.can_edit_athlete_notes(athlete_id)
);
create policy revisions_read on public.coach_note_revisions for select using (
  exists (select 1 from public.coach_notes n where n.id = coach_note_revisions.note_id and public.can_access_athlete(n.athlete_id))
);
create policy preferences_own_all on public.coach_athlete_preferences for all
  using (coach_id = auth.uid() and public.can_access_athlete(athlete_id))
  with check (coach_id = auth.uid() and public.can_access_athlete(athlete_id));

create or replace function public.capture_coach_note_revision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.coach_note_revisions(note_id, editor_id, body, tags, pinned, edited_at)
  values (old.id, auth.uid(), old.body, old.tags, old.pinned, now());
  new.updated_at = now();
  return new;
end;
$$;
create trigger coach_notes_revision_before_update before update on public.coach_notes
for each row execute function public.capture_coach_note_revision();
