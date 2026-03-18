-- Record a swipe and create a mutual match when reciprocal likes exist.
-- This runs server-side so reciprocal swipe checks are not blocked by user RLS.

create or replace function public.record_swipe_and_maybe_match(
  p_target_profile_id uuid,
  p_event_id uuid default null,
  p_mode text default 'community',
  p_decision text default 'like'
)
returns table (
  swipe_recorded boolean,
  match_created boolean,
  match_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_reciprocal_like_exists boolean := false;
  v_low uuid;
  v_high uuid;
  v_match_id uuid := null;
begin
  v_actor := auth.uid();

  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_target_profile_id is null then
    raise exception 'Target profile is required';
  end if;

  if v_actor = p_target_profile_id then
    raise exception 'Cannot swipe on yourself';
  end if;

  if p_mode not in ('community', 'dating') then
    raise exception 'Invalid mode';
  end if;

  if p_decision not in ('like', 'pass') then
    raise exception 'Invalid decision';
  end if;

  begin
    insert into public.swipes (
      actor_profile_id,
      target_profile_id,
      event_id,
      mode,
      decision
    )
    values (
      v_actor,
      p_target_profile_id,
      p_event_id,
      p_mode,
      p_decision
    );
  exception
    when unique_violation then
      null;
  end;

  swipe_recorded := true;
  match_created := false;
  match_id := null;

  if p_decision <> 'like' then
    return next;
    return;
  end if;

  select exists (
    select 1
    from public.swipes s
    where s.actor_profile_id = p_target_profile_id
      and s.target_profile_id = v_actor
      and s.mode = p_mode
      and s.decision = 'like'
      and (
        (p_event_id is null and s.event_id is null)
        or s.event_id = p_event_id
      )
  )
  into v_reciprocal_like_exists;

  if not v_reciprocal_like_exists then
    return next;
    return;
  end if;

  v_low := least(v_actor, p_target_profile_id);
  v_high := greatest(v_actor, p_target_profile_id);

  begin
    insert into public.matches (
      profile_low_id,
      profile_high_id,
      mode,
      event_id
    )
    values (
      v_low,
      v_high,
      p_mode,
      p_event_id
    )
    returning id into v_match_id;

    match_created := true;
    match_id := v_match_id;
  exception
    when unique_violation then
      select m.id
      into v_match_id
      from public.matches m
      where m.profile_low_id = v_low
        and m.profile_high_id = v_high
        and m.mode = p_mode
        and (
          (p_event_id is null and m.event_id is null)
          or m.event_id = p_event_id
        )
      limit 1;

      match_created := false;
      match_id := v_match_id;
  end;

  return next;
end;
$$;

revoke all on function public.record_swipe_and_maybe_match(uuid, uuid, text, text) from public;
grant execute on function public.record_swipe_and_maybe_match(uuid, uuid, text, text) to authenticated;

