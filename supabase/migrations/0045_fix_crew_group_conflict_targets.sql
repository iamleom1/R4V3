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

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_other_profile_id
  ) then
    raise exception 'Crew member not found';
  end if;

  if exists (
    select 1
    from public.blocks b
    where (b.blocker_profile_id = v_uid and b.blocked_profile_id = p_other_profile_id)
       or (b.blocker_profile_id = p_other_profile_id and b.blocked_profile_id = v_uid)
  ) then
    raise exception 'Crew is unavailable for this user';
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
    begin
      insert into public.crew_groups (created_by, direct_pair_key)
      values (v_uid, v_pair_key)
      returning id into v_group_id;
    exception
      when unique_violation then
        select cg.id
        into v_group_id
        from public.crew_groups cg
        where cg.direct_pair_key = v_pair_key
        limit 1;
    end;
  end if;

  insert into public.crew_group_members (group_id, profile_id)
  values (v_group_id, v_uid), (v_group_id, p_other_profile_id)
  on conflict on constraint crew_group_members_pkey do nothing;

  return query
  select cg.id, cg.created_at
  from public.crew_groups cg
  where cg.id = v_group_id;
end;
$$;

grant execute on function public.ensure_direct_crew_group(uuid) to authenticated;

create or replace function public.create_crew_group(
  p_title text,
  p_member_ids uuid[]
)
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
  v_group_id uuid;
  v_created_at timestamptz;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_member_id uuid;
  v_all_member_ids uuid[];
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_all_member_ids := array(
    select distinct member_id
    from unnest(coalesce(p_member_ids, array[]::uuid[]) || array[v_uid]) as member_id
    where member_id is not null
  );

  if coalesce(array_length(v_all_member_ids, 1), 0) < 2 then
    raise exception 'Select at least one other member';
  end if;

  insert into public.crew_groups (created_by, title, direct_pair_key)
  values (v_uid, v_title, null)
  returning id, public.crew_groups.created_at into v_group_id, v_created_at;

  foreach v_member_id in array v_all_member_ids
  loop
    insert into public.crew_group_members (group_id, profile_id)
    values (v_group_id, v_member_id)
    on conflict on constraint crew_group_members_pkey do nothing;
  end loop;

  group_id := v_group_id;
  created_at := v_created_at;
  return next;
end;
$$;

grant execute on function public.create_crew_group(text, uuid[]) to authenticated;
