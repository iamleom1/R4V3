create table if not exists public.crew_groups (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text,
  direct_pair_key text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.crew_group_members (
  group_id uuid not null references public.crew_groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);

create table if not exists public.crew_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.crew_groups(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists crew_group_members_profile_idx
  on public.crew_group_members (profile_id, created_at desc);

create index if not exists crew_group_messages_group_created_idx
  on public.crew_group_messages (group_id, created_at desc)
  where deleted_at is null;

alter table public.crew_groups enable row level security;
alter table public.crew_group_members enable row level security;
alter table public.crew_group_messages enable row level security;

alter table public.crew_groups force row level security;
alter table public.crew_group_members force row level security;
alter table public.crew_group_messages force row level security;

drop policy if exists "crew_groups_select_member" on public.crew_groups;
create policy "crew_groups_select_member" on public.crew_groups
for select to authenticated
using (
  exists (
    select 1
    from public.crew_group_members cgm
    where cgm.group_id = public.crew_groups.id
      and cgm.profile_id = auth.uid()
  )
);

drop policy if exists "crew_groups_insert_self" on public.crew_groups;
create policy "crew_groups_insert_self" on public.crew_groups
for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists "crew_group_members_select_member" on public.crew_group_members;
create policy "crew_group_members_select_member" on public.crew_group_members
for select to authenticated
using (
  exists (
    select 1
    from public.crew_group_members viewer
    where viewer.group_id = public.crew_group_members.group_id
      and viewer.profile_id = auth.uid()
  )
);

drop policy if exists "crew_group_members_insert_member" on public.crew_group_members;
create policy "crew_group_members_insert_member" on public.crew_group_members
for insert to authenticated
with check (
  exists (
    select 1
    from public.crew_group_members viewer
    where viewer.group_id = public.crew_group_members.group_id
      and viewer.profile_id = auth.uid()
  )
);

drop policy if exists "crew_group_messages_select_member" on public.crew_group_messages;
create policy "crew_group_messages_select_member" on public.crew_group_messages
for select to authenticated
using (
  exists (
    select 1
    from public.crew_group_members cgm
    where cgm.group_id = public.crew_group_messages.group_id
      and cgm.profile_id = auth.uid()
  )
);

drop policy if exists "crew_group_messages_insert_member" on public.crew_group_messages;
create policy "crew_group_messages_insert_member" on public.crew_group_messages
for insert to authenticated
with check (
  sender_profile_id = auth.uid()
  and exists (
    select 1
    from public.crew_group_members cgm
    where cgm.group_id = public.crew_group_messages.group_id
      and cgm.profile_id = auth.uid()
  )
);

create or replace function public.ensure_direct_crew_group(p_other_profile_id uuid)
returns table (
  group_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_pair_key text;
  v_group_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_other_profile_id is null or p_other_profile_id = v_uid then
    raise exception 'Invalid crew member';
  end if;

  v_low := least(v_uid, p_other_profile_id);
  v_high := greatest(v_uid, p_other_profile_id);
  v_pair_key := v_low::text || ':' || v_high::text;

  select cg.id
  into v_group_id
  from public.crew_groups cg
  where cg.direct_pair_key = v_pair_key
  limit 1;

  if v_group_id is null then
    insert into public.crew_groups (created_by, direct_pair_key)
    values (v_uid, v_pair_key)
    returning id into v_group_id;
  end if;

  insert into public.crew_group_members (group_id, profile_id)
  values (v_group_id, v_uid), (v_group_id, p_other_profile_id)
  on conflict (group_id, profile_id) do nothing;

  return query
  select cg.id, cg.created_at
  from public.crew_groups cg
  where cg.id = v_group_id;
end;
$$;

grant execute on function public.ensure_direct_crew_group(uuid) to authenticated;
