drop function if exists public.list_moderation_queue(text, int);

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
  assigned_to uuid,
  target_is_hidden boolean,
  target_is_suspended boolean,
  target_suspended_until timestamptz
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
    mq.assigned_to,
    coalesce(target.is_profile_hidden, false) as target_is_hidden,
    coalesce(target.is_suspended, false) as target_is_suspended,
    target.suspended_until as target_suspended_until
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

create or replace view public.admin_analytics_event_daily as
select
  date_trunc('day', created_at) as bucket_day,
  event_name,
  count(*)::bigint as total_count,
  count(distinct profile_id)::bigint as unique_profiles
from public.analytics_events
group by 1, 2;

create or replace view public.admin_client_error_daily as
select
  date_trunc('day', created_at) as bucket_day,
  message,
  count(*)::bigint as total_count,
  count(*) filter (where is_fatal)::bigint as fatal_count
from public.client_errors
group by 1, 2;

grant select on public.admin_analytics_event_daily to authenticated;
grant select on public.admin_client_error_daily to authenticated;

create or replace function public.get_admin_analytics_snapshot(
  p_window_hours int default 24
)
returns table (
  total_events bigint,
  unique_event_names bigint,
  total_errors bigint,
  fatal_errors bigint,
  failed_jobs bigint,
  open_alerts bigint,
  last_event_at timestamptz,
  last_error_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window interval := make_interval(hours => greatest(coalesce(p_window_hours, 24), 1));
begin
  if not public.is_current_user_moderator() then
    raise exception 'moderator_required';
  end if;

  return query
  select
    (select count(*)::bigint from public.analytics_events where created_at >= now() - v_window) as total_events,
    (select count(distinct event_name)::bigint from public.analytics_events where created_at >= now() - v_window) as unique_event_names,
    (select count(*)::bigint from public.client_errors where created_at >= now() - v_window) as total_errors,
    (select count(*)::bigint from public.client_errors where created_at >= now() - v_window and is_fatal = true) as fatal_errors,
    (select count(*)::bigint from public.job_runs where created_at >= now() - v_window and status = 'failure') as failed_jobs,
    (select count(*)::bigint from public.system_alerts where status = 'open') as open_alerts,
    (select max(created_at) from public.analytics_events where created_at >= now() - v_window) as last_event_at,
    (select max(created_at) from public.client_errors where created_at >= now() - v_window) as last_error_at;
end;
$$;

grant execute on function public.get_admin_analytics_snapshot(int) to authenticated;

create or replace function public.list_admin_top_events(
  p_window_hours int default 24,
  p_limit int default 8
)
returns table (
  event_name text,
  total_count bigint,
  unique_profiles bigint,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window interval := make_interval(hours => greatest(coalesce(p_window_hours, 24), 1));
begin
  if not public.is_current_user_moderator() then
    raise exception 'moderator_required';
  end if;

  return query
  select
    e.event_name,
    count(*)::bigint as total_count,
    count(distinct e.profile_id)::bigint as unique_profiles,
    max(e.created_at) as last_seen_at
  from public.analytics_events e
  where e.created_at >= now() - v_window
  group by e.event_name
  order by total_count desc, last_seen_at desc
  limit greatest(coalesce(p_limit, 8), 1);
end;
$$;

grant execute on function public.list_admin_top_events(int, int) to authenticated;

create or replace function public.list_admin_recent_errors(
  p_window_hours int default 24,
  p_limit int default 8
)
returns table (
  message text,
  total_count bigint,
  fatal_count bigint,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window interval := make_interval(hours => greatest(coalesce(p_window_hours, 24), 1));
begin
  if not public.is_current_user_moderator() then
    raise exception 'moderator_required';
  end if;

  return query
  select
    e.message,
    count(*)::bigint as total_count,
    count(*) filter (where e.is_fatal)::bigint as fatal_count,
    max(e.created_at) as last_seen_at
  from public.client_errors e
  where e.created_at >= now() - v_window
  group by e.message
  order by last_seen_at desc, total_count desc
  limit greatest(coalesce(p_limit, 8), 1);
end;
$$;

grant execute on function public.list_admin_recent_errors(int, int) to authenticated;
