create or replace function public.unmatch_conversation(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.matches%rowtype;
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;

  select *
    into v_match
  from public.matches
  where id = p_match_id
    and (profile_low_id = v_uid or profile_high_id = v_uid)
  limit 1;

  if v_match.id is null then
    raise exception 'match_not_found';
  end if;

  if v_match.event_id is not null and v_match.mode = 'community' then
    delete from public.crew_connections
    where event_id = v_match.event_id
      and (
        (requester_id = v_match.profile_low_id and target_id = v_match.profile_high_id)
        or (requester_id = v_match.profile_high_id and target_id = v_match.profile_low_id)
      );
  end if;

  delete from public.matches
  where id = v_match.id;
end;
$$;

grant execute on function public.unmatch_conversation(uuid) to authenticated;
