create or replace function public.list_crew_group_members(p_group_id uuid)
returns table (
  profile_id uuid,
  display_name text,
  city text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id as profile_id,
    p.display_name,
    p.city
  from public.crew_group_members cgm
  join public.profiles p on p.id = cgm.profile_id
  where cgm.group_id = p_group_id
    and exists (
      select 1
      from public.crew_group_members viewer
      where viewer.group_id = p_group_id
        and viewer.profile_id = auth.uid()
    )
  order by case when p.id = auth.uid() then 0 else 1 end, p.display_name asc nulls last;
$$;

grant execute on function public.list_crew_group_members(uuid) to authenticated;

create or replace function public.add_crew_group_members(
  p_group_id uuid,
  p_member_ids uuid[]
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_inserted_count bigint := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_group_id is null then
    raise exception 'Group is required';
  end if;

  if not exists (
    select 1
    from public.crew_group_members viewer
    where viewer.group_id = p_group_id
      and viewer.profile_id = v_uid
  ) then
    raise exception 'You are not a member of this crew';
  end if;

  foreach v_member_id in array coalesce(p_member_ids, array[]::uuid[])
  loop
    if v_member_id is null or v_member_id = v_uid then
      continue;
    end if;

    if not exists (
      select 1
      from public.profiles p
      where p.id = v_member_id
    ) then
      continue;
    end if;

    if exists (
      select 1
      from public.blocks b
      where (b.blocker_profile_id = v_uid and b.blocked_profile_id = v_member_id)
         or (b.blocker_profile_id = v_member_id and b.blocked_profile_id = v_uid)
    ) then
      continue;
    end if;

    if exists (
      select 1
      from public.crew_group_members existing_member
      where existing_member.group_id = p_group_id
        and existing_member.profile_id = v_member_id
    ) then
      continue;
    end if;

    if not exists (
      select 1
      from public.matches m
      where (m.profile_low_id = v_uid and m.profile_high_id = v_member_id)
         or (m.profile_high_id = v_uid and m.profile_low_id = v_member_id)
    ) then
      continue;
    end if;

    insert into public.crew_group_members (group_id, profile_id)
    values (p_group_id, v_member_id)
    on conflict on constraint crew_group_members_pkey do nothing;

    if found then
      v_inserted_count := v_inserted_count + 1;
    end if;
  end loop;

  return v_inserted_count;
end;
$$;

grant execute on function public.add_crew_group_members(uuid, uuid[]) to authenticated;

create or replace function public.leave_crew_group(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_remaining_members bigint;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_group_id is null then
    raise exception 'Group is required';
  end if;

  delete from public.crew_group_members
  where group_id = p_group_id
    and profile_id = v_uid;

  if not found then
    raise exception 'You are not a member of this crew';
  end if;

  select count(*)
  into v_remaining_members
  from public.crew_group_members cgm
  where cgm.group_id = p_group_id;

  if v_remaining_members = 0 then
    delete from public.crew_groups
    where id = p_group_id;
  end if;

  return true;
end;
$$;

grant execute on function public.leave_crew_group(uuid) to authenticated;
