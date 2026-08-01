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
  returning id, public.crew_groups.created_at into v_group_id, created_at;

  foreach v_member_id in array v_all_member_ids
  loop
    insert into public.crew_group_members (group_id, profile_id)
    values (v_group_id, v_member_id)
    on conflict (group_id, profile_id) do nothing;
  end loop;

  group_id := v_group_id;
  return next;
end;
$$;

grant execute on function public.create_crew_group(text, uuid[]) to authenticated;
