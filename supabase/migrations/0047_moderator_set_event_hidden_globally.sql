create or replace function public.moderator_set_event_hidden_globally(
  p_event_id uuid,
  p_is_hidden boolean default true
)
returns table (
  event_id uuid,
  is_hidden boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anchor public.events%rowtype;
begin
  if not public.is_current_user_moderator() then
    raise exception 'moderator_required';
  end if;

  select *
  into v_anchor
  from public.events
  where id = p_event_id;

  if v_anchor.id is null then
    raise exception 'event_not_found';
  end if;

  return query
  with hidden_rows as (
    update public.events e
    set
      is_hidden = coalesce(p_is_hidden, true),
      updated_at = now()
    where lower(trim(e.title)) = lower(trim(v_anchor.title))
      and coalesce(lower(trim(e.city)), '') = coalesce(lower(trim(v_anchor.city)), '')
      and abs(extract(epoch from (e.starts_at - v_anchor.starts_at))) <= 21600
    returning e.id, e.is_hidden
  )
  select hidden_rows.id, hidden_rows.is_hidden
  from hidden_rows;
end;
$$;

grant execute on function public.moderator_set_event_hidden_globally(uuid, boolean) to authenticated;
