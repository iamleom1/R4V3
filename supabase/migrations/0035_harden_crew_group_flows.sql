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
  on conflict (group_id, profile_id) do nothing;

  return query
  select cg.id, cg.created_at
  from public.crew_groups cg
  where cg.id = v_group_id;
end;
$$;

create or replace function public.list_crew_groups()
returns table (
  group_id uuid,
  title text,
  created_at timestamptz,
  member_count bigint,
  other_member_names text[],
  last_message_body text,
  last_message_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with my_groups as (
    select cgm.group_id
    from public.crew_group_members cgm
    where cgm.profile_id = auth.uid()
      and not exists (
        select 1
        from public.crew_group_members other_members
        join public.blocks b
          on (
            b.blocker_profile_id = auth.uid() and b.blocked_profile_id = other_members.profile_id
          ) or (
            b.blocker_profile_id = other_members.profile_id and b.blocked_profile_id = auth.uid()
          )
        where other_members.group_id = cgm.group_id
          and other_members.profile_id <> auth.uid()
      )
  ),
  latest_messages as (
    select distinct on (cgm.group_id)
      cgm.group_id,
      cgm.body,
      cgm.created_at
    from public.crew_group_messages cgm
    join my_groups mg on mg.group_id = cgm.group_id
    where cgm.deleted_at is null
    order by cgm.group_id, cgm.created_at desc
  ),
  member_rollup as (
    select
      cgm.group_id,
      count(*) as member_count,
      array_remove(array_agg(case when cgm.profile_id <> auth.uid() then p.display_name else null end), null) as other_member_names
    from public.crew_group_members cgm
    join public.profiles p on p.id = cgm.profile_id
    join my_groups mg on mg.group_id = cgm.group_id
    group by cgm.group_id
  )
  select
    cg.id as group_id,
    cg.title,
    cg.created_at,
    coalesce(mr.member_count, 0) as member_count,
    coalesce(mr.other_member_names, array[]::text[]) as other_member_names,
    lm.body as last_message_body,
    lm.created_at as last_message_at
  from public.crew_groups cg
  join my_groups mg on mg.group_id = cg.id
  left join member_rollup mr on mr.group_id = cg.id
  left join latest_messages lm on lm.group_id = cg.id
  order by coalesce(lm.created_at, cg.created_at) desc;
$$;

grant execute on function public.ensure_direct_crew_group(uuid) to authenticated;
grant execute on function public.list_crew_groups() to authenticated;
