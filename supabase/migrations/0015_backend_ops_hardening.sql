alter table public.profiles
  add column if not exists is_suspended boolean not null default false,
  add column if not exists suspended_until timestamptz,
  add column if not exists moderation_note text;

drop policy if exists "profiles_select_visible" on public.profiles;
create policy "profiles_select_visible" on public.profiles
for select
to authenticated
using (
  (
    not is_profile_hidden
    and (
      not is_suspended
      or (suspended_until is not null and suspended_until <= now())
    )
  )
  or id = auth.uid()
);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_profile_id uuid not null references public.profiles(id) on delete cascade,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null check (action_type in ('hide_profile', 'unhide_profile', 'suspend_profile', 'unsuspend_profile')),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists moderation_actions_target_created_at_idx
  on public.moderation_actions (target_profile_id, created_at desc);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_name_created_at_idx
  on public.analytics_events (event_name, created_at desc);

create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  message text not null,
  stack text,
  context jsonb not null default '{}'::jsonb,
  is_fatal boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists client_errors_created_at_idx
  on public.client_errors (created_at desc);

create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  status text not null check (status in ('success', 'failure')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists job_runs_name_created_at_idx
  on public.job_runs (job_name, created_at desc);

create table if not exists public.system_alerts (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  unique (category, message, status)
);

create index if not exists system_alerts_status_created_at_idx
  on public.system_alerts (status, created_at desc);

alter table public.moderation_actions enable row level security;
alter table public.analytics_events enable row level security;
alter table public.client_errors enable row level security;
alter table public.job_runs enable row level security;
alter table public.system_alerts enable row level security;

create policy "analytics_events_insert_authenticated" on public.analytics_events
for insert
to authenticated
with check (profile_id is null or profile_id = auth.uid());

create policy "client_errors_insert_authenticated" on public.client_errors
for insert
to authenticated
with check (profile_id is null or profile_id = auth.uid());

create or replace function public.track_client_event(
  p_event_name text,
  p_properties jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_event_id uuid;
begin
  if nullif(trim(coalesce(p_event_name, '')), '') is null then
    raise exception 'event_name_required';
  end if;

  insert into public.analytics_events (profile_id, event_name, properties)
  values (auth.uid(), trim(p_event_name), coalesce(p_properties, '{}'::jsonb))
  returning id into v_event_id;

  return v_event_id;
end;
$$;

grant execute on function public.track_client_event(text, jsonb) to authenticated;

create or replace function public.record_client_error(
  p_message text,
  p_stack text default null,
  p_context jsonb default '{}'::jsonb,
  p_is_fatal boolean default false
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_error_id uuid;
begin
  if nullif(trim(coalesce(p_message, '')), '') is null then
    raise exception 'message_required';
  end if;

  insert into public.client_errors (profile_id, message, stack, context, is_fatal)
  values (
    auth.uid(),
    left(trim(p_message), 500),
    case when p_stack is null then null else left(p_stack, 8000) end,
    coalesce(p_context, '{}'::jsonb),
    coalesce(p_is_fatal, false)
  )
  returning id into v_error_id;

  return v_error_id;
end;
$$;

grant execute on function public.record_client_error(text, text, jsonb, boolean) to authenticated;

create or replace function public.record_job_run(
  p_job_name text,
  p_status text,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if nullif(trim(coalesce(p_job_name, '')), '') is null then
    raise exception 'job_name_required';
  end if;
  if p_status not in ('success', 'failure') then
    raise exception 'invalid_status';
  end if;

  insert into public.job_runs (job_name, status, details)
  values (trim(p_job_name), p_status, coalesce(p_details, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.record_job_run(text, text, jsonb) to authenticated;

create or replace function public.create_system_alert(
  p_category text,
  p_severity text,
  p_message text,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_severity not in ('info', 'warning', 'critical') then
    raise exception 'invalid_severity';
  end if;

  insert into public.system_alerts (category, severity, message, details)
  values (
    trim(coalesce(p_category, 'uncategorized')),
    p_severity,
    trim(coalesce(p_message, 'alert')),
    coalesce(p_details, '{}'::jsonb)
  )
  on conflict (category, message, status)
  do update
    set details = excluded.details
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_system_alert(text, text, text, jsonb) to authenticated;

create or replace function public.resolve_system_alert(
  p_alert_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_moderator() then
    raise exception 'moderator_required';
  end if;

  update public.system_alerts
  set
    status = 'resolved',
    resolved_at = now(),
    resolved_by = auth.uid()
  where id = p_alert_id
    and status = 'open';

  return found;
end;
$$;

grant execute on function public.resolve_system_alert(uuid) to authenticated;

create or replace function public.moderate_profile_action(
  p_target_profile_id uuid,
  p_action_type text,
  p_note text default null,
  p_suspend_until timestamptz default null
)
returns table (
  target_profile_id uuid,
  is_hidden boolean,
  is_suspended boolean,
  suspended_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.is_current_user_moderator() then
    raise exception 'moderator_required';
  end if;

  if p_action_type not in ('hide_profile', 'unhide_profile', 'suspend_profile', 'unsuspend_profile') then
    raise exception 'invalid_action_type';
  end if;

  update public.profiles
  set
    is_profile_hidden = case
      when p_action_type = 'hide_profile' then true
      when p_action_type = 'unhide_profile' then false
      else is_profile_hidden
    end,
    is_suspended = case
      when p_action_type = 'suspend_profile' then true
      when p_action_type = 'unsuspend_profile' then false
      else is_suspended
    end,
    suspended_until = case
      when p_action_type = 'suspend_profile' then p_suspend_until
      when p_action_type = 'unsuspend_profile' then null
      else suspended_until
    end,
    moderation_note = nullif(trim(coalesce(p_note, '')), ''),
    community_mode_enabled = case when p_action_type in ('hide_profile', 'suspend_profile') then false else community_mode_enabled end,
    dating_mode_enabled = case when p_action_type in ('hide_profile', 'suspend_profile') then false else dating_mode_enabled end,
    updated_at = now()
  where id = p_target_profile_id;

  if not found then
    raise exception 'target_profile_not_found';
  end if;

  insert into public.moderation_actions (
    moderator_profile_id,
    target_profile_id,
    action_type,
    note,
    metadata
  )
  values (
    v_uid,
    p_target_profile_id,
    p_action_type,
    nullif(trim(coalesce(p_note, '')), ''),
    case when p_suspend_until is null then '{}'::jsonb else jsonb_build_object('suspended_until', p_suspend_until) end
  );

  return query
  select
    p.id,
    p.is_profile_hidden,
    p.is_suspended,
    p.suspended_until
  from public.profiles p
  where p.id = p_target_profile_id;
end;
$$;

grant execute on function public.moderate_profile_action(uuid, text, text, timestamptz) to authenticated;

create or replace function public.list_system_alerts(
  p_status text default 'open',
  p_limit int default 50
)
returns table (
  alert_id uuid,
  category text,
  severity text,
  status text,
  message text,
  details jsonb,
  created_at timestamptz
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
    a.id,
    a.category,
    a.severity,
    a.status,
    a.message,
    a.details,
    a.created_at
  from public.system_alerts a
  where p_status is null or a.status = p_status
  order by
    case a.severity when 'critical' then 0 when 'warning' then 1 else 2 end,
    a.created_at desc
  limit greatest(coalesce(p_limit, 50), 1);
end;
$$;

grant execute on function public.list_system_alerts(text, int) to authenticated;

create or replace function public.delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = public, auth, storage
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;

  delete from storage.objects
  where bucket_id = 'profile-photos'
    and (
      name like (v_uid::text || '/%')
      or owner = v_uid
    );

  delete from auth.users
  where id = v_uid;

  return found;
end;
$$;

grant execute on function public.delete_my_account() to authenticated;
