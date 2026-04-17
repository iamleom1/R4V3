create or replace function public.connect_for_event(
  p_event_id uuid,
  p_target_id uuid
)
returns table (
  matched boolean,
  thread_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_has_reverse boolean := false;
  v_match_id uuid;
  v_low uuid;
  v_high uuid;
  v_recent_count int;
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;

  if p_target_id is null or p_target_id = v_uid then
    raise exception 'invalid_target';
  end if;

  if exists (
    select 1
    from public.blocks b
    where (b.blocker_profile_id = v_uid and b.blocked_profile_id = p_target_id)
      or (b.blocker_profile_id = p_target_id and b.blocked_profile_id = v_uid)
  ) then
    raise exception 'connection_blocked';
  end if;

  select count(*)
  into v_recent_count
  from public.crew_connections c
  where c.requester_id = v_uid
    and c.updated_at >= now() - interval '1 minute';

  if v_recent_count >= 15 then
    raise exception 'rate_limit_minute_exceeded';
  end if;

  select count(*)
  into v_recent_count
  from public.crew_connections c
  where c.requester_id = v_uid
    and c.updated_at >= now() - interval '10 minutes';

  if v_recent_count >= 40 then
    raise exception 'rate_limit_window_exceeded';
  end if;

  insert into public.crew_connections (event_id, requester_id, target_id, status)
  values (p_event_id, v_uid, p_target_id, 'pending')
  on conflict (event_id, requester_id, target_id)
  do update set status = excluded.status, updated_at = now();

  select exists (
    select 1
    from public.crew_connections c
    where c.event_id = p_event_id
      and c.requester_id = p_target_id
      and c.target_id = v_uid
      and c.status in ('pending', 'matched')
  ) into v_has_reverse;

  if v_has_reverse then
    update public.crew_connections
    set status = 'matched', updated_at = now()
    where event_id = p_event_id
      and ((requester_id = v_uid and target_id = p_target_id)
        or (requester_id = p_target_id and target_id = v_uid));

    v_low := least(v_uid, p_target_id);
    v_high := greatest(v_uid, p_target_id);

    insert into public.matches (profile_low_id, profile_high_id, mode, event_id)
    values (v_low, v_high, 'community', p_event_id)
    on conflict (
      profile_low_id,
      profile_high_id,
      mode,
      coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) do nothing
    returning id into v_match_id;

    if v_match_id is null then
      select m.id into v_match_id
      from public.matches m
      where m.profile_low_id = v_low
        and m.profile_high_id = v_high
        and m.mode = 'community'
        and m.event_id = p_event_id
      limit 1;
    end if;

    insert into public.direct_threads (event_id, profile_a, profile_b, thread_id)
    values (p_event_id, v_low, v_high, v_match_id)
    on conflict (event_id, profile_a, profile_b)
    do update set thread_id = excluded.thread_id;

    return query select true, v_match_id, 'matched'::text;
  end if;

  return query select false, null::uuid, 'pending'::text;
end;
$$;

grant execute on function public.connect_for_event(uuid, uuid) to authenticated;
