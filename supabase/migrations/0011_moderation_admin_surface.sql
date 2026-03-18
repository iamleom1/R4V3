-- Moderator identity and queue management RPCs.

alter table public.profiles
  add column if not exists is_moderator boolean not null default false;

create index if not exists profiles_is_moderator_idx
  on public.profiles (is_moderator)
  where is_moderator = true;

create or replace function public.is_current_user_moderator()
returns boolean
language sql
security invoker
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_moderator = true
  );
$$;

grant execute on function public.is_current_user_moderator() to authenticated;

create or replace function public.list_moderation_queue(
  p_status text default null,
  p_limit int default 25
)
returns table (
  queue_id uuid,
  report_id uuid,
  priority int,
  queue_status text,
  report_category text,
  report_details text,
  reported_at timestamptz,
  reporter_profile_id uuid,
  reporter_display_name text,
  target_profile_id uuid,
  target_display_name text,
  message_id uuid,
  message_body text,
  assigned_to uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_moderator() then
    raise exception 'moderator_required';
  end if;

  return query
  select
    mq.id as queue_id,
    r.id as report_id,
    mq.priority,
    r.status as queue_status,
    r.category as report_category,
    r.details as report_details,
    r.created_at as reported_at,
    r.reporter_profile_id,
    coalesce(reporter.display_name, 'R4V3 User') as reporter_display_name,
    r.target_profile_id,
    coalesce(target.display_name, 'R4V3 User') as target_display_name,
    r.message_id,
    m.body as message_body,
    mq.assigned_to
  from public.moderation_queue mq
  join public.reports r on r.id = mq.report_id
  left join public.profiles reporter on reporter.id = r.reporter_profile_id
  left join public.profiles target on target.id = r.target_profile_id
  left join public.messages m on m.id = r.message_id
  where p_status is null or r.status = p_status
  order by mq.priority asc, r.created_at asc
  limit greatest(coalesce(p_limit, 25), 1);
end;
$$;

grant execute on function public.list_moderation_queue(text, int) to authenticated;

create or replace function public.update_report_status(
  p_report_id uuid,
  p_status text,
  p_priority int default null
)
returns table (
  report_id uuid,
  status text,
  priority int,
  assigned_to uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_priority int;
begin
  if not public.is_current_user_moderator() then
    raise exception 'moderator_required';
  end if;

  if p_status not in ('queued', 'in_review', 'resolved', 'dismissed') then
    raise exception 'invalid_status';
  end if;

  v_priority := greatest(0, least(coalesce(p_priority, 2), 3));

  update public.reports
  set
    status = p_status,
    reviewed_at = case when p_status in ('resolved', 'dismissed') then now() else null end,
    reviewed_by = case when p_status in ('resolved', 'dismissed') then v_uid else null end
  where id = p_report_id;

  if not found then
    raise exception 'report_not_found';
  end if;

  update public.moderation_queue
  set
    priority = coalesce(p_priority, priority),
    assigned_to = case when p_status = 'queued' then null else v_uid end,
    updated_at = now()
  where report_id = p_report_id;

  return query
  select
    r.id,
    r.status,
    mq.priority,
    mq.assigned_to
  from public.reports r
  join public.moderation_queue mq on mq.report_id = r.id
  where r.id = p_report_id;
end;
$$;

grant execute on function public.update_report_status(uuid, text, int) to authenticated;
