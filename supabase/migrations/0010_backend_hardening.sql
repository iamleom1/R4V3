-- Harden messaging, moderation queueing, and maintenance workflows.

create index if not exists messages_sender_created_at_idx
  on public.messages (sender_profile_id, created_at desc)
  where deleted_at is null;

create index if not exists reports_status_created_at_idx
  on public.reports (status, created_at desc);

create index if not exists reports_target_profile_created_at_idx
  on public.reports (target_profile_id, created_at desc);

create index if not exists moderation_queue_priority_created_at_idx
  on public.moderation_queue (priority, created_at asc);

create or replace function public.enforce_message_write_guards()
returns trigger
language plpgsql
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := current_setting('request.jwt.claim.role', true);
  v_match public.matches%rowtype;
  v_other_profile_id uuid;
  v_recent_count int;
begin
  if v_role is distinct from 'service_role' then
    if v_uid is null then
      raise exception 'auth_required';
    end if;

    if new.sender_profile_id <> v_uid then
      raise exception 'sender_mismatch';
    end if;
  end if;

  new.body := btrim(new.body);

  if char_length(new.body) = 0 then
    raise exception 'empty_message';
  end if;

  if char_length(new.body) > 2000 then
    raise exception 'message_too_long';
  end if;

  select *
  into v_match
  from public.matches
  where id = new.match_id;

  if not found then
    raise exception 'match_not_found';
  end if;

  if new.sender_profile_id = v_match.profile_low_id then
    v_other_profile_id := v_match.profile_high_id;
  elsif new.sender_profile_id = v_match.profile_high_id then
    v_other_profile_id := v_match.profile_low_id;
  else
    raise exception 'not_match_participant';
  end if;

  if exists (
    select 1
    from public.blocks b
    where (b.blocker_profile_id = new.sender_profile_id and b.blocked_profile_id = v_other_profile_id)
      or (b.blocker_profile_id = v_other_profile_id and b.blocked_profile_id = new.sender_profile_id)
  ) then
    raise exception 'conversation_blocked';
  end if;

  select count(*)
  into v_recent_count
  from public.messages m
  where m.sender_profile_id = new.sender_profile_id
    and m.deleted_at is null
    and m.created_at >= now() - interval '1 minute';

  if v_recent_count >= 12 then
    raise exception 'rate_limit_minute_exceeded';
  end if;

  select count(*)
  into v_recent_count
  from public.messages m
  where m.sender_profile_id = new.sender_profile_id
    and m.deleted_at is null
    and m.created_at >= now() - interval '10 minutes';

  if v_recent_count >= 60 then
    raise exception 'rate_limit_window_exceeded';
  end if;

  if exists (
    select 1
    from public.messages m
    where m.match_id = new.match_id
      and m.sender_profile_id = new.sender_profile_id
      and m.deleted_at is null
      and m.body = new.body
      and m.created_at >= now() - interval '20 seconds'
  ) then
    raise exception 'duplicate_message';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_enforce_write_guards on public.messages;
create trigger messages_enforce_write_guards
before insert on public.messages
for each row execute function public.enforce_message_write_guards();

create or replace function public.send_match_message(
  p_match_id uuid,
  p_body text
)
returns table (
  id uuid,
  match_id uuid,
  sender_profile_id uuid,
  body text,
  created_at timestamptz
)
language plpgsql
security invoker
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  return query
  insert into public.messages (match_id, sender_profile_id, body)
  values (p_match_id, v_uid, p_body)
  returning
    public.messages.id,
    public.messages.match_id,
    public.messages.sender_profile_id,
    public.messages.body,
    public.messages.created_at;
end;
$$;

grant execute on function public.send_match_message(uuid, text) to authenticated;

create or replace function public.enqueue_report_for_moderation()
returns trigger
language plpgsql
as $$
begin
  insert into public.moderation_queue (report_id, priority)
  values (
    new.id,
    case
      when lower(coalesce(new.category, '')) in ('minor_safety', 'assault', 'harassment', 'stalking', 'violence') then 0
      when lower(coalesce(new.category, '')) in ('spam', 'impersonation', 'hate', 'threat') then 1
      else 2
    end
  )
  on conflict (report_id) do update
    set priority = excluded.priority,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists reports_enqueue_for_moderation on public.reports;
create trigger reports_enqueue_for_moderation
after insert on public.reports
for each row execute function public.enqueue_report_for_moderation();

create or replace function public.create_report(
  p_category text,
  p_details text default null,
  p_target_profile_id uuid default null,
  p_message_id uuid default null,
  p_event_id uuid default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_uid uuid := auth.uid();
  v_report_id uuid;
  v_message_sender_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(btrim(coalesce(p_category, '')), '') is null then
    raise exception 'Category is required';
  end if;

  if p_message_id is not null then
    select m.sender_profile_id
    into v_message_sender_id
    from public.messages m
    join public.matches mt on mt.id = m.match_id
    where m.id = p_message_id
      and m.deleted_at is null
      and (mt.profile_low_id = v_uid or mt.profile_high_id = v_uid);

    if v_message_sender_id is null then
      raise exception 'Message not found or not visible to reporter';
    end if;

    if p_target_profile_id is null then
      p_target_profile_id := v_message_sender_id;
    end if;
  end if;

  insert into public.reports (
    reporter_profile_id,
    target_profile_id,
    message_id,
    event_id,
    category,
    details
  )
  values (
    v_uid,
    p_target_profile_id,
    p_message_id,
    p_event_id,
    btrim(p_category),
    nullif(btrim(coalesce(p_details, '')), '')
  )
  returning id into v_report_id;

  return v_report_id;
end;
$$;

grant execute on function public.create_report(text, text, uuid, uuid, uuid) to authenticated;

create or replace function public.prune_stale_events(
  p_cutoff timestamptz default now() - interval '45 days'
)
returns table (
  deleted_events int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int := 0;
begin
  with doomed as (
    select e.id
    from public.events e
    where coalesce(e.ends_at, e.starts_at) < p_cutoff
      and not exists (select 1 from public.event_rsvps r where r.event_id = e.id)
      and not exists (select 1 from public.matches m where m.event_id = e.id)
      and not exists (select 1 from public.direct_threads dt where dt.event_id = e.id)
      and not exists (select 1 from public.event_rooms er where er.event_id = e.id)
  )
  delete from public.events e
  using doomed d
  where e.id = d.id;

  get diagnostics v_deleted = row_count;

  return query select v_deleted;
end;
$$;
